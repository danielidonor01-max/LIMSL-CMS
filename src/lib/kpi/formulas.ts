// src/lib/kpi/formulas.ts
// The arithmetic behind the KPI numbers, pulled out of the DB-bound compute()
// so it can be tested without a database.
//
// These four definitions were each wrong in a way that flattered the workshop,
// which is the failure mode that matters in a compliance system: a metric that
// cannot report bad news is not a metric.

// Availability must count ALL production time lost to maintenance. Excluding
// planned downtime meant a machine stopped eight hours for a PM still read as
// 100% available, and worse, made the number gameable, since classifying work
// as preventive removed its downtime from the figure entirely.
export function availabilityOf(
  plannedHours: number,
  breakdownDownHours: number,
  plannedDownHours: number,
): number | null {
  if (plannedHours <= 0) return null;
  const lost = breakdownDownHours + plannedDownHours;
  return Math.max(0, (plannedHours - lost) / plannedHours);
}

export type PermitOutcome = {
  approvedAt: string | null;
  status: string;
};

// The old PTW metric was "approved ÷ raised". A permit can only reach ACTIVE
// through a fully signed chain, so that ratio trended to 100% by construction, // a safety KPI that could not go down. What matters is close-out discipline:
// was the isolation signed back off inside the permit's validity?
export function ptwComplianceOf(permits: PermitOutcome[]): {
  compliance: number | null;
  wentToWork: number;
  closedProperly: number;
  closedLate: number;
  notClosed: number;
} {
  const wentToWork = permits.filter((p) => !!p.approvedAt && p.status !== "CANCELLED");
  const closedProperly = wentToWork.filter((p) => p.status === "CLOSED").length;
  const closedLate = wentToWork.filter((p) => p.status === "CLOSED_LATE").length;
  const notClosed = wentToWork.filter((p) => p.status === "EXPIRED").length;
  return {
    compliance: wentToWork.length ? closedProperly / wentToWork.length : null,
    wentToWork: wentToWork.length,
    closedProperly,
    closedLate,
    notClosed,
  };
}

// Where a work order carries no estimate, fall back to this workshop's own
// median completed job rather than a fixed 2 hours.
export function medianJobHoursOf(completedDurations: (number | null | undefined)[]): number {
  const hours = completedDurations
    .map((h) => h ?? 0)
    .filter((h) => h > 0)
    .sort((a, b) => a - b);
  return hours.length ? hours[Math.floor(hours.length / 2)] : 2;
}

export function backlogHoursOf(
  openWos: { estimatedDuration?: number | null }[],
  medianJobHours: number,
): { hours: number; estimated: number; total: number } {
  const estimated = openWos.filter((w) => (w.estimatedDuration ?? 0) > 0).length;
  const hours = Math.round(
    openWos.reduce((a, w) => a + (w.estimatedDuration || medianJobHours), 0),
  );
  return { hours, estimated, total: openWos.length };
}
