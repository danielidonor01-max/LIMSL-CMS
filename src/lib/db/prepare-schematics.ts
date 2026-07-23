// src/lib/db/prepare-schematics.ts
// Bulk-prepare every uploaded schematic PDF into high-resolution tiles
// (P1 of docs/TROUBLESHOOTING-ENGINE.md). Run from a real machine — rendering
// A0/A1 sheets is memory-heavy and belongs off serverless:
//
//   export DATABASE_URL=postgresql://...
//   npx tsx src/lib/db/prepare-schematics.ts
//
// Idempotent: already-prepared pages are skipped; re-running only does new work.
import { db } from "@/lib/db";
import { equipmentDocuments } from "@/lib/db/schema";
import { prepareSchematic } from "@/lib/diagnostics/schematic-prep";

async function main() {
  console.log("🗺️  Preparing schematic tiles...");
  const docs = await db.select().from(equipmentDocuments);
  const targets = docs.filter(
    (d) =>
      d.fileKey &&
      (d.docType === "ELECTRICAL_SCHEMATIC" ||
        ((d.mimeType ?? "").includes("pdf") && d.docType === "OPERATIONAL_MANUAL")),
  );
  console.log(`  ${targets.length} schematic document(s) with uploaded files.`);

  for (const d of targets) {
    try {
      let progress = await prepareSchematic(d.id, 1);
      while (!progress.done) {
        console.log(`  … ${d.title}: sheet ${progress.preparedPages.length}/${progress.totalPages}`);
        progress = await prepareSchematic(d.id, 1);
      }
      console.log(`  ✅ ${d.title}: ${progress.preparedPages.length}/${progress.totalPages} sheets tiled.`);
    } catch (err) {
      console.log(`  ❌ ${d.title}: ${err instanceof Error ? err.message : err}`);
    }
  }
  console.log("🎉 Done.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("❌ Failed:", e);
    process.exit(1);
  });
