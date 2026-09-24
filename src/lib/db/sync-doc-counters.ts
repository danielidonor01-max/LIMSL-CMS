// src/lib/db/sync-doc-counters.ts
// Bringing the document counters up to match the documents that exist.
//
// Numbering is race-safe: doc_counters holds one row per series and year, and
// nextDocNumber() increments it atomically. That is correct, and it has one
// assumption — that everything which has ever taken a number took it from
// there.
//
// The seeds do not. They insert work orders, method statements and breakdown
// records with numbers written straight into the row, so on a seeded database
// the counter says 1 while the register already holds WO-2026-0011. The next
// person to raise a work order gets WO-2026-0001, hits the unique index, and
// sees "Failed to create work order" with nothing on screen explaining why.
// Every seeded environment has this, and it blocks the whole work-order path
// until the counter catches up.
//
// So this reads the highest number actually in use per series and lifts the
// counter to at least that. It never lowers one — a counter ahead of reality is
// harmless (numbers are allowed to have gaps), a counter behind it is an outage.
//
//   DATABASE_URL=… npx tsx src/lib/db/sync-doc-counters.ts --dry-run
//   DATABASE_URL=… npx tsx src/lib/db/sync-doc-counters.ts
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

// Every series that is handed out by nextDocNumber(), and where its numbers
// are actually stored.
const SERIES: Array<{ prefix: string; table: string; column: string }> = [
  { prefix: "WO", table: "work_orders", column: "work_order_number" },
  { prefix: "WMS", table: "wms_documents", column: "wms_number" },
  { prefix: "JHA", table: "jha_documents", column: "jha_number" },
  { prefix: "PTW", table: "permits", column: "permit_number" },
  { prefix: "PMB", table: "pm_batches", column: "batch_number" },
  { prefix: "CMRF", table: "corrective_maintenance", column: "cmrf_number" },
  { prefix: "NCR", table: "non_conformities", column: "ncr_number" },
  { prefix: "CAL", table: "calibration_records", column: "certificate_number" },
];

const rowsOf = (res: unknown): Record<string, unknown>[] =>
  (Array.isArray(res) ? res : ((res as { rows?: unknown[] }).rows ?? [])) as Record<string, unknown>[];

export async function syncDocCounters({ dryRun = false }: { dryRun?: boolean } = {}) {
  const changes: Array<{ series: string; from: number; to: number }> = [];

  for (const s of SERIES) {
    // A table that does not exist in this database is not an error; not every
    // deployment has every module.
    let used: Record<string, unknown>[];
    try {
      used = rowsOf(
        await db.execute(
          sql.raw(
            `select ${s.column} as n from ${s.table} where ${s.column} is not null`,
          ),
        ),
      );
    } catch {
      continue;
    }

    // Group by the series embedded in the number itself (WO-2026-0011), rather
    // than assuming the current year, so last year's numbering is left alone.
    const highest = new Map<string, number>();
    for (const row of used) {
      const value = String(row.n ?? "");
      const m = value.match(/^([A-Z]+-\d{4})-(\d+)$/);
      if (!m) continue;
      const n = Number(m[2]);
      if (!Number.isFinite(n)) continue;
      highest.set(m[1], Math.max(highest.get(m[1]) ?? 0, n));
    }

    for (const [series, max] of highest) {
      const current = rowsOf(
        await db.execute(sql`select value from doc_counters where series = ${series}`),
      );
      const value = Number(current[0]?.value ?? 0);
      if (value >= max) continue;
      changes.push({ series, from: value, to: max });
      if (!dryRun) {
        await db.execute(sql`
          INSERT INTO doc_counters (series, value) VALUES (${series}, ${max})
          ON CONFLICT (series) DO UPDATE SET value = ${max}
          WHERE doc_counters.value < ${max}
        `);
      }
    }
  }

  if (changes.length === 0) {
    console.log("\nEvery counter is already at or ahead of the documents in use.\n");
    return changes;
  }

  console.log("\nCounters behind the documents that exist:");
  for (const c of changes) {
    console.log(`  ${c.series.padEnd(10)} ${String(c.from).padStart(4)} -> ${String(c.to).padStart(4)}`);
  }
  console.log(
    dryRun
      ? "\n--dry-run: nothing was written.\n"
      : "\nRaised. The next document in each series follows the highest one in use.\n",
  );
  return changes;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Refusing to guess which database to change.");
    process.exit(1);
  }
  await syncDocCounters({ dryRun });
  process.exit(0);
}

if (process.argv[1]?.includes("sync-doc-counters")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
