// src/lib/db/ingest-docs-backfill.ts
// One-shot backfill of the troubleshooting retrieval corpus: chunks every
// already-uploaded text document plus the approved maintenance procedure into
// document_chunks. Idempotent — safe to re-run anytime (each source's chunks
// are replaced, not duplicated).
//
//   export DATABASE_URL=postgresql://...   # then:
//   npx tsx src/lib/db/ingest-docs-backfill.ts
import { db } from "@/lib/db";
import { equipmentDocuments } from "@/lib/db/schema";
import { ingestDocument, ingestApprovedProcedure } from "@/lib/diagnostics/ingest-docs";

async function main() {
  console.log("📚 Backfilling document chunks...");

  const proc = await ingestApprovedProcedure();
  console.log(`  ${proc.status === "INGESTED" ? "✅" : "⏭️"} ${proc.source}: ${proc.status}${proc.reason ? ` (${proc.reason})` : ""} — ${proc.chunks} chunks`);

  const docs = await db.select().from(equipmentDocuments);
  const withFiles = docs.filter((d) => d.fileKey);
  console.log(`  ${withFiles.length} uploaded document(s) found (${docs.length - withFiles.length} link-only skipped)`);

  let ingested = 0;
  let skipped = 0;
  for (const d of withFiles) {
    try {
      const r = await ingestDocument(d.id);
      if (r.status === "INGESTED") {
        ingested++;
        console.log(`  ✅ ${r.source}: ${r.chunks} chunks${r.pdfKind ? ` [${r.pdfKind}]` : ""}`);
      } else {
        skipped++;
        console.log(`  ⏭️ ${r.source}: ${r.reason}`);
      }
    } catch (err) {
      skipped++;
      console.log(`  ❌ ${d.title}: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(`\n🎉 Backfill complete — ${ingested} ingested, ${skipped} skipped.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("❌ Backfill failed:", e);
    process.exit(1);
  });
