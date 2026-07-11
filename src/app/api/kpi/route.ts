// src/app/api/kpi/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  kpiRecords,
  equipment,
  maintenanceSchedule,
  workOrders,
} from "@/lib/db/schema";
const TODAY = new Date().toISOString().slice(0, 10);

export async function GET() {
  try {
    const allKpi = await db.select().from(kpiRecords);
    // Plant-wide monthly series (no equipmentId), sorted by month
    const monthly = allKpi
      .filter((r) => !r.equipmentId)
      .sort((a, b) => (a.month > b.month ? 1 : -1));
    // Per-equipment drill-down rows
    const perEq = allKpi.filter((r) => r.equipmentId);

    // ── Live-computed metrics ────────────────────────────────────────────
    const allEquip = await db.select().from(equipment);
    const totalAssets = allEquip.length;
    const brokenDown = allEquip.filter((e) => e.status === "BROKEN_DOWN").length;
    const underMaint = allEquip.filter((e) => e.status === "UNDER_MAINTENANCE").length;

    const sched = await db.select().from(maintenanceSchedule);
    const pmDue = sched.filter((s) => s.activityType === "PM" && s.plannedDate <= TODAY);
    const pmDone = pmDue.filter((s) => s.status === "COMPLETED").length;
    const pmCompliance = pmDue.length ? pmDone / pmDue.length : 0;

    const insDue = sched.filter((s) => s.activityType === "INS" && s.plannedDate <= TODAY);
    const insDone = insDue.filter((s) => s.status === "COMPLETED").length;
    const inspectionCompliance = insDue.length ? insDone / insDue.length : 0;

    const overdueActivities = sched.filter((s) => s.status === "OVERDUE").length;

    const wos = await db.select().from(workOrders);
    const openWos = wos.filter((w) => w.status === "OPEN" || w.status === "IN_PROGRESS").length;

    const latest = monthly[monthly.length - 1] ?? null;
    const availability = latest?.availability ?? (totalAssets ? (totalAssets - brokenDown) / totalAssets : 0);

    return NextResponse.json({
      monthly,
      perEquipment: perEq,
      live: {
        totalAssets,
        brokenDown,
        underMaint,
        operational: totalAssets - brokenDown - underMaint,
        pmCompliance,
        inspectionCompliance,
        overdueActivities,
        openWos,
        availability,
        mtbf: latest?.mtbf ?? null,
        mttr: latest?.mttr ?? null,
        maintenanceCost: latest?.maintenanceCost ?? null,
        downtimeCost: latest?.downtimeCost ?? null,
        productionRevenue: latest?.productionRevenue ?? null,
        utilizationRate: latest?.utilizationRate ?? null,
        maintenanceBacklog: latest?.maintenanceBacklog ?? null,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to load KPIs:", error);
    return NextResponse.json({ error: "Failed to load KPIs", details: message }, { status: 500 });
  }
}
