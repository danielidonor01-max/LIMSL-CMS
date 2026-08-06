// src/lib/import/legacy.ts
// One-off importers for the three legacy LIMSL workbooks (equipment/calibration
// register, per-machine history log, annual master schedule). Parsing lives in
// ./legacy-parse.ts (pure, DB-free); this half matches parsed rows against the
// live register and writes them. Same contract as ./entities.ts: preview and
// commit run identical validation, rows fail individually, and a re-import
// updates or skips — it never duplicates.
import { db } from "@/lib/db";
import { equipment, calibrationRecords, equipmentLog, maintenanceSchedule, auditLog } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { ACTIVITY_TYPE_LABELS } from "@/lib/constants";
import { summarize, type PreviewRow, type ProcessResult, type ImportAction } from "./entities";
import {
  loadWorkbook,
  normName,
  addDays,
  parseRegisterWorkbook,
  parseHistoryWorkbook,
  parseScheduleWorkbook,
  classifyHistoryText,
  HISTORY_TICK_CATEGORY,
  type LegacyCategoryInfo,
} from "./legacy-parse";

export type LegacyKind = "register" | "history" | "schedule";

export const LEGACY_KINDS: Record<LegacyKind, { title: string }> = {
  register: { title: "Legacy Equipment Register (LIMS Maintenance Log)" },
  history: { title: "Legacy Equipment History Log" },
  schedule: { title: "Legacy Annual Maintenance Schedule" },
};

type Actor = { id?: string; name?: string };

const today = (): string => new Date().toISOString().slice(0, 10);

async function audit(actor: Actor, entity: string, created: number, updated: number) {
  if (!created && !updated) return;
  await db.insert(auditLog).values({
    id: nanoid(),
    userId: actor.id ?? null,
    userName: actor.name || "Admin",
    action: "IMPORT",
    entityType: entity,
    entityId: "-",
    entityDescription: `Imported ${entity}: ${created} created, ${updated} updated`,
  });
}

const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

// Normalized-contains match of a free-text machine name against the register.
// Returns EVERY matching machine: several machines legitimately share a name
// ("Beveling Machine" ×2) and differ only by asset id/serial — the caller
// decides whether multiple hits mean "apply to each" (schedule) or "ambiguous"
// (history, where an event belongs to exactly one machine).
function matchEquipmentByName(
  needle: string,
  all: Array<{ id: string; assetId: string; name: string }>,
): { hits: Array<{ id: string; assetId: string; name: string }>; error?: string } {
  const n = normName(needle);
  if (n.length < 4) return { hits: [], error: `"${needle}" is too short to match an equipment name safely` };
  const exact = all.filter((e) => normName(e.name) === n);
  if (exact.length > 0) return { hits: exact };
  const partial = all.filter((e) => {
    const en = normName(e.name);
    return en.includes(n) || n.includes(en);
  });
  if (partial.length > 0) return { hits: partial };
  return { hits: [], error: `No equipment matches "${needle}"` };
}

const FREQUENCY_MAP: Array<[RegExp, string]> = [
  [/bi[\s-]?monthly/i, "BI_MONTHLY"],
  [/semi[\s-]?annual/i, "SEMI_ANNUAL"],
  [/quat?erly|quarterly/i, "QUARTERLY"],
  [/annual|yearly/i, "ANNUAL"],
  [/monthly/i, "MONTHLY"],
];

function mapFrequency(raw: string): string | null {
  for (const [re, key] of FREQUENCY_MAP) if (re.test(raw)) return key;
  return null;
}

// ── 1. Register ──────────────────────────────────────────────────────────────

