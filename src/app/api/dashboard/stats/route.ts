// src/app/api/dashboard/stats/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  equipment,
  maintenanceSchedule,
  workOrders,
  kpiRecords,
} from "@/lib/db/schema";
import { isNull } from "drizzle-orm";
import { reconcileSchedule } from "@/lib/schedule";

const TODAY = new Date().toISOString().slice(0, 10);

// Live executive KPIs computed from the database (no hardcoded values).
export async function GET() {
  try {
    await reconcileSchedule();
    const allEquip = await db.select().from(equipment);
    const totalAssets = allEquip.length;
    const brokenDown = allEquip.filter((e) => e.status === "BROKEN_DOWN").length;

    // Availability: prefer the latest recorded plant-wide KPI, else derive from status
    const plantKpi = (await db.select().from(kpiRecords).where(isNull(kpiRecords.equipmentId)))
      .sort((a, b) => (a.month > b.month ? 1 : -1));
    const latest = plantKpi[plantKpi.length - 1];
    const availability =
      latest?.availability ?? (totalAssets ? (totalAssets - brokenDown) / totalAssets : 0);

    // PM compliance: completed ÷ due PM activities (live from the schedule)
    const sched = await db.select().from(maintenanceSchedule);
    const pmDue = sched.filter((s) => s.activityType === "PM" && s.plannedDate <= TODAY);
    const pmDone = pmDue.filter((s) => s.status === "COMPLETED").length;
    const pmCompliance = pmDue.length ? pmDone / pmDue.length : 0;

    const wos = await db.select().from(workOrders);
    const openWos = wos.filter((w) => w.status === "OPEN" || w.status === "IN_PROGRESS").length;

    const availPct = availability * 100;
    const pmPct = pmCompliance * 100;

    const stats = [
      {
        title: "Equipment Availability",
        value: `${availPct.toFixed(1)}%`,
        target: "≥90.0%",
        status: availPct >= 90 ? "success" : availPct >= 80 ? "warning" : "danger",
        desc: brokenDown > 0 ? `${brokenDown} asset(s) down` : "All machinery available",
        code: "AVAILABILITY",
      },
      {
        title: "PM Compliance",
        value: `${pmPct.toFixed(1)}%`,
        target: "≥95.0%",
        status: pmPct >= 95 ? "success" : pmPct >= 50 ? "warning" : "danger",
        desc: `${pmDone}/${pmDue.length} due PM completed`,
        code: "PM_COMPLIANCE",
      },
      {
        title: "Active Breakdowns",
        value: brokenDown.toString(),
        target: "0 Target",
        status: brokenDown > 0 ? "danger" : "success",
        desc: brokenDown > 0 ? "Critical repair action required" : "Zero active failures",
        code: "BREAKDOWNS",
      },
      {
        title: "Open Work Orders",
        value: openWos.toString(),
        target: `${totalAssets} assets`,
        status: openWos > 20 ? "warning" : "success",
        desc: "Open or in-progress across the plant",
        code: "OPEN_WOS",
      },
    ];

    return NextResponse.json(stats);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to load dashboard stats:", error);
    return NextResponse.json({ error: "Failed to load stats", details: message }, { status: 500 });
  }
}
