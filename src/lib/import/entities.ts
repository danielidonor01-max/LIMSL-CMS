// src/lib/import/entities.ts
// Per-entity import: validate every row, then (on commit) upsert by a natural key
// so a re-import updates rather than duplicates and never wipes existing data with
// a blank cell. Preview and commit run the SAME validation — the client is never
// trusted to have pre-validated.
import { db } from "@/lib/db";
import { equipment, maintenanceSchedule, users, componentRegistry, auditLog } from "@/lib/db/schema";
import { classifyTag } from "@/lib/diagnostics/extract-tags";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { hashPassword } from "@/lib/password";
import { ROLES, ROLE_DEPARTMENT } from "@/lib/roles";
import { EQUIPMENT_CATEGORY_LABELS, EQUIPMENT_STATUS_LABELS, ACTIVITY_TYPE_LABELS } from "@/lib/constants";
import { field, type Row } from "./parse";

export type EntityKey = "equipment" | "schedule" | "users" | "components";
export type ImportAction = "create" | "update" | "error";
export type PreviewRow = { row: number; label: string; action: ImportAction; errors: string[] };
export type ImportSummary = { total: number; create: number; update: number; error: number; created: number; updated: number };
export type Credential = { email: string; tempPassword: string };
export type ProcessResult = { preview: PreviewRow[]; summary: ImportSummary; credentials?: Credential[] };

type Actor = { id?: string; name?: string };

export const ENTITIES: Record<EntityKey, { title: string; headers: string[]; example: string[] }> = {
  equipment: {
    title: "Equipment Register",
    headers: ["Asset ID", "Name", "Category", "Sub-Category", "Location", "Bay", "OEM", "Model", "Serial Number", "Commissioning Date", "Warranty Expiry", "Status", "Maintenance Frequency", "Criticality"],
    example: ["LEE/PE/0001", "Colchester Lathe", "CNC_LIGHT", "Centre Lathe", "Workshop", "Bay 1", "Colchester", "Master 2500", "SN-12345", "2020-01-15", "2025-01-15", "OPERATIONAL", "MONTHLY", "HIGH"],
  },
  schedule: {
    title: "Maintenance Schedule",
    headers: ["Asset ID", "Planned Date", "Activity Type", "Task Description", "Frequency", "Responsible"],
    example: ["LEE/PE/0001", "2026-08-15", "PM", "Monthly lubrication & belt inspection", "MONTHLY", "John Doe"],
  },
  users: {
    title: "User Roster",
    headers: ["Name", "Email", "Role", "Job Title", "Department", "Phone", "WhatsApp"],
    example: ["John Doe", "john.doe@limsl.com", "TECHNICIAN", "Maintenance Technician", "MAINTENANCE", "+2348030000000", "+2348030000000"],
  },
  components: {
    title: "Component Registry",
    headers: ["Asset ID", "Tag", "Name", "Type", "Location", "Schematic Reference"],
    example: ["LEE/PE/0001", "CB-12", "Circuit Breaker", "ELECTRICAL", "Main Cabinet Panel A", "Sheet 4, Zone C2"],
  },
};

