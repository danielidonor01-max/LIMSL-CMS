// src/lib/kpi/compute.ts
// Computes maintenance KPIs from the ACTUAL operational data — work orders,
// corrective/RCA breakdowns, PM schedule, permits, non-conformities — instead of
// static seed numbers. This is the source of truth for the KPI dashboard and the
// ISO evidence reports.
//
// Availability / MTBF use a planned-operating-time model (single shift): a machine
// is "scheduled to run" PLANNED_HOURS_PER_MONTH; downtime comes from the recorded
// corrective total_downtime_hours. This is the standard maintenance-KPI approach —
// the inputs are real; only the planned-hours baseline is an assumption (tunable).
import { db } from "@/lib/db";
import {
  equipment,
  maintenanceSchedule,
  workOrders,
  correctiveMaintenance,
  permits,
  nonConformities,
} from "@/lib/db/schema";

// Planned operating hours per machine per month (≈ 8h × 26 working days).
const PLANNED_HOURS_PER_MONTH = Number(process.env.KPI_PLANNED_HOURS_PER_MONTH || 208);

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

// The last `n` month keys ending with the current month (oldest first).
function lastMonths(n: number, ref: Date): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(ref.getFullYear(), ref.getMonth() - i, 1);
    out.push(monthKey(d));
  }
  return out;
}

const inMonth = (dateStr: string | null | undefined, key: string) =>
  !!dateStr && dateStr.slice(0, 7) === key;

