// src/lib/db/apply-batch-work-order.ts
// One work order per PM batch, and one permit for every machine in it
// (LIMSL, 16 Nov 2026). Two nullable columns, additive and idempotent like the
// other apply-* scripts: nothing existing is altered, every statement is
// IF NOT EXISTS, and batches raised before this keep working as they were.
//
//   npx tsx --env-file=.env.local src/lib/db/apply-batch-work-order.ts
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

const STATEMENTS: string[] = [
  `ALTER TABLE pm_batches ADD COLUMN IF NOT EXISTS work_order_number text`,
  `CREATE UNIQUE INDEX IF NOT EXISTS pm_batches_work_order_number_unique ON pm_batches (work_order_number)`,
  `ALTER TABLE permits ADD COLUMN IF NOT EXISTS equipment_ids text`,
];

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Refusing to guess which database to change.");
    process.exit(1);
  }
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
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
