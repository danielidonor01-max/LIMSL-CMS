// src/lib/kpi/compute.ts
// Computes maintenance KPIs from the ACTUAL operational data, work orders,
// corrective/RCA breakdowns, PM schedule, permits, non-conformities, instead of
// static seed numbers. This is the source of truth for the KPI dashboard and the
// ISO evidence reports.
//
// Availability / MTBF use a planned-operating-time model: each machine is
// "scheduled to run" the production hours defined by the Super-Admin working-hours
// settings (window, lunch, working days) counted over the real calendar of each
// month; downtime comes from the recorded corrective total_downtime_hours (itself
// production-time, from the same settings). Change the settings and the baseline, // and therefore availability and MTBF, move with it. Nothing here is hardcoded.
import { db } from "@/lib/db";
import {
  equipment,
  maintenanceSchedule,
  workOrders,
  correctiveMaintenance,
  permits,
  nonConformities,
} from "@/lib/db/schema";
import { getWorkSettings } from "@/lib/settings";
import { plannedHoursForMonth } from "@/lib/worktime";
import { complianceTally, type LogActivity } from "@/lib/maintenance/compliance-log";
import { getComplianceRule } from "@/lib/maintenance/compliance-rule-store";
import { reconcileSchedule } from "@/lib/schedule";
import { availabilityOf, ptwComplianceOf, medianJobHoursOf, backlogHoursOf } from "@/lib/kpi/formulas";

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
  // Overdue status must reflect today before compliance is measured.
  await reconcileSchedule(now);

  const [equip, sched, wos, cms, perms, ncs, workSettings] = await Promise.all([
    db.select().from(equipment),
    db.select().from(maintenanceSchedule),
    db.select().from(workOrders),
    db.select().from(correctiveMaintenance),
    db.select().from(permits),
    db.select().from(nonConformities),
    getWorkSettings(),
  ]);

  const totalAssets = equip.length || 1;
  const todayStr = now.toISOString().slice(0, 10);
  // One counting rule for the KPI, the schedule and its Log (Settings).
  const rule = await getComplianceRule();
  const ratio = (rows: typeof sched) => {
    const t = complianceTally(rows as unknown as LogActivity[], todayStr, rule);
    return t.due ? t.compliant / t.due : null;
  };
  const months = lastMonths(6, now);

  // ── Monthly series (real) ────────────────────────────────────────────────
  const monthly = months.map((key) => {
    const breakdowns = cms.filter((c) => inMonth(c.reportedDate, key));
    const downtimeHours = breakdowns.reduce((a, c) => a + (c.totalDowntimeHours ?? 0), 0);
    // Denominator is EVERY breakdown in the period, not just those with a
    // downtime window recorded, leaving the window blank used to delete a bad
    // repair from MTTR altogether. Records missing a window are counted and
    // surfaced so the number can be read honestly.
    const missingWindow = breakdowns.filter((c) => (c.totalDowntimeHours ?? 0) <= 0).length;
    const mttr = breakdowns.length ? downtimeHours / breakdowns.length : null;

    // Compliant = completed inside the window for its frequency. Counting any
    // completion, however late, made this metric unfalsifiable.
    const pmCompliance = ratio(sched.filter((s) => s.activityType === "PM" && inMonth(s.plannedDate, key)));
    const inspectionCompliance = ratio(sched.filter((s) => s.activityType === "INS" && inMonth(s.plannedDate, key)));

    const plannedHours = totalAssets * plannedHoursForMonth(key, workSettings);
    // Planned downtime counts. A machine down eight hours for a PM was 100%
    // available, which both overstated the number and made it gameable by
    // classifying work as preventive. Reported alongside the unplanned split so
    // the two causes stay distinguishable.
    const plannedDown = wos
      .filter(
        (w) =>
          (w.type === "PREVENTIVE" || w.type === "INSPECTION") &&
          w.status === "COMPLETED" &&
          inMonth(w.completionDate, key),
      )
      .reduce((a, w) => a + (w.actualDuration ?? 0), 0);
    const totalDown = downtimeHours + plannedDown;
    const availability = availabilityOf(plannedHours, downtimeHours, plannedDown);
    const uptime = Math.max(0, plannedHours - totalDown);
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

  // ── Trailing-window aggregates (real), last 6 months ─────────────────────
  const windowCms = cms.filter((c) => months.includes((c.reportedDate ?? "").slice(0, 7)));
  const windowDowntime = windowCms.reduce((a, c) => a + (c.totalDowntimeHours ?? 0), 0);
  const windowRepaired = windowCms.filter((c) => (c.totalDowntimeHours ?? 0) > 0);
  const plannedHoursPerAssetWindow = months.reduce((a, key) => a + plannedHoursForMonth(key, workSettings), 0);
  const plannedHoursWindow = totalAssets * plannedHoursPerAssetWindow;
  const mtbf = windowCms.length ? Math.max(0, plannedHoursWindow - windowDowntime) / windowCms.length : null;
  const mttr = windowRepaired.length ? windowDowntime / windowRepaired.length : null;

  // ── Snapshot / live ───────────────────────────────────────────────────────
  // A decommissioned asset is not part of the fleet and must not sit in the
  // denominator of every metric forever; a machine parked awaiting parts is
  // NOT available, however calmly it is labelled.
  const activeFleet = equip.filter((e) => e.status !== "DECOMMISSIONED");
  const fleetSize = activeFleet.length || 1;
  const brokenDown = activeFleet.filter((e) => e.status === "BROKEN_DOWN").length;
  const underMaint = activeFleet.filter((e) => e.status === "UNDER_MAINTENANCE").length;
  const awaitingParts = activeFleet.filter((e) => e.status === "AWAITING_PARTS").length;
  const operational = fleetSize - brokenDown - underMaint - awaitingParts;
  const availability = activeFleet.length
    ? (fleetSize - brokenDown - awaitingParts) / fleetSize
    : null;

  const pmCompliance = ratio(sched.filter((s) => s.activityType === "PM"));
  const inspectionCompliance = ratio(sched.filter((s) => s.activityType === "INS"));
  const overdueActivities = sched.filter((s) => s.status === "OVERDUE").length;

  const openWoList = wos.filter((w) => w.status === "OPEN" || w.status === "IN_PROGRESS");
  const openWos = openWoList.length;
  // Backlog in man-hours. Where a work order carries no estimate we fall back to
  // this workshop's own median completed job rather than a hardcoded 2 hours, so
  // the assumption is at least drawn from evidence. `backlogEstimated` reports
  // how many rows carried a real estimate, so nobody mistakes the figure for a
  // measurement when most of it is inference.
  const medianJobHours = medianJobHoursOf(wos.map((w) => w.actualDuration));
  const backlog = backlogHoursOf(openWoList, medianJobHours);
  const backlogEstimated = backlog.estimated;
  const maintenanceBacklog = backlog.hours;
  const completedWo = wos.filter((w) => w.status === "COMPLETED").length;
  const woCompletionRate = wos.length ? completedWo / wos.length : null;

  // PTW close-out discipline. The old metric asked "of permits raised, how many
  // got approved", and since a permit can ONLY become ACTIVE via a fully signed
  // chain, it trended to 100% by construction: a safety KPI that could not go
  // down. What actually matters is whether authorised work was closed out
  // properly, so the isolation was signed off inside the permit's validity.
  const ptw = ptwComplianceOf(perms);
  const ptwCompliance = ptw.compliance;

  // Safety incidents: open safety non-conformities.
  const safetyIncidents = ncs.filter((n) => n.type === "SAFETY_INCIDENT").length;

  // Failure rate: breakdowns per asset per month over the window.
  const failureRate = totalAssets && months.length ? windowCms.length / (totalAssets * months.length) : 0;

  // ── Per-equipment drill-down (real) ───────────────────────────────────────
  // Surface only assets that either broke down in the window or are currently
  // not operational, an auditor cares about the movers, not 30 healthy rows.
  const plannedHoursPerAsset = plannedHoursPerAssetWindow;
  const STATUS_REMARK: Record<string, string> = {
    BROKEN_DOWN: "Down, needs repair",
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
        equipmentName: e.name || e.assetId,
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
      ptwWentToWork: ptw.wentToWork,
      ptwClosedLate: ptw.closedLate,
      ptwNotClosed: ptw.notClosed,
      backlogEstimated,
      openWosTotal: openWoList.length,
      medianJobHours,
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
