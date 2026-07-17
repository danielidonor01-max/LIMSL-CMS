// src/lib/db/seed-procedure.ts
// Seeds the controlled Equipment & System Maintenance Procedure with the FULL,
// word-for-word text imported from the official LIMSL source document
// (EQUIPMENT MAINTENANCE PROCEDURE — Rev 2). The content lives in
// procedure-rev2.md so it stays faithful and diff-able; this loads it as the
// current APPROVED revision. Idempotent: it won't clobber the full content or any
// later revisions authored in-app.

import { db } from "./index";
import { procedureRevisions, users } from "./schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { readFileSync } from "fs";
import path from "path";

const CONTENT = readFileSync(path.join(process.cwd(), "src/lib/db/procedure-rev2.md"), "utf8");
const REVISION = 2;

export async function seedProcedure() {
  console.log("📘 Seeding Equipment Maintenance Procedure (Rev 2, full document)...");
  const existing = await db.select().from(procedureRevisions);

  // If the full document is already loaded, leave it — don't overwrite in-app edits.
  // (Length is the reliable signal: the old placeholder baseline was abridged.)
  const alreadyFull = existing.some((r) => (r.contentMarkdown?.length ?? 0) > 40_000);
  if (alreadyFull) {
    console.log(`ℹ️  Full procedure content already present (${existing.length} revision(s)) — skipping.`);
    return;
  }

  // Replace any placeholder/stub baseline with the real controlled document.
  if (existing.length > 0) {
    await db.delete(procedureRevisions);
    console.log(`   ↻ Replaced ${existing.length} placeholder revision(s) with the full source document.`);
  }

  const [daniel] = await db.select().from(users).where(eq(users.email, "daniel.idonor@limsl.com")).limit(1);
  await db.insert(procedureRevisions).values({
    id: nanoid(),
    code: "LIMSL-MAIN-PROC-001",
    title: "Equipment and System Maintenance Procedure",
    revision: REVISION,
    contentMarkdown: CONTENT,
    changeSummary: "Imported word-for-word from the controlled source document (Rev 2).",
    status: "APPROVED",
    preparedById: daniel?.id ?? null,
    preparedByName: daniel?.name ?? "Maintenance Department",
    effectiveDate: new Date().toISOString().slice(0, 10),
    approvedAt: new Date().toISOString(),
  });
  console.log(`✅ Procedure Rev ${REVISION} seeded (APPROVED) — ${CONTENT.length} chars.`);
}

seedProcedure()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("❌ Procedure seed failed:", e);
    process.exit(1);
  });
