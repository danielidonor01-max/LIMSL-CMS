// src/lib/db/apply-premob-verification.ts
// The two tables behind the Premob and Verification tabs of the calibration
// module. Additive and idempotent, like apply-pm-flow.ts: two new tables and
// their indexes, every statement IF NOT EXISTS, nothing existing is altered.
//
//   DATABASE_URL=postgres://… npx tsx src/lib/db/apply-premob-verification.ts
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

const NOW = `to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`;

const STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS premob_records (
     id                 text PRIMARY KEY,
     equipment_id       text NOT NULL REFERENCES equipment(id),
     premob_date        text NOT NULL,
     vendor             text NOT NULL,
     next_due_date      text NOT NULL,
     certificate_number text,
     proof_file_key     text NOT NULL,
     proof_file_name    text,
     proof_mime_type    text,
     notes              text,
     recorded_by_id     text,
     recorded_by_name   text,
     created_at         text NOT NULL DEFAULT ${NOW}
   )`,
  `CREATE INDEX IF NOT EXISTS premob_records_equipment_idx ON premob_records (equipment_id, premob_date)`,
  `CREATE TABLE IF NOT EXISTS equipment_verifications (
     id                      text PRIMARY KEY,
     equipment_id            text NOT NULL REFERENCES equipment(id),
     verification_date       text NOT NULL,
     reference_instrument_id text NOT NULL REFERENCES calibration_records(id),
     reference_snapshot      text,
     readings                text,
     result                  text NOT NULL,
     next_due_date           text,
     proof_file_key          text,
     proof_file_name         text,
     notes                   text,
     verified_by_id          text,
     verified_by_name        text,
     created_at              text NOT NULL DEFAULT ${NOW}
   )`,
  `CREATE INDEX IF NOT EXISTS equipment_verifications_equipment_idx ON equipment_verifications (equipment_id, verification_date)`,
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