async function processRegister(wb: Awaited<ReturnType<typeof loadWorkbook>>, actor: Actor, commit: boolean): Promise<ProcessResult> {
  const parsed = parseRegisterWorkbook(wb);
  const preview: PreviewRow[] = [];
  let created = 0;
  let updated = 0;

  if (parsed.errors.length) {
    preview.push({ row: 1, label: parsed.sheetName, action: "error", errors: parsed.errors });
    return { preview, summary: summarize(preview, 0, 0) };
  }

  const existing = await db
    .select({ id: equipment.id, assetId: equipment.assetId, name: equipment.name })
    .from(equipment);
  const byAsset = new Map(existing.map((e) => [e.assetId.toUpperCase(), e.id]));
  const byName = new Map(existing.map((e) => [normName(e.name), e.id]));
  let maxSys = 0;
  for (const e of existing) {
    const m = e.assetId.match(/^LEE\/SYS\/(\d+)$/i);
    if (m) maxSys = Math.max(maxSys, parseInt(m[1], 10));
  }

  const cals = await db
    .select({ id: calibrationRecords.id, equipmentId: calibrationRecords.equipmentId })
    .from(calibrationRecords);
  const calByEquipment = new Map<string, string>();
  for (const c of cals) if (c.equipmentId && !calByEquipment.has(c.equipmentId)) calByEquipment.set(c.equipmentId, c.id);

  const seenTags = new Set<string>();

  for (const r of parsed.rows) {
    const errors: string[] = [];
    for (const d of [r.calDate, r.calExpire, r.pmServiceDate, r.pmDueDate]) {
      if (d.error) errors.push(d.error);
    }
    if (r.leeTag) {
      if (seenTags.has(r.leeTag)) errors.push(`Duplicate LEE Tag "${r.leeTag}" in file`);
      seenTags.add(r.leeTag);
    }

    // Tag-less rows are the facility systems — matched by name so a re-import
    // finds the LEE/SYS record it created the first time round.
    const existingId = r.leeTag ? byAsset.get(r.leeTag) : byName.get(normName(r.name));
    const action: ImportAction = errors.length ? "error" : existingId ? "update" : "create";
    preview.push({
      row: r.excelRow,
      label: `${r.leeTag || "(new LEE/SYS)"} · ${r.name}`,
      action,
      errors,
    });

    if (!commit || errors.length) continue;
    try {
      const hasCal = !!(r.calDate.iso || r.calExpire.iso);
      const fields = {
        name: r.name,
        oem: r.manufacturer || null,
        model: r.typeModel || null,
        serialNumber: r.serialNumber || null,
        location: r.location || null,
        lastMaintenanceDate: r.pmServiceDate.iso,
        nextMaintenanceDate: r.pmDueDate.iso,
        updatedAt: new Date().toISOString(),
      };
      let equipmentId: string;
      if (existingId) {
        const upd: Record<string, unknown> = { updatedAt: fields.updatedAt };
        for (const [k, v] of Object.entries(fields)) if (v !== null && v !== "") upd[k] = v;
        if (hasCal) upd.requiresCalibration = true;
        await db.update(equipment).set(upd).where(eq(equipment.id, existingId));
        equipmentId = existingId;
        updated++;
      } else {
        equipmentId = nanoid();
        const assetId = r.leeTag || `LEE/SYS/${String(++maxSys).padStart(4, "0")}`;
        await db.insert(equipment).values({
          id: equipmentId,
          assetId,
          category: r.leeTag ? "OTHER" : "SYSTEM",
          requiresCalibration: hasCal,
          ...fields,
        });
        byAsset.set(assetId.toUpperCase(), equipmentId);
        byName.set(normName(r.name), equipmentId);
        created++;
      }

      if (hasCal) {
        const calStatus = r.calExpire.iso && r.calExpire.iso < today() ? "OVERDUE" : "CURRENT";
        const calFields = {
          lastCalibrationDate: r.calDate.iso,
          nextCalibrationDate: r.calExpire.iso,
          status: calStatus,
        };
        const calId = calByEquipment.get(equipmentId);
        if (calId) {
          const upd: Record<string, unknown> = { status: calStatus };
          if (calFields.lastCalibrationDate) upd.lastCalibrationDate = calFields.lastCalibrationDate;
          if (calFields.nextCalibrationDate) upd.nextCalibrationDate = calFields.nextCalibrationDate;
          await db.update(calibrationRecords).set(upd).where(eq(calibrationRecords.id, calId));
        } else {
          const id = nanoid();
          await db.insert(calibrationRecords).values({
            id,
            instrumentName: r.name,
            equipmentId,
            serialNumber: r.serialNumber || null,
            make: r.manufacturer || null,
            model: r.typeModel || null,
            ...calFields,
          });
          calByEquipment.set(equipmentId, id);
        }
      }
    } catch (e) {
      const p = preview[preview.length - 1];
      p.action = "error";
      p.errors.push(`Write failed: ${errMsg(e)}`);
    }
  }

  if (commit) await audit(actor, "equipment (legacy register)", created, updated);
  return { preview, summary: summarize(preview, created, updated) };
}

// ── 2. History ───────────────────────────────────────────────────────────────