const parseDate = (s: string): string | null => {
  if (!s) return null;
  const d = new Date(/^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

const summarize = (preview: PreviewRow[], created: number, updated: number): ImportSummary => ({
  total: preview.length,
  create: preview.filter((p) => p.action === "create").length,
  update: preview.filter((p) => p.action === "update").length,
  error: preview.filter((p) => p.action === "error").length,
  created,
  updated,
});

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

// ── Equipment ────────────────────────────────────────────────────────────────
async function processEquipment(rows: Row[], actor: Actor, commit: boolean): Promise<ProcessResult> {
  const existing = await db.select().from(equipment);
  const byAsset = new Map(existing.map((e) => [e.assetId.toUpperCase(), e.id]));
  let maxNum = 0;
  for (const e of existing) {
    const m = e.assetId.match(/^LEE\/PE\/(\d+)$/i);
    if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
  }
  const catKeys = new Set(Object.keys(EQUIPMENT_CATEGORY_LABELS));
  const catByLabel = new Map(Object.entries(EQUIPMENT_CATEGORY_LABELS).map(([k, v]) => [v.toLowerCase(), k]));
  const statusKeys = new Set(Object.keys(EQUIPMENT_STATUS_LABELS));
  const critKeys = new Set(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
  const seenAsset = new Set<string>();

  const preview: PreviewRow[] = [];
  let created = 0;
  let updated = 0;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const errors: string[] = [];
    const name = field(r, "Name", "Equipment Name", "Equipment");
    if (!name) errors.push("Name is required");

    let category = field(r, "Category", "Type");
    if (!category) errors.push("Category is required");
    else {
      const up = category.toUpperCase().replace(/[\s/]+/g, "_");
      if (catKeys.has(up)) category = up;
      else if (catByLabel.has(category.toLowerCase())) category = catByLabel.get(category.toLowerCase())!;
      else errors.push(`Unknown category "${category}"`);
    }

    let status = field(r, "Status");
    status = status ? status.toUpperCase().replace(/\s+/g, "_") : "OPERATIONAL";
    if (!statusKeys.has(status)) errors.push(`Unknown status "${status}"`);

    let criticality = field(r, "Criticality");
    criticality = criticality ? criticality.toUpperCase() : "MEDIUM";
    if (!critKeys.has(criticality)) errors.push(`Unknown criticality "${criticality}"`);

    const assetIdRaw = field(r, "Asset ID", "Asset Code", "Asset Tag", "Tag");
    if (assetIdRaw) {
      const key = assetIdRaw.toUpperCase();
      if (seenAsset.has(key)) errors.push(`Duplicate Asset ID "${assetIdRaw}" in file`);
      seenAsset.add(key);
    }

    const existingId = assetIdRaw ? byAsset.get(assetIdRaw.toUpperCase()) : undefined;
    const action: ImportAction = errors.length ? "error" : existingId ? "update" : "create";
    preview.push({ row: i + 2, label: `${assetIdRaw || "(new)"} · ${name || "?"}`, action, errors });

    if (commit && !errors.length) {
      const fields = {
        name,
        category,
        subCategory: field(r, "Sub-Category", "Subcategory", "Sub Category") || null,
        location: field(r, "Location") || null,
        bay: field(r, "Bay") || null,
        oem: field(r, "OEM", "Manufacturer") || null,
        model: field(r, "Model") || null,
        serialNumber: field(r, "Serial Number", "Serial") || null,
        commissioningDate: parseDate(field(r, "Commissioning Date", "Commissioned")),
        warrantyExpiry: parseDate(field(r, "Warranty Expiry", "Warranty")),
        status,
        maintenanceFrequency: (field(r, "Maintenance Frequency", "Frequency") || "").toUpperCase().replace(/\s+/g, "_") || null,
        criticality,
        updatedAt: new Date().toISOString(),
      };
      if (existingId) {
        // Only overwrite with non-empty values so a partial sheet never wipes data.
        const upd: Record<string, unknown> = { updatedAt: fields.updatedAt };
        for (const [k, v] of Object.entries(fields)) if (v !== null && v !== "") upd[k] = v;
        await db.update(equipment).set(upd).where(eq(equipment.id, existingId));
        updated++;
      } else {
        const assetId = assetIdRaw || `LEE/PE/${String(++maxNum).padStart(4, "0")}`;
        await db.insert(equipment).values({ id: nanoid(), assetId, ...fields });
        byAsset.set(assetId.toUpperCase(), "new");
        created++;
      }
    }
  }
  if (commit) await audit(actor, "equipment", created, updated);
  return { preview, summary: summarize(preview, created, updated) };
}

// ── Maintenance schedule ─────────────────────────────────────────────────────
async function processSchedule(rows: Row[], actor: Actor, commit: boolean): Promise<ProcessResult> {
  const equip = await db.select().from(equipment);
  const byAsset = new Map(equip.map((e) => [e.assetId.toUpperCase(), e.id]));
  const existing = await db.select().from(maintenanceSchedule);
  const keyOf = (eqId: string, type: string, date: string) => `${eqId}|${type}|${date}`;
  const existingByKey = new Map(existing.map((s) => [keyOf(s.equipmentId, s.activityType, s.plannedDate), s.id]));
  const activityKeys = new Set(Object.keys(ACTIVITY_TYPE_LABELS));

  const preview: PreviewRow[] = [];
  let created = 0;
  let updated = 0;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const errors: string[] = [];

    const assetIdRaw = field(r, "Asset ID", "Asset Code", "Asset Tag", "Tag");
    const equipmentId = assetIdRaw ? byAsset.get(assetIdRaw.toUpperCase()) : undefined;
    if (!assetIdRaw) errors.push("Asset ID is required");
    else if (!equipmentId) errors.push(`No equipment with Asset ID "${assetIdRaw}"`);

    const plannedDate = parseDate(field(r, "Planned Date", "Date", "Due Date"));
    if (!field(r, "Planned Date", "Date", "Due Date")) errors.push("Planned Date is required");
    else if (!plannedDate) errors.push("Planned Date is not a valid date");

    let activityType = field(r, "Activity Type", "Activity", "Type").toUpperCase();
    if (!activityType) errors.push("Activity Type is required");
    else if (!activityKeys.has(activityType)) errors.push(`Unknown activity type "${activityType}" (use PM, INS, CM or PRS)`);

    const action: ImportAction =
      errors.length || !equipmentId || !plannedDate
        ? "error"
        : existingByKey.has(keyOf(equipmentId, activityType, plannedDate))
          ? "update"
          : "create";
    preview.push({ row: i + 2, label: `${assetIdRaw || "?"} · ${activityType || "?"} · ${plannedDate || "?"}`, action, errors });

    if (commit && action !== "error" && equipmentId && plannedDate) {
      const d = new Date(`${plannedDate}T00:00:00`);
      const base = {
        equipmentId,
        year: d.getFullYear(),
        quarter: Math.floor(d.getMonth() / 3) + 1,
        month: d.getMonth() + 1,
        plannedDate,
        activityType,
        taskDescription: field(r, "Task Description", "Task", "Description") || null,
        maintenanceFrequency: (field(r, "Frequency", "Maintenance Frequency") || "").toUpperCase().replace(/\s+/g, "_") || null,
        responsiblePersonName: field(r, "Responsible", "Responsible Person", "Assigned To") || null,
      };
      const existingId = existingByKey.get(keyOf(equipmentId, activityType, plannedDate));
      if (existingId) {
        await db.update(maintenanceSchedule).set(base).where(eq(maintenanceSchedule.id, existingId));
        updated++;
      } else {
        const id = nanoid();
        await db.insert(maintenanceSchedule).values({ id, status: "SCHEDULED", ...base });
        existingByKey.set(keyOf(equipmentId, activityType, plannedDate), id);
        created++;
      }
    }
  }
  if (commit) await audit(actor, "maintenance_schedule", created, updated);
  return { preview, summary: summarize(preview, created, updated) };
}

// ── User roster ──────────────────────────────────────────────────────────────
async function processUsers(rows: Row[], actor: Actor, commit: boolean): Promise<ProcessResult> {
  const existing = await db.select().from(users);
  const byEmail = new Map(existing.map((u) => [u.email.toLowerCase(), u.id]));
  const roleSet = new Set(ROLES as readonly string[]);
  const seenEmail = new Set<string>();
  const credentials: Credential[] = [];

  const preview: PreviewRow[] = [];
  let created = 0;
  let updated = 0;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const errors: string[] = [];
    const name = field(r, "Name", "Full Name");
    if (!name) errors.push("Name is required");

    const email = field(r, "Email", "Email Address").toLowerCase();
    if (!email) errors.push("Email is required");
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push(`"${email}" is not a valid email`);
    else if (seenEmail.has(email)) errors.push(`Duplicate email "${email}" in file`);
    seenEmail.add(email);

    let role = field(r, "Role").toUpperCase().replace(/[\s-]+/g, "_");
    if (!role) errors.push("Role is required");
    else if (!roleSet.has(role)) errors.push(`Unknown role "${role}"`);

    const existingId = email ? byEmail.get(email) : undefined;
    const action: ImportAction = errors.length ? "error" : existingId ? "update" : "create";
    preview.push({ row: i + 2, label: `${name || "?"} · ${email || "?"} · ${role || "?"}`, action, errors });

    if (commit && !errors.length) {
      const common = {
        name,
        role,
        jobTitle: field(r, "Job Title", "Title") || null,
        department: field(r, "Department") || ROLE_DEPARTMENT[role] || null,
        phone: field(r, "Phone", "Phone Number") || null,
        whatsapp: field(r, "WhatsApp", "Whatsapp", "WhatsApp Number") || null,
      };
      if (existingId) {
        const upd: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(common)) if (v !== null && v !== "") upd[k] = v;
        await db.update(users).set(upd).where(eq(users.id, existingId));
        updated++;
      } else {
        const tempPassword = `Limsl-${nanoid(8)}9!`;
        await db.insert(users).values({
          id: nanoid(),
          email,
          ...common,
          passwordHash: hashPassword(tempPassword),
          isActive: true,
          mustChangePassword: true,
          createdBy: actor.id ?? null,
        });
        credentials.push({ email, tempPassword });
        created++;
      }
    }
  }
  if (commit) await audit(actor, "users", created, updated);
  return { preview, summary: summarize(preview, created, updated), credentials };
}

