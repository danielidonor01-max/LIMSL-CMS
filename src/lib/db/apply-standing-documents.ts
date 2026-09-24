// src/lib/db/apply-standing-documents.ts
// The schema behind standing method statements, scheduled corrective work and
// signature delegation. Additive and idempotent, like apply-pm-flow.ts: one new
// column at a time, every one nullable, nothing dropped or rewritten. Run it
// twice and the second run does nothing.
//
//   DATABASE_URL=pglite       npx tsx src/lib/db/apply-standing-documents.ts
//   DATABASE_URL=postgres://… npx tsx src/lib/db/apply-standing-documents.ts
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

const STATEMENTS: string[] = [
  // A method statement belongs to a CATEGORY and is revised, not rewritten.
  `ALTER TABLE wms_documents ADD COLUMN IF NOT EXISTS category text`,
  `ALTER TABLE wms_documents ADD COLUMN IF NOT EXISTS change_summary text`,
  `ALTER TABLE wms_documents ADD COLUMN IF NOT EXISTS effective_date text`,
  `ALTER TABLE wms_documents ADD COLUMN IF NOT EXISTS supersedes_id text`,

  // The analysis pins the revision its hazards were assessed against.
  `ALTER TABLE jha_documents ADD COLUMN IF NOT EXISTS category text`,
  `ALTER TABLE jha_documents ADD COLUMN IF NOT EXISTS wms_revision integer`,
  `ALTER TABLE jha_documents ADD COLUMN IF NOT EXISTS change_summary text`,
  `ALTER TABLE jha_documents ADD COLUMN IF NOT EXISTS supersedes_id text`,

  // Corrective work a foreman planned, as opposed to a breakdown reported.
  `ALTER TABLE corrective_maintenance ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'REPORTED'`,
  `ALTER TABLE corrective_maintenance ADD COLUMN IF NOT EXISTS planned_date text`,
  `ALTER TABLE corrective_maintenance ADD COLUMN IF NOT EXISTS scheduled_by_id text`,
  `ALTER TABLE corrective_maintenance ADD COLUMN IF NOT EXISTS scheduled_by_name text`,

  // Delegation: who holds this signature now, and why it moved.
  `ALTER TABLE signoffs ADD COLUMN IF NOT EXISTS delegated_to_id text`,
  `ALTER TABLE signoffs ADD COLUMN IF NOT EXISTS delegated_to_name text`,
  `ALTER TABLE signoffs ADD COLUMN IF NOT EXISTS delegated_by_id text`,
  `ALTER TABLE signoffs ADD COLUMN IF NOT EXISTS delegated_by_name text`,
  `ALTER TABLE signoffs ADD COLUMN IF NOT EXISTS delegated_at text`,
  `ALTER TABLE signoffs ADD COLUMN IF NOT EXISTS delegation_reason text`,

  // "The method in force for this category" runs on every batch screen and in
  // the permit gate.
  `CREATE INDEX IF NOT EXISTS wms_category_revision_idx ON wms_documents (category, revision)`,
  `CREATE INDEX IF NOT EXISTS jha_wms_idx ON jha_documents (wms_id)`,
];

export async function applyStandingDocuments() {
  for (const [i, statement] of STATEMENTS.entries()) {
    const label = statement.trim().slice(0, 74);
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
  console.log(`\nApplying the standing-document schema…\n`);
  await applyStandingDocuments();
  process.exit(0);
}

if (process.argv[1]?.includes("apply-standing-documents")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