async function processHistory(wb: Awaited<ReturnType<typeof loadWorkbook>>, actor: Actor, commit: boolean): Promise<ProcessResult> {
  const sheets = parseHistoryWorkbook(wb);
  const preview: PreviewRow[] = [];
  let created = 0;
  let n = 0;

  const all = await db
    .select({ id: equipment.id, assetId: equipment.assetId, name: equipment.name })
    .from(equipment);
  const byAsset = new Map(all.map((e) => [e.assetId.toUpperCase(), e.id]));

  const logs = await db
    .select({ equipmentId: equipmentLog.equipmentId, occurredAt: equipmentLog.occurredAt, title: equipmentLog.title })
    .from(equipmentLog);
  const dupKey = (equipmentId: string, dateIso: string, title: string) =>
    `${equipmentId}|${dateIso.slice(0, 10)}|${title}`;
  const existingKeys = new Set(logs.map((l) => dupKey(l.equipmentId, l.occurredAt, l.title)));

  for (const sheet of sheets) {
    // Resolve the machine: asset code first, then the form-block description,
    // then the sheet tab (Excel truncates tabs at 31 chars — contains-match
    // absorbs that).
    let equipmentId = sheet.assetCode ? byAsset.get(sheet.assetCode) : undefined;
    const resolveErrors: string[] = [];
    if (!equipmentId) {
      for (const candidate of [sheet.description, sheet.sheetName]) {
        if (!candidate) continue;
        const m = matchEquipmentByName(candidate, all);
        // A history event belongs to exactly ONE machine — a multi-hit name is
        // genuinely ambiguous here (unlike the schedule, which fans out).
        if (m.hits.length === 1) { equipmentId = m.hits[0].id; break; }
        resolveErrors.push(
          m.hits.length > 1
            ? `"${candidate}" matches ${m.hits.length} machines (${m.hits.slice(0, 3).map((e) => e.assetId).join(", ")}) — add the asset code to the sheet to pick one`
            : m.error ?? `No equipment matches "${candidate}"`,
        );
      }
    }

    if (sheet.errors.length || !equipmentId) {
      const errors = [...sheet.errors];
      if (!equipmentId) {
        errors.push(
          sheet.assetCode
            ? `No equipment with asset code "${sheet.assetCode}", and no name match: ${resolveErrors.join("; ") || "none"}`
            : `Sheet has no asset code and no name match: ${resolveErrors.join("; ") || "none"}`,
        );
      }
      preview.push({ row: ++n, label: `${sheet.sheetName} — whole sheet skipped`, action: "error", errors });
      continue;
    }

    for (const row of sheet.rows) {
      const errors: string[] = [];
      if (row.date.error) errors.push(row.date.error);
      const firstTick = row.ticks[0];
      const category = firstTick ? HISTORY_TICK_CATEGORY[firstTick] : classifyHistoryText(row.description);
      const title = (row.description || "Legacy log entry").slice(0, 200);
      const dateIso = row.date.iso ?? "";

      if (!errors.length && existingKeys.has(dupKey(equipmentId, dateIso, title))) {
        errors.push("Already in the machine log — skipped");
      }

      const action: ImportAction = errors.length ? "error" : "create";
      preview.push({
        row: ++n,
        label: `${sheet.sheetName} r${row.excelRow} · ${category} · ${dateIso || "?"}`,
        action,
        errors,
      });
      if (!commit || errors.length) continue;

      try {
        await db.insert(equipmentLog).values({
          id: nanoid(),
          equipmentId,
          category,
          title,
          detail: [row.description, row.remark ? `Remark: ${row.remark}` : ""].filter(Boolean).join("\n") || null,
          source: "AUTO",
          performedByName: "Legacy import",
          occurredAt: dateIso,
          metadata: JSON.stringify({ legacyImport: true, ticks: row.ticks }),
        });
        existingKeys.add(dupKey(equipmentId, dateIso, title));
        created++;
      } catch (e) {
        const p = preview[preview.length - 1];
        p.action = "error";
        p.errors.push(`Write failed: ${errMsg(e)}`);
      }
    }
  }

  if (commit) await audit(actor, "equipment_log (legacy history)", created, 0);
  return { preview, summary: summarize(preview, created, 0) };
}

// ── 3. Schedule ──────────────────────────────────────────────────────────────

// The annual calendar marks with words ("Scheduled", "Compliance Inspection",
// "Corrective"); the quarter sheets mark with the short codes.
const TYPE_MAP: Array<[RegExp, string]> = [
  [/^pm$|preventive|scheduled/i, "PM"],
  [/^cm$|corrective/i, "CM"],
  [/^ins(p)?$|inspection/i, "INS"],
  [/^prs$|preserv/i, "PRS"],
];

