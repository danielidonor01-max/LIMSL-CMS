// src/lib/db/apply-troubleshooting.ts
// Switches on the Troubleshooting module (27 Nov 2026): ties each diagnosis
// session to the breakdown it diagnoses and records how it ended. Additive and
// idempotent: four nullable columns and an index, nothing existing changes.
// Sessions from before keep their status and simply have no breakdown or
// outcome, which the module shows as "not linked".
//
// Report only by default; --apply writes.
//   npx tsx --env-file=.env.local src/lib/db/apply-troubleshooting.ts
//   npx tsx --env-file=.env.local src/lib/db/apply-troubleshooting.ts --apply
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

const APPLY = process.argv.includes("--apply");
const COLUMNS = ["corrective_id", "outcome", "closed_at", "closed_by_name"];

const rowsOf = (res: unknown): Record<string, unknown>[] =>
  (Array.isArray(res) ? res : ((res as { rows?: unknown[] }).rows ?? [])) as Record<string, unknown>[];

async function main() {
  const have = new Set(
    rowsOf(
      await db.execute(sql`
        select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'diagnosis_sessions'`),
    ).map((r) => String(r.column_name)),
  );
  const missing = COLUMNS.filter((c) => !have.has(c));
  console.log(missing.length ? `Columns to add to diagnosis_sessions: ${missing.join(", ")}` : "All columns already present.");
  if (!APPLY) {
    console.log("Report only. Run again with --apply to add them.");
    return;
  }
  for (const c of missing) await db.execute(sql.raw(`alter table diagnosis_sessions add column if not exists ${c} text`));
  await db.execute(sql.raw(`create index if not exists diagnosis_sessions_corrective_idx on diagnosis_sessions (corrective_id)`));
  console.log("Done. Troubleshooting is switched on.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("FAILED:", (e as Error).message);
    process.exit(1);
  });
