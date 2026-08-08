// src/app/api/dashboard/stats/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  equipment,
  maintenanceSchedule,
  workOrders,
} from "@/lib/db/schema";
import { reconcileSchedule } from "@/lib/schedule";

const TODAY = new Date().toISOString().slice(0, 10);

// Live executive KPIs computed from the database (no hardcoded values).
export async function GET() {
  try {
    await reconcileSchedule();
    const allEquip = await db.select().from(equipment);
    const totalAssets = allEquip.length;
    const brokenDown = allEquip.filter((e) => e.status === "BROKEN_DOWN").length;

    // This figure is the live headcount and nothing else. It previously
    // preferred the latest stored monthly KPI, so a tile saying "now" could show
    // a time-based number from last month — the two definitions the KPI page was
    // already confusing, leaking back in through the back door.
    //
    // Matches the fleet rule used in lib/kpi/compute.ts: a retired asset is not
    // unavailable, it is not in the fleet; an asset waiting on a part IS down,
    // however quietly.
    const fleet = allEquip.filter((e) => e.status !== "DECOMMISSIONED");
    const unavailable = fleet.filter(
      (e) => e.status === "BROKEN_DOWN" || e.status === "AWAITING_PARTS",
    ).length;
    const availability = fleet.length ? (fleet.length - unavailable) / fleet.length : 0;

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
        // Two different figures used to share the label "Equipment
        // Availability": this asset headcount, and the time-based availability
        // on the KPI page. Same words, different metric, same screen — the
        // first thing an auditor asks is which one management reviews. This
        // tile is now explicitly the right-now headcount; the time-based
        // measure keeps the plain name on the KPI page.
        title: "Assets Available Now",
        value: `${availPct.toFixed(1)}%`,
        target: "≥90.0%",
        status: availPct >= 90 ? "success" : availPct >= 80 ? "warning" : "danger",
        desc:
          unavailable > 0
            ? `${unavailable} of ${fleet.length} asset(s) down right now`
            : "All machinery available",
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
    console.error("Failed to load dashboard stats:", error);
    return NextResponse.json({ error: "Failed to load stats" }, { status: 500 });
  }
}