function mapActivityType(raw: string): string | null {
  for (const [re, key] of TYPE_MAP) if (re.test(raw.trim())) return key;
  const up = raw.trim().toUpperCase();
  return up in ACTIVITY_TYPE_LABELS ? up : null;
}

// Category names drift between sheets ("Heavy Duty CNC" vs "CNC Maachines
// Heavy Duty") and the S/N ordering drifts too (the quarter sheets swap
// Others/Measuring Instruments) — so match on word overlap first and use the
// S/N only to break ties or as a last resort ("Press Brake…" ↔ "Heavy Duty
// CNC" share no words but share S/N 3).
function matchCategory(sn: string, category: string, categories: LegacyCategoryInfo[]): LegacyCategoryInfo | null {
  const STOP = new Set(["and", "the", "of", "machines", "machine", "systems", "system", "equipments", "equipment", "units", "unit", "hv"]);
  const words = (s: string) =>
    new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !STOP.has(w)));
  const target = words(category);
  const scored = categories.map((c) => {
    let score = 0;
    for (const w of words(c.category)) if (target.has(w)) score++;
    return { c, score };
  });
  const max = Math.max(0, ...scored.map((s) => s.score));
  if (max >= 1) {
    const top = scored.filter((s) => s.score === max);
    if (top.length === 1) return top[0].c;
    return top.find((s) => sn && s.c.sn === sn)?.c ?? null;
  }
  return (sn && categories.find((c) => c.sn === sn)) || null;
}

// When the calendar sheets carry no marks at all, fall back to one
// category-level entry per machine, dated at the next natural occurrence of
// its frequency.
function nextOccurrence(frequency: string | null): string {
  const d = new Date(`${today()}T00:00:00Z`);
  const first = (y: number, m: number) => new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  switch (frequency) {
    case "MONTHLY": return first(y, m + 1);
    case "BI_MONTHLY": return first(y, m + 2);
    case "QUARTERLY": return first(y, Math.floor(m / 3) * 3 + 3);
    case "SEMI_ANNUAL": return first(y, m + 6);
    case "ANNUAL": return first(y + 1, 0);
    default: return first(y, m + 1);
  }
}

