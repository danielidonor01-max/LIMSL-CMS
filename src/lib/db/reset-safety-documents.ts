// src/lib/db/reset-safety-documents.ts
// Clearing the safety paperwork and putting the year's PM plan back to square
// one, so LIMSL's own people fill it in.
//
// The method statements, hazard analyses and permits that exist today were
// written before anything joined them together. They point at no batch, they
// were not raised in sequence, and several authorise work that no longer means
// anything. Keeping them would leave the audit trail claiming a chain that was
// never walked, which is worse than having no documents at all.
//
// So they go, and the 2026 plan goes back to pending and overdue. What does NOT
// go: work orders, breakdown records, equipment, spares and the audit log. The
// audit log especially — the record that these documents existed and were
// deleted is itself evidence, and this writes its own line saying so.
//
//   DATABASE_URL=... npx tsx src/lib/db/reset-safety-documents.ts --dry-run
//   DATABASE_URL=... npx tsx src/lib/db/reset-safety-documents.ts
import { db } from "@/lib/db";
import {
  permits,
  jhaDocuments,
  wmsDocuments,
  signoffs,
  notifications,
  workOrders,
  pmBatches,
  maintenanceSchedule,
  auditLog,
} from "@/lib/db/schema";
import { sql, eq, and, inArray, gte, lte } from "drizzle-orm";
import { nanoid } from "nanoid";

// The year whose plan is being reset, and the day that divides overdue from
// still-to-come.
const YEAR = Number(process.env.RESET_YEAR ?? new Date().getFullYear());
const TODAY = new Date().toISOString().slice(0, 10);

// Rows in these tables hang off a permit and have no meaning without it.
// Discovered rather than listed, for the same reason the account prune
// discovers its own: a hand-written list is a list that is already out of date,
// and here the failure mode is a foreign-key error at 2am on production.
async function columnsReferencing(table: string): Promise<{ table: string; column: string }[]> {
  const res = await db.execute(sql`
    select con.conrelid::regclass::text as table_name,
           att.attname                  as column_name
      from pg_constraint con
      join pg_attribute att
        on att.attrelid = con.conrelid
       and att.attnum = any(con.conkey)
     where con.contype = 'f'
       and con.confrelid = ${sql.raw(`'${table}'::regclass`)}
  `);
  const rows = (Array.isArray(res) ? res : ((res as { rows?: unknown[] }).rows ?? [])) as {
    table_name: string;
    column_name: string;
  }[];
  return rows.map((r) => ({ table: r.table_name, column: r.column_name }));
}