export async function computeKpis(now = new Date()) {
  const [equip, sched, wos, cms, perms, ncs] = await Promise.all([
    db.select().from(equipment),
    db.select().from(maintenanceSchedule),
    db.select().from(workOrders),
    db.select().from(correctiveMaintenance),
    db.select().from(permits),
    db.select().from(nonConformities),
  ]);

  const totalAssets = equip.length || 1;
  const todayStr = now.toISOString().slice(0, 10);
  const months = lastMonths(6, now);

  // ── Monthly series (real) ────────────────────────────────────────────────
  const monthly = months.map((key) => {
    const breakdowns = cms.filter((c) => inMonth(c.reportedDate, key));
    const downtimeHours = breakdowns.reduce((a, c) => a + (c.totalDowntimeHours ?? 0), 0);
    const repaired = breakdowns.filter((c) => (c.totalDowntimeHours ?? 0) > 0);
    const mttr = repaired.length ? downtimeHours / repaired.length : null;

    const pmSched = sched.filter((s) => s.activityType === "PM" && inMonth(s.plannedDate, key));
    const pmDone = pmSched.filter((s) => s.status === "COMPLETED").length;
    const pmCompliance = pmSched.length ? pmDone / pmSched.length : null;

    const insSched = sched.filter((s) => s.activityType === "INS" && inMonth(s.plannedDate, key));
    const insDone = insSched.filter((s) => s.status === "COMPLETED").length;
    const inspectionCompliance = insSched.length ? insDone / insSched.length : null;

    const plannedHours = totalAssets * PLANNED_HOURS_PER_MONTH;
    const availability = plannedHours > 0 ? Math.max(0, (plannedHours - downtimeHours) / plannedHours) : null;
    const uptime = Math.max(0, plannedHours - downtimeHours);
    const mtbf = breakdowns.length ? uptime / breakdowns.length : null;

    return {
      month: key,
      availability,
      mtbf,
      mttr,
      pmCompliance,
      inspectionCompliance,
      breakdownFrequency: breakdowns.length,
      downtimeHours,
      // Not tracked (no cost/revenue/utilisation data captured yet):
      maintenanceCost: null as number | null,
      downtimeCost: null as number | null,
      productionRevenue: null as number | null,
      utilizationRate: null as number | null,
    };
  });

  // ── Trailing-window aggregates (real) — last 6 months ─────────────────────
  const windowCms = cms.filter((c) => months.includes((c.reportedDate ?? "").slice(0, 7)));
  const windowDowntime = windowCms.reduce((a, c) => a + (c.totalDowntimeHours ?? 0), 0);
  const windowRepaired = windowCms.filter((c) => (c.totalDowntimeHours ?? 0) > 0);
  const plannedHoursWindow = totalAssets * PLANNED_HOURS_PER_MONTH * months.length;
  const mtbf = windowCms.length ? Math.max(0, plannedHoursWindow - windowDowntime) / windowCms.length : null;
  const mttr = windowRepaired.length ? windowDowntime / windowRepaired.length : null;

  // ── Snapshot / live ───────────────────────────────────────────────────────
  const brokenDown = equip.filter((e) => e.status === "BROKEN_DOWN").length;
  const underMaint = equip.filter((e) => e.status === "UNDER_MAINTENANCE").length;
  const operational = totalAssets - brokenDown - underMaint;
  const availability = totalAssets ? (totalAssets - brokenDown) / totalAssets : null;

  const pmDueAll = sched.filter((s) => s.activityType === "PM" && s.plannedDate <= todayStr);
  const pmCompliance = pmDueAll.length ? pmDueAll.filter((s) => s.status === "COMPLETED").length / pmDueAll.length : null;
  const insDueAll = sched.filter((s) => s.activityType === "INS" && s.plannedDate <= todayStr);
  const inspectionCompliance = insDueAll.length ? insDueAll.filter((s) => s.status === "COMPLETED").length / insDueAll.length : null;
  const overdueActivities = sched.filter((s) => s.status === "OVERDUE").length;

  const openWoList = wos.filter((w) => w.status === "OPEN" || w.status === "IN_PROGRESS");
  const openWos = openWoList.length;
  // Backlog in man-hours = estimated effort still open.
  const maintenanceBacklog = Math.round(openWoList.reduce((a, w) => a + (w.estimatedDuration ?? 2), 0));
  const completedWo = wos.filter((w) => w.status === "COMPLETED").length;
  const woCompletionRate = wos.length ? completedWo / wos.length : null;

  // PTW compliance: of permits that went to work (not cancelled), how many were
  // properly signed off (reached ACTIVE/CLOSED) rather than left pending/expired.
  const decidablePerms = perms.filter((p) => p.status !== "CANCELLED");
  const signedPerms = perms.filter((p) => p.status === "ACTIVE" || p.status === "CLOSED");
  const ptwCompliance = decidablePerms.length ? signedPerms.length / decidablePerms.length : null;

  // Safety incidents: open safety non-conformities.
  const safetyIncidents = ncs.filter((n) => n.type === "SAFETY_INCIDENT").length;

  // Failure rate: breakdowns per asset per month over the window.
  const failureRate = totalAssets && months.length ? windowCms.length / (totalAssets * months.length) : 0;

  // ── Per-equipment drill-down (real) ───────────────────────────────────────
  // Surface only assets that either broke down in the window or are currently
  // not operational — an auditor cares about the movers, not 30 healthy rows.
  const plannedHoursPerAsset = PLANNED_HOURS_PER_MONTH * months.length;
  const STATUS_REMARK: Record<string, string> = {
    BROKEN_DOWN: "Down — needs repair",
    UNDER_MAINTENANCE: "Under maintenance",
    AWAITING_PARTS: "Awaiting parts",
    DECOMMISSIONED: "Decommissioned",
  };
  const perEquipment = equip
    .map((e) => {
      const evts = windowCms.filter((c) => c.equipmentId === e.id);
      const downtimeHours = evts.reduce((a, c) => a + (c.totalDowntimeHours ?? 0), 0);
      const repaired = evts.filter((c) => (c.totalDowntimeHours ?? 0) > 0).length;
      const availability = plannedHoursPerAsset > 0
        ? Math.max(0, (plannedHoursPerAsset - downtimeHours) / plannedHoursPerAsset)
        : null;
      const mtbf = evts.length ? Math.round(Math.max(0, plannedHoursPerAsset - downtimeHours) / evts.length) : null;
      const mttr = repaired ? +(downtimeHours / repaired).toFixed(1) : null;
      const remark = STATUS_REMARK[e.status] ?? (evts.length ? `${evts.length} breakdown${evts.length > 1 ? "s" : ""} (6 mo)` : "Stable");
      return {
        id: e.id,
        equipmentName: `${e.assetId} · ${e.name}`,
        status: e.status,
        breakdowns: evts.length,
        availability,
        mtbf,
        mttr,
        downtimeHours: +downtimeHours.toFixed(1),
        remark,
      };
    })
    .filter((r) => r.breakdowns > 0 || r.status !== "OPERATIONAL")
    .sort((a, b) => b.downtimeHours - a.downtimeHours || b.breakdowns - a.breakdowns);

  return {
    monthly,
    perEquipment,
    live: {
      totalAssets,
      brokenDown,
      underMaint,
      operational,
      availability,
      pmCompliance,
      inspectionCompliance,
      overdueActivities,
      openWos,
      maintenanceBacklog,
      woCompletionRate,
      ptwCompliance,
      safetyIncidents,
      breakdownsWindow: windowCms.length,
      failureRate,
      mtbf,
      mttr,
      // Not tracked yet (no cost/revenue/utilisation capture):
      maintenanceCost: null as number | null,
      downtimeCost: null as number | null,
      productionRevenue: null as number | null,
      utilizationRate: null as number | null,
    },
  };
}