async function processSchedule(wb: Awaited<ReturnType<typeof loadWorkbook>>, actor: Actor, commit: boolean): Promise<ProcessResult> {
  const parsed = parseScheduleWorkbook(wb);
  const preview: PreviewRow[] = [];
  let created = 0;
  let updated = 0;
  let n = 0;

  if (parsed.errors.length) {
    preview.push({ row: ++n, label: "Workbook structure", action: "error", errors: parsed.errors });
  }

  const all = await db
    .select({ id: equipment.id, assetId: equipment.assetId, name: equipment.name })
    .from(equipment);
  const existing = await db
    .select({
      id: maintenanceSchedule.id,
      equipmentId: maintenanceSchedule.equipmentId,
      activityType: maintenanceSchedule.activityType,
      plannedDate: maintenanceSchedule.plannedDate,
    })
    .from(maintenanceSchedule);
  const keyOf = (eqId: string, type: string, date: string) => `${eqId}|${type}|${date}`;
  const existingByKey = new Map(existing.map((s) => [keyOf(s.equipmentId, s.activityType, s.plannedDate), s.id]));

  type Entry = {
    equipmentId: string;
    assetId: string;
    plannedDate: string;
    activityType: string;
    taskDescription: string | null;
    frequency: string | null;
    responsible: string | null;
    sourceLabel: string;
  };
  const entries: Entry[] = [];
  const entryKeys = new Set<string>();

  const expand = (
    cat: LegacyCategoryInfo,
    plannedDate: string,
    activityType: string,
    taskDescription: string | null,
    responsible: string | null,
    sourceLabel: string,
  ) => {
    if (cat.assetNames.length === 0) {
      preview.push({
        row: ++n,
        label: `${sourceLabel} · ${cat.category}`,
        action: "error",
        errors: [`Category "${cat.category}" lists no machine names under Asset IDs on the overview sheet`],
      });
      return;
    }
    for (const machineName of cat.assetNames) {
      const m = matchEquipmentByName(machineName, all);
      if (m.hits.length === 0) {
        preview.push({
          row: ++n,
          label: `${sourceLabel} · ${machineName}`,
          action: "error",
          errors: [m.error ?? `No equipment matches "${machineName}"`],
        });
        continue;
      }
      // Several machines legitimately share a name (distinct asset ids/serials);
      // a scheduled activity for that name applies to EVERY one of them.
      for (const hit of m.hits) {
        const key = keyOf(hit.id, activityType, plannedDate);
        if (entryKeys.has(key)) continue;
        entryKeys.add(key);
        entries.push({
          equipmentId: hit.id,
          assetId: hit.assetId,
          plannedDate,
          activityType,
          taskDescription,
          frequency: mapFrequency(cat.frequencyRaw),
          responsible: responsible || cat.responsible || null,
          sourceLabel,
        });
      }
    }
  };

  if (parsed.marks.length > 0) {
    for (const mark of parsed.marks) {
      const src = `${mark.sheetName} r${mark.excelRow}`;
      const errors: string[] = [];
      const activityType = mapActivityType(mark.typeRaw);
      if (!activityType) errors.push(`Unknown activity mark "${mark.typeRaw}" (expected PM, CM, INS or PRS)`);
      if (mark.date.error) errors.push(mark.date.error);
      const cat = matchCategory(mark.sn, mark.category, parsed.categories);
      if (!cat) errors.push(`Category "${mark.category}" has no match on the Asset IDs overview sheet`);
      if (errors.length) {
        preview.push({ row: ++n, label: `${src} · ${mark.category} · ${mark.typeRaw}`, action: "error", errors });
        continue;
      }
      expand(cat!, mark.date.iso!, activityType!, mark.taskDescription || null, mark.responsible || null, src);
    }
  } else if (parsed.categories.length > 0) {
    for (const cat of parsed.categories) {
      const frequency = mapFrequency(cat.frequencyRaw);
      expand(cat, nextOccurrence(frequency), "PM", null, cat.responsible || null, `Overview r${cat.excelRow} (no calendar marks — next ${cat.frequencyRaw || "occurrence"})`);
    }
  }

  for (const e of entries) {
    const existingId = existingByKey.get(keyOf(e.equipmentId, e.activityType, e.plannedDate));
    const action: ImportAction = existingId ? "update" : "create";
    preview.push({
      row: ++n,
      label: `${e.assetId} · ${e.activityType} · ${e.plannedDate}`,
      action,
      errors: [],
    });
    if (!commit) continue;

    try {
      const d = new Date(`${e.plannedDate}T00:00:00Z`);
      const past = e.plannedDate < today();
      const base = {
        equipmentId: e.equipmentId,
        year: d.getUTCFullYear(),
        quarter: Math.floor(d.getUTCMonth() / 3) + 1,
        month: d.getUTCMonth() + 1,
        plannedDate: e.plannedDate,
        activityType: e.activityType,
        taskDescription: e.taskDescription,
        maintenanceFrequency: e.frequency,
        responsiblePersonName: e.responsible,
        status: past ? "COMPLETED" : "SCHEDULED",
        completedDate: past ? e.plannedDate : null,
        remarks: `Imported from legacy schedule (${e.sourceLabel})`,
      };
      if (existingId) {
        await db.update(maintenanceSchedule).set(base).where(eq(maintenanceSchedule.id, existingId));
        updated++;
      } else {
        const id = nanoid();
        await db.insert(maintenanceSchedule).values({ id, ...base });
        existingByKey.set(keyOf(e.equipmentId, e.activityType, e.plannedDate), id);
        created++;
      }
    } catch (err) {
      const p = preview[preview.length - 1];
      p.action = "error";
      p.errors.push(`Write failed: ${errMsg(err)}`);
    }
  }

  if (commit) await audit(actor, "maintenance_schedule (legacy)", created, updated);
  return { preview, summary: summarize(preview, created, updated) };
}

// ── Entry point ──────────────────────────────────────────────────────────────

export async function processLegacyImport(
  kind: LegacyKind,
  data: ArrayBuffer,
  actor: Actor,
  commit: boolean,
): Promise<ProcessResult> {
  let wb: Awaited<ReturnType<typeof loadWorkbook>>;
  try {
    wb = await loadWorkbook(data);
  } catch {
    throw new Error("Could not read the workbook — save it as .xlsx or .xlsm and try again.");
  }
  if (kind === "register") return processRegister(wb, actor, commit);
  if (kind === "history") return processHistory(wb, actor, commit);
  if (kind === "schedule") return processSchedule(wb, actor, commit);
  throw new Error(`Unknown legacy import kind: ${kind}`);
}
