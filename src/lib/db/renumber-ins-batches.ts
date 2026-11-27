// src/lib/db/renumber-ins-batches.ts
// Gives inspection batches raised before 27 Nov 2026 their own numbers.
//
// Every batch used to draw from the PMB series, so an inspection round read
// as a PM batch (PMB-2026-0009). New ones are numbered INS-YYYY-NNNN
// (lib/maintenance/pm-batch.ts, batchSeries). This brings the old ones into
// line, approved by LIMSL on 27 Nov 2026.
//
// What changes, per batch, in one transaction:
//   - pm_batches.batch_number                       PMB-2026-0009 -> INS-2026-0001
//   - the old number where it appears in the text of the batch's own work
//     orders and machine-history lines
//   - the INS counter, so the next inspection batch continues after these
// What does NOT change:
//   - permits. A permit's description is part of its tamper seal
//     (lib/signoff/seal.ts), so rewriting "PMB-2026-0009" in it would make a
//     signed permit read as altered. It keeps the words it was signed with.
//   - the audit log and notifications: they record what was true when they
//     were written. Each renumbering adds its own audit line with both numbers.
//   - work order numbers (WO-2026-0039/1 ...): those are the work order series.
//
// Report only by default; --apply writes.
//   npx tsx --env-file=.env.local src/lib/db/renumber-ins-batches.ts
//   npx tsx --env-file=.env.local src/lib/db/renumber-ins-batches.ts --apply
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { nanoid } from "nanoid";

const APPLY = process.argv.includes("--apply");

const rowsOf = (res: unknown): Record<string, unknown>[] =>
  (Array.isArray(res) ? res : ((res as { rows?: unknown[] }).rows ?? [])) as Record<string, unknown>[];

type BatchRow = { id: string; batch_number: string; planned_date: string; created_at: string; category: string; status: string };

async function main() {
  const batches = rowsOf(
    await db.execute(sql`
      select id, batch_number, planned_date, created_at, category, status
      from pm_batches
      where activity_type = 'INS' and batch_number like 'PMB-%'
      order by planned_date, created_at, batch_number`),
  ) as BatchRow[];
  if (batches.length === 0) {
    console.log("No inspection batch carries a PMB number. Nothing to do.");
    return;
  }

  // Numbers already issued in the INS series, by year. If any exist, the old
  // batches would be numbered after newer ones, which reads backwards; stop
  // and say so rather than guess.
  const existing = rowsOf(await db.execute(sql`select batch_number from pm_batches where batch_number like 'INS-%'`));
  if (existing.length > 0) {
    console.log(`INS numbers already exist (${existing.map((r) => r.batch_number).join(", ")}). Stopping: decide the order first.`);
    process.exitCode = 1;
    return;
  }

  const next = new Map<string, number>();
  const plan = batches.map((b) => {
    const year = String(b.planned_date).slice(0, 4);
    const n = (next.get(year) ?? 0) + 1;
    next.set(year, n);
    return { ...b, from: String(b.batch_number), to: `INS-${year}-${String(n).padStart(4, "0")}` };
  });

  let woText = 0;
  let permitText = 0;
  let logText = 0;
  for (const p of plan) {
    const like = `%${p.from}%`;
    woText += Number(rowsOf(await db.execute(sql`select count(*)::int n from work_orders where batch_id = ${p.id} and description like ${like}`))[0]?.n ?? 0);
    permitText += Number(rowsOf(await db.execute(sql`select count(*)::int n from permits where batch_id = ${p.id} and work_description like ${like}`))[0]?.n ?? 0);
    logText += Number(rowsOf(await db.execute(sql`select count(*)::int n from equipment_log where title like ${like} or detail like ${like}`))[0]?.n ?? 0);
  }

  console.log(`${plan.length} inspection batches to renumber:`);
  for (const p of plan) console.log(`  ${p.from} -> ${p.to}   ${p.category}, ${p.planned_date}, ${p.status}`);
  console.log(`Text mentions to update: ${woText} work order descriptions, ${logText} machine-history lines.`);
  console.log(`Left as signed: ${permitText} permit descriptions that name the old number (sealed).`);
  console.log(`INS counters afterwards: ${[...next].map(([y, n]) => `INS-${y} = ${n}`).join(", ")}`);

  if (!APPLY) {
    console.log("\nReport only. Run again with --apply to make these changes.");
    return;
  }

  await db.transaction(async (tx) => {
    for (const p of plan) {
      await tx.execute(sql`update pm_batches set batch_number = ${p.to}, updated_at = ${new Date().toISOString()} where id = ${p.id}`);
      await tx.execute(sql`update work_orders set description = replace(description, ${p.from}, ${p.to}) where batch_id = ${p.id} and description like ${`%${p.from}%`}`);
      await tx.execute(sql`update equipment_log set title = replace(title, ${p.from}, ${p.to}), detail = replace(detail, ${p.from}, ${p.to}) where title like ${`%${p.from}%`} or detail like ${`%${p.from}%`}`);
      await tx.execute(sql`
        insert into audit_log (id, user_name, action, entity_type, entity_id, entity_description, changes)
        values (${nanoid()}, ${"System (renumber-ins-batches)"}, ${"RENUMBER"}, ${"pm_batch"}, ${p.id},
                ${`${p.from} renumbered ${p.to}: inspection rounds have their own series (approved by LIMSL, 27 Nov 2026)`},
                ${JSON.stringify({ batchNumber: { from: p.from, to: p.to } })})`);
    }
    for (const [year, n] of next) {
      const series = `INS-${year}`;
      await tx.execute(sql`
        insert into doc_counters (series, value) values (${series}, ${n})
        on conflict (series) do update set value = ${n} where doc_counters.value < ${n}`);
    }
  });
  console.log(`\nDone. ${plan.length} batches renumbered, each with an audit line.`);
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((e) => {
    const err = e as Error & { cause?: { message?: string; code?: string } };
    console.error("FAILED, nothing was changed:", err.message.split("\n")[0], "| cause:", err.cause?.code ?? "", err.cause?.message ?? "");
    process.exit(1);
  });