// ── Component registry ───────────────────────────────────────────────────────
// The no-schematic path: shops that only have a panel component LIST load it
// here; the troubleshooting engine consumes the registry either way.
async function processComponents(rows: Row[], actor: Actor, commit: boolean): Promise<ProcessResult> {
  const equip = await db.select().from(equipment);
  const byAsset = new Map(equip.map((e) => [e.assetId.toUpperCase(), e.id]));
  const existing = await db.select().from(componentRegistry);
  const keyOf = (eqId: string, tag: string) => `${eqId}|${tag.toUpperCase()}`;
  const byKey = new Map(existing.map((c) => [keyOf(c.equipmentId, c.componentTag), c.id]));
  const typeSet = new Set(["ELECTRICAL", "HYDRAULIC", "PNEUMATIC", "CONTROL", "MECHANICAL"]);
  const seen = new Set<string>();

  const preview: PreviewRow[] = [];
  let created = 0;
  let updated = 0;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const errors: string[] = [];

    const assetIdRaw = field(r, "Asset ID", "Asset Code", "Asset Tag");
    const equipmentId = assetIdRaw ? byAsset.get(assetIdRaw.toUpperCase()) : undefined;
    if (!assetIdRaw) errors.push("Asset ID is required");
    else if (!equipmentId) errors.push(`No equipment with Asset ID "${assetIdRaw}"`);

    const tag = field(r, "Tag", "Component Tag", "Designation").toUpperCase();
    if (!tag) errors.push("Tag is required");
    else if (equipmentId) {
      const k = keyOf(equipmentId, tag);
      if (seen.has(k)) errors.push(`Duplicate tag "${tag}" for this machine in file`);
      seen.add(k);
    }

    const guess = tag ? classifyTag(tag) : null;
    const name = field(r, "Name", "Description") || guess?.name || "Component";
    let type = field(r, "Type").toUpperCase().replace(/\s+/g, "_");
    if (!type) type = guess?.type ?? "ELECTRICAL";
    if (!typeSet.has(type)) errors.push(`Unknown type "${type}"`);

    const action: ImportAction =
      errors.length || !equipmentId ? "error" : byKey.has(keyOf(equipmentId, tag)) ? "update" : "create";
    preview.push({ row: i + 2, label: `${assetIdRaw || "?"} · ${tag || "?"} · ${name}`, action, errors });

    if (commit && action !== "error" && equipmentId) {
      const fields = {
        name,
        type,
        location: field(r, "Location") || null,
        schematicReference: field(r, "Schematic Reference", "Schematic Ref", "Sheet") || null,
      };
      const priorId = byKey.get(keyOf(equipmentId, tag));
      if (priorId) {
        const upd: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(fields)) if (v !== null && v !== "") upd[k] = v;
        await db.update(componentRegistry).set(upd).where(eq(componentRegistry.id, priorId));
        updated++;
      } else {
        const id = nanoid();
        await db.insert(componentRegistry).values({
          id,
          equipmentId,
          componentTag: tag,
          status: "OPERATIONAL",
          ...fields,
        });
        byKey.set(keyOf(equipmentId, tag), id);
        created++;
      }
    }
  }
  if (commit) await audit(actor, "component_registry", created, updated);
  return { preview, summary: summarize(preview, created, updated) };
}

export async function processImport(entity: EntityKey, rows: Row[], actor: Actor, commit: boolean): Promise<ProcessResult> {
  if (entity === "equipment") return processEquipment(rows, actor, commit);
  if (entity === "schedule") return processSchedule(rows, actor, commit);
  if (entity === "users") return processUsers(rows, actor, commit);
  if (entity === "components") return processComponents(rows, actor, commit);
  throw new Error(`Unknown import entity: ${entity}`);
}