export async function resetSafetyDocuments({ dryRun = false }: { dryRun?: boolean } = {}) {
  const permitRows = await db.select({ id: permits.id, n: permits.permitNumber }).from(permits);
  const jhaRows = await db.select({ id: jhaDocuments.id, n: jhaDocuments.jhaNumber }).from(jhaDocuments);
  const wmsRows = await db.select({ id: wmsDocuments.id, n: wmsDocuments.wmsNumber }).from(wmsDocuments);

  const permitIds = permitRows.map((r) => r.id);
  const jhaIds = jhaRows.map((r) => r.id);
  const wmsIds = wmsRows.map((r) => r.id);

  console.log(`\nSafety documents to remove`);
  console.log(`  permits ............ ${permitRows.length}`);
  console.log(`  hazard analyses .... ${jhaRows.length}`);
  console.log(`  method statements .. ${wmsRows.length}`);

  // The 2026 plan, and what it will be set to.
  const planned = await db
    .select({ id: maintenanceSchedule.id, d: maintenanceSchedule.plannedDate, s: maintenanceSchedule.status })
    .from(maintenanceSchedule)
    .where(
      and(
        gte(maintenanceSchedule.plannedDate, `${YEAR}-01-01`),
        lte(maintenanceSchedule.plannedDate, `${YEAR}-12-31`),
      ),
    );
  const toOverdue = planned.filter((r) => r.d <= TODAY);
  const toScheduled = planned.filter((r) => r.d > TODAY);

  console.log(`\n${YEAR} maintenance plan (${planned.length} activities)`);
  console.log(`  -> OVERDUE (on or before ${TODAY}) .. ${toOverdue.length}`);
  console.log(`  -> SCHEDULED (still to come) ....... ${toScheduled.length}`);

  const dependants = [
    ...(await columnsReferencing("permits")),
    ...(await columnsReferencing("jha_documents")),
    ...(await columnsReferencing("wms_documents")),
  ].filter((d) => !["permits", "jha_documents", "wms_documents"].includes(d.table));

  if (dependants.length) {
    console.log(`\nColumns pointing at these documents, to be cleared first:`);
    for (const d of dependants) console.log(`  ${d.table}.${d.column}`);
  }

  if (dryRun) {
    console.log(`\n--dry-run: nothing was written.\n`);
    return { permits: permitRows.length, jha: jhaRows.length, wms: wmsRows.length, planned: planned.length };
  }

  // ── Clear the references, then delete ─────────────────────────────────────
  // Anything that merely POINTS at a permit is set to null rather than deleted.
  // A work order that once carried a permit is still a real work order; losing
  // it would take maintenance history with it.
  for (const d of dependants) {
    await db.execute(sql.raw(`update ${d.table} set ${d.column} = null where ${d.column} is not null`));
  }

  // Sign-off rows belong to the document they sign. With the document gone they
  // are signatures on nothing.
  const signoffTypes = ["PERMIT", "PERMIT_CLOSEOUT", "JHA", "WMS"];
  const docIds = [...permitIds, ...jhaIds, ...wmsIds];
  if (docIds.length) {
    await db
      .delete(signoffs)
      .where(and(inArray(signoffs.entityType, signoffTypes), inArray(signoffs.entityId, docIds)));
  }

  // And the notifications asking somebody to sign them, which would otherwise
  // sit in an inbox linking to a 404 for the rest of the year.
  if (docIds.length) {
    await db
      .delete(notifications)
      .where(
        and(
          inArray(notifications.relatedEntityType, ["permit", "jha", "wms"]),
          inArray(notifications.relatedEntityId, docIds),
        ),
      );
  }

  await db.delete(permits);
  await db.delete(jhaDocuments);
  await db.delete(wmsDocuments);

  // Batches lose the documents they were carrying, so they go back to being an
  // assignment waiting for a method statement.
  await db.update(pmBatches).set({ wmsId: null, jhaId: null, permitId: null, status: "PLANNED" });

  // Work orders keep existing; they just no longer claim paperwork that is gone.
  await db.update(workOrders).set({ wmsId: null, permitId: null });

  // ── The plan goes back to pending and overdue ────────────────────────────
  if (toOverdue.length) {
    await db
      .update(maintenanceSchedule)
      .set({ status: "OVERDUE", completedDate: null, daysLate: null })
      .where(inArray(maintenanceSchedule.id, toOverdue.map((r) => r.id)));
  }
  if (toScheduled.length) {
    await db
      .update(maintenanceSchedule)
      .set({ status: "SCHEDULED", completedDate: null, daysLate: null })
      .where(inArray(maintenanceSchedule.id, toScheduled.map((r) => r.id)));
  }

  // The deletion is itself an event worth being able to point at later.
  await db.insert(auditLog).values({
    id: nanoid(),
    userId: null,
    userName: "System",
    action: "DELETE",
    entityType: "wms",
    entityId: null,
    entityDescription:
      `Safety document reset: removed ${permitRows.length} permit(s), ${jhaRows.length} hazard ` +
      `analysis/analyses and ${wmsRows.length} method statement(s), and set the ${YEAR} plan to ` +
      `${toOverdue.length} overdue and ${toScheduled.length} scheduled. Work orders, breakdown ` +
      `records and this log were left intact.`,
  });

  console.log(`\nDone. The register is clear and the ${YEAR} plan is pending.\n`);
  return { permits: permitRows.length, jha: jhaRows.length, wms: wmsRows.length, planned: planned.length };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Refusing to guess which database to clear.");
    process.exit(1);
  }
  await resetSafetyDocuments({ dryRun });
  process.exit(0);
}

if (process.argv[1]?.includes("reset-safety-documents")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
