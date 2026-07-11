// src/lib/db/seed-kpi.ts
// Phase 5 seed: plant-wide monthly KPI series (Jan–Jun 2026) plus a few
// per-equipment rows for drill-down. Mirrors the documented improvement
// trajectory (availability climbing to 90%, PM compliance recovering from the
// 20% crisis, MTTR falling toward the 4-hour target).

import { db } from "./index";
import { kpiRecords, equipment } from "./schema";
import { nanoid } from "nanoid";

type Row = typeof kpiRecords.$inferInsert;

// [month, availability, mtbf, mttr, pmCompliance, inspCompliance,
//  maintCost, downtimeCost, revenue, downtimeHours, breakdowns, utilization]
const PLANT: [string, number, number, number, number, number, number, number, number, number, number, number][] = [
  ["2026-01", 0.84, 180, 5.8, 0.18, 0.80, 4_200_000, 3_100_000, 52_000_000, 62, 6, 0.70],
  ["2026-02", 0.86, 195, 5.5, 0.22, 0.84, 3_900_000, 2_600_000, 55_000_000, 54, 5, 0.72],
  ["2026-03", 0.87, 205, 5.2, 0.28, 0.88, 3_700_000, 2_300_000, 58_000_000, 48, 5, 0.74],
  ["2026-04", 0.88, 215, 4.9, 0.35, 0.90, 3_500_000, 2_000_000, 60_000_000, 42, 4, 0.75],
  ["2026-05", 0.89, 225, 4.6, 0.44, 0.93, 3_300_000, 1_700_000, 63_000_000, 36, 3, 0.77],
  ["2026-06", 0.90, 232, 4.3, 0.52, 0.95, 3_100_000, 1_500_000, 66_000_000, 31, 3, 0.78],
];

export async function seedKpi() {
  console.log("📊 Seeding KPI history (Phase 5)...");
  await db.delete(kpiRecords);

  const rows: Row[] = PLANT.map(
    ([month, availability, mtbf, mttr, pm, insp, cost, dtCost, rev, dt, bd, util]) => ({
      id: nanoid(),
      month,
      equipmentName: "Plant-wide",
      availability,
      mtbf,
      mttr,
      pmCompliance: pm,
      inspectionCompliance: insp,
      maintenanceCost: cost,
      downtimeCost: dtCost,
      productionRevenue: rev,
      downtimeHours: dt,
      breakdownFrequency: bd,
      failureRate: Number((bd / 30).toFixed(3)),
      repeatFailureRate: Number((0.12 - Number(month.slice(5)) * 0.01).toFixed(3)),
      maintenanceBacklog: Math.max(4, 24 - Number(month.slice(5)) * 3),
      utilizationRate: util,
      remark: month === "2026-01" ? "PM compliance crisis — understaffed" : "Recovering",
    }),
  );

  // Per-equipment drill-down for June (top critical machines)
  const eqList = await db.select().from(equipment);
  const pick = (needle: string) =>
    eqList.find((e) => e.name.toLowerCase().includes(needle));
  const perEq: { needle: string; avail: number; mtbf: number; mttr: number; cost: number; dt: number }[] = [
    { needle: "stako", avail: 0.72, mtbf: 140, mttr: 7.0, cost: 3_200_000, dt: 40 },
    { needle: "vertical lathe", avail: 0.93, mtbf: 260, mttr: 3.4, cost: 1_400_000, dt: 14 },
    { needle: "sertom plate rolling", avail: 0.95, mtbf: 300, mttr: 3.0, cost: 900_000, dt: 9 },
    { needle: "kone 12t overhead crane #1", avail: 0.97, mtbf: 420, mttr: 2.2, cost: 600_000, dt: 6 },
  ];
  for (const p of perEq) {
    const eq = pick(p.needle);
    if (!eq) continue;
    rows.push({
      id: nanoid(),
      month: "2026-06",
      equipmentId: eq.id,
      equipmentName: eq.name,
      assetId: eq.assetId,
      availability: p.avail,
      mtbf: p.mtbf,
      mttr: p.mttr,
      maintenanceCost: p.cost,
      downtimeHours: p.dt,
      pmCompliance: 0.5,
      inspectionCompliance: 0.95,
      utilizationRate: p.avail - 0.1,
      remark: p.needle === "stako" ? "Active breakdown — no motion X axis" : "Stable",
    });
  }

  await db.insert(kpiRecords).values(rows);
  console.log(`✅ ${rows.length} KPI records (${PLANT.length} plant-wide + ${rows.length - PLANT.length} per-equipment)`);
  console.log("🎉 KPI seed complete!");
}

seedKpi()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("❌ KPI seed failed:", e);
    process.exit(1);
  });
