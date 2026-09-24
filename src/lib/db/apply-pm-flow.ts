// src/lib/db/apply-pm-flow.ts
// The schema change behind the PM/CM document flow, written so it can be run
// twice without harm.
//
// Everything here is additive: one new table, and nullable columns on tables
// that already exist. Nothing is dropped, nothing is rewritten, and every
// statement carries IF NOT EXISTS, so running it against a database that has
// already had it does nothing at all. That matters because it is run by hand
// against production, where the cost of a half-applied change is a morning of
// downtime.
//
//   DATABASE_URL=pglite       npx tsx src/lib/db/apply-pm-flow.ts
//   DATABASE_URL=postgres://… npx tsx src/lib/db/apply-pm-flow.ts
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

const STATEMENTS: string[] = [
  // The batch: the job that a group of machines due on the same day forms.
  `CREATE TABLE IF NOT EXISTS pm_batches (
     id                text PRIMARY KEY,
     batch_number      text NOT NULL UNIQUE,
     title             text NOT NULL,
     category          text NOT NULL,
     planned_date      text NOT NULL,
     year              integer NOT NULL,
     activity_type     text NOT NULL DEFAULT 'PM',
     status            text NOT NULL DEFAULT 'PLANNED',
     assigned_to_id    text REFERENCES users(id),
     assigned_to_name  text,
     assigned_by_id    text REFERENCES users(id),
     assigned_by_name  text,
     assigned_at       text,
     assistant_ids     text,
     wms_id            text,
     jha_id            text,
     permit_id         text,
     completed_date    text,
     notes             text,
     created_by        text REFERENCES users(id),
     created_at        text NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
     updated_at        text NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
   )`,

  // What links each document to the batch it belongs to.
  `ALTER TABLE maintenance_schedule ADD COLUMN IF NOT EXISTS batch_id text`,
  `ALTER TABLE work_orders          ADD COLUMN IF NOT EXISTS batch_id text`,
  `ALTER TABLE wms_documents        ADD COLUMN IF NOT EXISTS batch_id text`,
  `ALTER TABLE jha_documents        ADD COLUMN IF NOT EXISTS batch_id text`,
  `ALTER TABLE permits              ADD COLUMN IF NOT EXISTS batch_id text`,

  // The Factory Manager's decision that a reported repair goes ahead.
  `ALTER TABLE corrective_maintenance ADD COLUMN IF NOT EXISTS repair_authorised_at text`,
  `ALTER TABLE corrective_maintenance ADD COLUMN IF NOT EXISTS repair_authorised_by_id text`,
  `ALTER TABLE corrective_maintenance ADD COLUMN IF NOT EXISTS repair_authorised_by_name text`,

  // The queries this actually adds: "what is in this batch" and "which batch
  // is this row in". Both run on every batch screen.
  `CREATE INDEX IF NOT EXISTS work_orders_batch_idx          ON work_orders (batch_id)`,
  `CREATE INDEX IF NOT EXISTS maintenance_schedule_batch_idx ON maintenance_schedule (batch_id)`,
];

export async function applyPmFlow() {
  for (const [i, statement] of STATEMENTS.entries()) {
    const label = statement.trim().split("\n")[0].slice(0, 70);
    try {
      await db.execute(sql.raw(statement));
      console.log(`  ${String(i + 1).padStart(2, "0")}. ok    ${label}`);
    } catch (err) {
      console.error(`  ${String(i + 1).padStart(2, "0")}. FAIL  ${label}`);
      throw err;
    }
  }
  console.log(`\n${STATEMENTS.length} statements applied.\n`);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Refusing to guess which database to change.");
    process.exit(1);
  }
  console.log(`\nApplying the PM/CM flow schema…\n`);
  await applyPmFlow();
  process.exit(0);
}

if (process.argv[1]?.includes("apply-pm-flow")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
