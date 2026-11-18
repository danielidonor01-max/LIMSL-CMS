// src/lib/db/backfill-2026.ts
// Enter the 2026 PMs and inspections that were done on paper (LIMSL, 18 Nov 2026).
//
//   npx tsx --env-file=.env.local src/lib/db/backfill-2026.ts           rehearsal
//   npx tsx --env-file=.env.local src/lib/db/backfill-2026.ts --apply   writes it
//
// The rehearsal performs every write inside one transaction and rolls it back,
// so what it reports is what --apply will do. --apply is one transaction too:
// all of it lands, or none.
//
// It signs nothing. Every step of every chain waits for the named person, in
// their own login. CNC Heavy Duty is left for manual handling.
import { db } from "@/lib/db";
import {
  auditLog,
  equipment,
  equipmentLog,
  jhaDocuments,
  maintenanceSchedule,
  permits,
  pmBatches,
  pmChecklists,
  procedureRevisions,
  signoffs,
  users,
  wmsDocuments,
  workOrders,
  assetCategories,
} from "@/lib/db/schema";
import { and, eq, inArray, like, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { chainFor } from "@/lib/signoff/chains";
import { governingProcedure } from "@/lib/maintenance/governing-procedure";
import { expiryDateOf } from "@/lib/hse/permit-validity";
import { applyDerivedStatus } from "@/lib/equipment-status";
import { notify } from "@/lib/notifications";
import {
  BACKFILLED_PERMIT,
  BACKFILL_EXCLUDED_CATEGORIES,
  BACKFILL_TAG,
  backfillNote,
  eligibleForBackfill,
  groupIntoBatches,
  rotateTechnicians,
  type BackfillPlanRow,
} from "@/lib/maintenance/backfill";
import { STANDING_DOCS } from "./backfill-standing-docs";

const APPLY = process.argv.includes("--apply");
const ROLLBACK = "REHEARSAL_ROLLBACK";
const VALIDITY_DAYS = 7;

// The people named for this backfill. Checked against the register before
// anything is written.
const PEOPLE = {
  daniel: { id: "TihU63pTZBakAyUWanD9q", name: "Daniel Idonor", title: "System Owner / Maintenance Technician" },
  ajayi: { id: "7fKkb5dNo0Y9ahgX3PvMt", name: "Ajayi Oluwadamilola" },
  dee: { id: "NYfsRLqn7RnqQdZrCACT3", name: "Dee Forman" },
  osifo: { id: "uLyeSj18uizGSF5tOoCh7", name: "Osifo" },
  leonardo: { id: "Tu6oGYX-oCsbX9Kb6m10s", name: "Leonardo Dante" },
  factory: { id: "zhRbX_3MGiXsiLINO0Q5a", name: "Factory Manager" },
  qaqc: { id: "vNseCkreUUgV8tcbHLE9O", name: "Test_QAQC Mgt" },
};
type Person = { id: string; name: string };

// The crane category already has a working method statement. Its hazard analysis
// is a test entry, so a real one replaces it.
const CRANE_WMS = "B_cPCyD6V24xHYCB_8TCM";
const CRANE_TEST_JHA = "kjkNvvWn_MOiIDUg_h_73";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function nextNumber(tx: Tx, prefix: string): Promise<string> {
  const series = `${prefix}-2026`;
  const res = await tx.execute(sql`
    INSERT INTO doc_counters (series, value) VALUES (${series}, 1)
    ON CONFLICT (series) DO UPDATE SET value = doc_counters.value + 1
    RETURNING value
  `);
  const rows = (Array.isArray(res) ? res : (res as { rows: unknown[] }).rows) as { value: number }[];
  return `${series}-${String(Number(rows[0].value)).padStart(4, "0")}`;
}

// Every step is named to one person, tagged, and waiting. Nothing is signed.
function chainRows(entityType: string, entityId: string, signers: (Person | null)[], tagged = true) {
  const steps = chainFor(entityType);
  if (signers.length !== steps.length) throw new Error(`${entityType}: ${signers.length} signers for ${steps.length} steps`);
  return steps.map((s, i) => ({
    id: nanoid(),
    entityType,
    entityId,
    stepOrder: i + 1,
    role: s.role,
    roleLabel: s.roleLabel,
    required: s.required,
    signerUserId: signers[i]?.id ?? null,
    signerUserName: signers[i]?.name ?? null,
    status: "PENDING" as const,
    comments: tagged && s.required ? BACKFILL_TAG : null,
  }));
}

async function insertInChunks<T>(rows: T[], write: (chunk: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += 200) await write(rows.slice(i, i + 200));
}

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();
  console.log(APPLY ? "APPLYING." : "REHEARSAL: every write is rolled back.");

  const register = await db.select().from(users).where(inArray(users.id, Object.values(PEOPLE).map((p) => p.id)));
  for (const p of Object.values(PEOPLE)) {
    const u = register.find((r: typeof users.$inferSelect) => r.id === p.id);
    if (!u || u.name !== p.name || u.isActive === false) throw new Error(`${p.name} is not an active account.`);
  }

  const already = await db.select({ id: pmBatches.id }).from(pmBatches).where(like(pmBatches.notes, `${BACKFILL_TAG}%`));
  if (already.length > 0) throw new Error(`The backfill has already been entered (${already.length} batches).`);

  const plan = await db
    .select({
      id: maintenanceSchedule.id,
      equipmentId: maintenanceSchedule.equipmentId,
      category: equipment.category,
      plannedDate: maintenanceSchedule.plannedDate,
      activityType: maintenanceSchedule.activityType,
      status: maintenanceSchedule.status,
      batchId: maintenanceSchedule.batchId,
      removedAt: equipment.removedAt,
      taskDescription: maintenanceSchedule.taskDescription,
      remarks: maintenanceSchedule.remarks,
      responsiblePersonId: maintenanceSchedule.responsiblePersonId,
      assetId: equipment.assetId,
      name: equipment.name,
      location: equipment.location,
      lastMaintenanceDate: equipment.lastMaintenanceDate,
    })
    .from(maintenanceSchedule)
    .innerJoin(equipment, eq(maintenanceSchedule.equipmentId, equipment.id));
  type Row = (typeof plan)[number] & BackfillPlanRow;

  const eligible = (plan as Row[]).filter((r) => eligibleForBackfill(r, today));
  const batches = groupIntoBatches(eligible);
  const technicians = rotateTechnicians(batches.map((b) => b.plannedDate), PEOPLE.daniel as Person, PEOPLE.ajayi as Person);

  // The plan still to come takes up the rotation where the backfill leaves it.
  const future = (plan as Row[]).filter(
    (r) =>
      r.status === "SCHEDULED" &&
      r.plannedDate > today &&
      !r.responsiblePersonId &&
      !r.removedAt &&
      (r.activityType === "PM" || r.activityType === "INS") &&
      !BACKFILL_EXCLUDED_CATEGORIES.includes(r.category),
  );
  const futureGroups = [...new Set(future.map((r) => `${r.plannedDate}|${r.category}`))].sort();
  const lastFromJuly = batches.filter((b) => b.plannedDate >= "2026-07-01").length;
  const futureTech = new Map(
    futureGroups.map((key, i) => [key, (lastFromJuly + i) % 2 === 0 ? (PEOPLE.ajayi as Person) : (PEOPLE.daniel as Person)]),
  );

  const labels = new Map(
    (await db.select({ code: assetCategories.code, label: assetCategories.label }).from(assetCategories)).map(
      (c: { code: string; label: string }) => [c.code, c.label],
    ),
  );
  const revisions = await db
    .select({
      id: procedureRevisions.id,
      code: procedureRevisions.code,
      revision: procedureRevisions.revision,
      status: procedureRevisions.status,
      effectiveDate: procedureRevisions.effectiveDate,
    })
    .from(procedureRevisions);
  const machines = await db
    .select({ id: equipment.id, assetId: equipment.assetId, name: equipment.name, category: equipment.category, removedAt: equipment.removedAt })
    .from(equipment);

  const categories = [...new Set(batches.map((b) => b.category))].sort();
  const missing = categories.filter((c) => !STANDING_DOCS[c]);
  if (missing.length) throw new Error(`No standing document drafted for: ${missing.join(", ")}`);

  const counts = { wms: 0, jha: 0, batches: 0, lines: 0, checklists: 0, permits: 0, signatures: 0, futureAssigned: 0 };
  const perSigner = new Map<string, number>();
  const touched = new Set<string>();

  try {
    await db.transaction(async (tx: Tx) => {
      const wmsFor = new Map<string, string>([["CRANE", CRANE_WMS]]);
      const jhaFor = new Map<string, string>();
      const allChains: ReturnType<typeof chainRows> = [];

      // ── Standing documents, one set per category ─────────────────────────
      for (const category of categories) {
        const doc = STANDING_DOCS[category];
        const scope = machines.filter((m: { category: string; removedAt: string | null }) => m.category === category && !m.removedAt);
        const review = `Standing document drafted for the 2026 backfill. Check it against the paper document before signing.`;
        if (!wmsFor.has(category)) {
          const id = nanoid();
          const wmsNumber = await nextNumber(tx, "WMS");
          await tx.insert(wmsDocuments).values({
            id,
            wmsNumber,
            title: `Method statement, preventive maintenance, ${doc.label}`,
            revision: 1,
            category,
            machinesScope: JSON.stringify(scope.map((m: { assetId: string; name: string }) => [m.assetId, m.name].filter(Boolean).join(" "))),
            equipmentIds: JSON.stringify(scope.map((m: { id: string }) => m.id)),
            purpose: `To set out how preventive maintenance and inspection of ${doc.label} is carried out safely and to a consistent standard.`,
            scope: doc.scope,
            mobilization:
              "The Foreman confirms the work order, permit, tools, spares and PPE are in place before work starts, and briefs the team at a toolbox talk.",
            equipmentAndTools: JSON.stringify(doc.tools),
            materials: "[]",
            workProcedureSteps: JSON.stringify(doc.steps),
            hseRequirements:
              "No work starts without an issued Permit to Work. Lock-out / tag-out applies to every energy source. The PPE named in the hazard analysis is mandatory.",
            qualityControlRequirements:
              "A checklist is completed for each machine. Findings and replaced parts are recorded, and defects that remain open are reported.",
            emergencyRequirements:
              "On any incident or unsafe condition: stop work, make the equipment safe, tell the Foreman and HSE, and do not resume until cleared.",
            references: "[]",
            status: "DRAFT",
            preparedById: PEOPLE.dee.id,
            preparedByName: PEOPLE.dee.name,
            preparedDate: today,
            changeSummary: review,
          });
          wmsFor.set(category, id);
          // Named for the Foreman; the managers sign by role, one document at a time.
          allChains.push(...chainRows("WMS", id, chainFor("WMS").map((s) => (s.role === "FOREMAN" ? PEOPLE.dee : null)), false));
          counts.wms += 1;
        }

        const jhaId = nanoid();
        const jhaNumber = await nextNumber(tx, "JHA");
        const isCrane = category === "CRANE";
        await tx.insert(jhaDocuments).values({
          id: jhaId,
          jhaNumber,
          title: `Job hazard analysis, preventive maintenance, ${doc.label}`,
          revision: isCrane ? 2 : 1,
          wmsId: wmsFor.get(category)!,
          category,
          wmsRevision: 1,
          workArea: doc.label,
          steps: JSON.stringify(doc.hazards),
          ppeRequired: JSON.stringify(doc.ppe),
          emergencyArrangements: "Stop work, make safe, raise the alarm, and report to the Foreman and HSE. First aid is at the HSE office.",
          status: "UNDER_REVIEW",
          preparedById: PEOPLE.osifo.id,
          preparedByName: PEOPLE.osifo.name,
          preparedDate: today,
          changeSummary: isCrane ? `${review} Replaces the test entry JHA-2026-0003.` : review,
          supersedesId: isCrane ? CRANE_TEST_JHA : null,
        });
        jhaFor.set(category, jhaId);
        allChains.push(...chainRows("JHA", jhaId, chainFor("JHA").map((s) => (s.role === "FOREMAN" ? PEOPLE.dee : null)), false));
        counts.jha += 1;
      }

      // ── One batch, one permit, a line and a checklist per machine ────────
      for (const [i, b] of batches.entries()) {
        const tech = technicians[i];
        const date = b.plannedDate;
        const note = backfillNote(date);
        const noun = b.activityType === "INS" ? "Inspection" : "PM";
        const label = labels.get(b.category) ?? b.category;
        const batchId = nanoid();
        const permitId = nanoid();
        const batchNumber = await nextNumber(tx, "PMB");
        const workOrderNumber = await nextNumber(tx, "WO");
        const permitNumber = await nextNumber(tx, "PTW");
        const governing = governingProcedure(revisions, date);

        await tx.insert(pmBatches).values({
          id: batchId,
          batchNumber,
          workOrderNumber,
          title: `${noun}, ${label}, ${date}`,
          category: b.category,
          plannedDate: date,
          year: Number(date.slice(0, 4)),
          activityType: b.activityType,
          status: "COMPLETED",
          assignedToId: tech.id,
          assignedToName: tech.name,
          assignedById: PEOPLE.dee.id,
          assignedByName: PEOPLE.dee.name,
          assignedAt: now,
          assistantIds: "[]",
          wmsId: wmsFor.get(b.category)!,
          jhaId: jhaFor.get(b.category)!,
          permitId,
          completedDate: date,
          notes: note,
          createdBy: PEOPLE.dee.id,
        });

        const lines = b.rows.map((r, n) => ({
          id: nanoid(),
          workOrderNumber: `${workOrderNumber}/${n + 1}`,
          type: b.activityType === "INS" ? "INSPECTION" : "PREVENTIVE",
          equipmentId: r.equipmentId,
          scheduleId: r.id,
          batchId,
          priority: "MEDIUM",
          status: "COMPLETED",
          title: `${noun}, ${r.name || r.assetId}`,
          description: r.taskDescription || `Planned ${noun} under batch ${batchNumber}.`,
          plannedDate: date,
          startDate: date,
          completionDate: date,
          technicianId: tech.id,
          technicianName: tech.name,
          assistantIds: "[]",
          supervisorId: PEOPLE.dee.id,
          wmsId: wmsFor.get(b.category)!,
          permitId,
          procedureRevisionId: governing?.id ?? null,
          procedureCode: governing?.code ?? null,
          procedureRevision: governing?.revision ?? null,
          createdBy: PEOPLE.dee.id,
        }));
        await tx.insert(workOrders).values(lines);

        const checklists = lines.map((l) => ({
          id: nanoid(),
          workOrderId: l.id,
          equipmentId: l.equipmentId,
          date,
          visualInspection: "[]",
          functionalTests: "[]",
          lubrication: "[]",
          electricalChecks: "[]",
          observations: note,
          pmCompleted: true,
          technicianName: tech.name,
          supervisorName: PEOPLE.dee.name,
        }));
        await tx.insert(pmChecklists).values(checklists);

        const areas = [...new Set(b.rows.map((r) => r.location).filter(Boolean))].join(", ");
        await tx.insert(permits).values({
          id: permitId,
          permitNumber,
          workOrderId: lines[0].id,
          equipmentId: lines[0].equipmentId,
          equipmentIds: JSON.stringify(lines.map((l) => l.equipmentId)),
          batchId,
          workDescription: `${noun}, ${label}: ${lines.length} machine${lines.length === 1 ? "" : "s"}, batch ${batchNumber}`,
          hazardsIdentified: "As recorded in the hazard analysis linked to this permit.",
          controlMeasures: "As recorded in the hazard analysis linked to this permit.",
          wmsId: wmsFor.get(b.category)!,
          jhaId: jhaFor.get(b.category)!,
          facility: "Factory",
          workArea: areas || label,
          startDate: date,
          validityDays: VALIDITY_DAYS,
          permitDepartment: "HSE",
          additionalRequirements: note,
          issuedById: PEOPLE.osifo.id,
          permitHolderId: PEOPLE.dee.id,
          permitHolderName: PEOPLE.dee.name,
          issuedDate: date,
          expiryDate: expiryDateOf(date, VALIDITY_DAYS),
          status: BACKFILLED_PERMIT,
          closedAt: `${date}T00:00:00.000Z`,
          closureNote: note,
        });

        allChains.push(
          ...chainRows("PM_BATCH", batchId, [PEOPLE.dee, PEOPLE.leonardo]),
          // The Foreman holds the permit, so the site-supervisor block goes to
          // the Factory Manager: one person may not sign two steps of a chain.
          ...chainRows("PERMIT", permitId, [PEOPLE.osifo, PEOPLE.leonardo, PEOPLE.factory, PEOPLE.dee, null]),
          ...chainRows("PERMIT_CLOSEOUT", permitId, [PEOPLE.dee, PEOPLE.osifo]),
          ...checklists.flatMap((c) => chainRows("PM_CHECKLIST", c.id, [tech, PEOPLE.dee, PEOPLE.qaqc, PEOPLE.leonardo])),
        );

        for (const [n, r] of b.rows.entries()) {
          await tx
            .update(maintenanceSchedule)
            .set({
              status: "COMPLETED",
              completedDate: date,
              daysLate: null,
              workOrderId: lines[n].id,
              batchId,
              responsiblePersonId: tech.id,
              responsiblePersonName: tech.name,
              remarks: [r.remarks, note].filter(Boolean).join(" "),
            })
            .where(eq(maintenanceSchedule.id, r.id));
          touched.add(r.equipmentId);
        }

        await insertInChunks(
          lines.map((l) => ({
            id: nanoid(),
            equipmentId: l.equipmentId,
            category: b.activityType === "INS" ? "INSPECTION" : "PM",
            title: `${b.activityType === "INS" ? "Inspection" : "Preventive maintenance"} completed, ${l.workOrderNumber} (backfilled)`,
            detail: note,
            refType: "work_order",
            refId: l.id,
            href: `/work-orders/${l.id}`,
            source: "AUTO",
            performedById: tech.id,
            performedByName: tech.name,
            occurredAt: `${date}T00:00:00Z`,
          })),
          (chunk) => tx.insert(equipmentLog).values(chunk),
        );

        await tx.insert(auditLog).values({
          id: nanoid(),
          userId: PEOPLE.dee.id,
          userName: `${BACKFILL_TAG} script`,
          action: "CREATE",
          entityType: "pm_batch",
          entityId: batchId,
          entityDescription: `${batchNumber} backfilled from the paper record: ${noun}, ${label}, ${date}, ${lines.length} machine(s), work order ${workOrderNumber}, permit ${permitNumber}, carried out by ${tech.name}.`,
        });

        counts.batches += 1;
        counts.lines += lines.length;
        counts.checklists += checklists.length;
        counts.permits += 1;
      }

      await insertInChunks(allChains, (chunk) => tx.insert(signoffs).values(chunk));
      counts.signatures = allChains.filter((s) => s.required).length;
      for (const s of allChains) {
        if (!s.required) continue;
        const who = s.signerUserName ?? `${s.role} (by role)`;
        perSigner.set(who, (perSigner.get(who) ?? 0) + 1);
      }

      // ── The register follows the latest work on each machine ─────────────
      const latest = new Map<string, string>();
      for (const r of eligible) if ((latest.get(r.equipmentId) ?? "") < r.plannedDate) latest.set(r.equipmentId, r.plannedDate);
      const next = new Map<string, string>();
      for (const r of plan as Row[]) {
        if (r.status !== "SCHEDULED" || r.plannedDate <= today) continue;
        const seen = next.get(r.equipmentId);
        if (!seen || r.plannedDate < seen) next.set(r.equipmentId, r.plannedDate);
      }
      for (const [equipmentId, date] of latest) {
        const current = eligible.find((r) => r.equipmentId === equipmentId)?.lastMaintenanceDate ?? "";
        await tx
          .update(equipment)
          .set({
            lastMaintenanceDate: current > date ? current : date,
            ...(next.has(equipmentId) ? { nextMaintenanceDate: next.get(equipmentId) } : {}),
            updatedAt: now,
          })
          .where(eq(equipment.id, equipmentId));
      }

      // ── The rotation carries on over the plan still to come ──────────────
      for (const r of future) {
        const tech = futureTech.get(`${r.plannedDate}|${r.category}`)!;
        await tx
          .update(maintenanceSchedule)
          .set({ responsiblePersonId: tech.id, responsiblePersonName: tech.name })
          .where(and(eq(maintenanceSchedule.id, r.id), eq(maintenanceSchedule.status, "SCHEDULED")));
        counts.futureAssigned += 1;
      }

      if (!APPLY) throw new Error(ROLLBACK);
    });
  } catch (err) {
    if (!(err instanceof Error && err.message === ROLLBACK)) throw err;
    console.log("Rolled back: nothing was written.");
  }

  const months = new Map<string, number>();
  for (const [i, b] of batches.entries()) {
    const key = `${b.plannedDate.slice(0, 7)} ${technicians[i].name}`;
    months.set(key, (months.get(key) ?? 0) + 1);
  }
  console.log("\nRecords");
  console.log(`  plan rows cleared   ${eligible.length} (${eligible.filter((r) => r.activityType === "PM").length} PM, ${eligible.filter((r) => r.activityType === "INS").length} inspections)`);
  for (const [k, v] of Object.entries(counts)) console.log(`  ${k.padEnd(19)} ${v}`);
  console.log("\nBatches by month and technician");
  for (const [k, v] of [...months].sort()) console.log(`  ${k}: ${v}`);
  console.log("\nSignatures waiting, by person");
  for (const [k, v] of [...perSigner].sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`);
  const left = (plan as Row[]).filter((r) => r.status === "OVERDUE" && (r.activityType === "PM" || r.activityType === "INS") && !eligibleForBackfill(r, today));
  const leftBy = new Map<string, number>();
  for (const r of left) leftBy.set(r.category, (leftBy.get(r.category) ?? 0) + 1);
  console.log("\nOverdue rows left alone:", [...leftBy].map(([k, v]) => `${k} ${v}`).join(", "));

  if (APPLY) {
    for (const id of touched) {
      try {
        await applyDerivedStatus(id);
      } catch (err) {
        console.warn("status derivation failed for", id, err);
      }
    }
    // One message each, not one per record.
    const named = [PEOPLE.daniel, PEOPLE.ajayi, PEOPLE.dee, PEOPLE.osifo, PEOPLE.leonardo, PEOPLE.factory, PEOPLE.qaqc];
    for (const p of named) {
      const n = perSigner.get(p.name) ?? 0;
      if (n === 0) continue;
      try {
        await notify({
          event: "GENERAL",
          title: "PMs from the paper file are ready for your signature",
          body: `The 2026 PMs and inspections done on paper have been entered. About ${n} signatures are yours. Check them against the paper file, then sign them together in My Approvals.`,
          linkPath: "/approvals",
          relatedEntityType: "pm_batch",
          relatedEntityId: BACKFILL_TAG,
          userIds: [p.id],
        });
      } catch (err) {
        console.warn("notify failed for", p.name, err);
      }
    }
    console.log("\nDone.");
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
