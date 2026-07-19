// src/lib/escalations.ts
// Actively chases overdue work: overdue maintenance activities and lapsed permits
// are reconciled to today, then the responsible people are nagged through the
// notification outbox (in-app now, WhatsApp once a provider is configured).
//
// Notifications are DIGESTS, not one-per-item — each responsible person gets a
// single summary of their overdue work, and managers get one plant-wide summary,
// so a backlog of 70 items doesn't mean 70 messages. A per-day dedup guard makes
// the scan safe to run repeatedly (manual button or a daily cron).
import { db } from "@/lib/db";
import { maintenanceSchedule, permits, equipment, notifications } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { notify } from "@/lib/notifications";
import { reconcileSchedule } from "@/lib/schedule";
import { reconcilePermits } from "@/app/api/permits/route";
import { PERMIT_ISSUE_ROLES } from "@/lib/roles";

// How many days ahead counts as "due soon" for a proactive reminder.
const REMINDER_LEAD_DAYS = Number(process.env.REMINDER_LEAD_DAYS || 3);

export type EscalationSummary = {
  overdueActivities: number;
  upcomingActivities: number;
  lapsedPermits: number;
  notificationsSent: number;
  skippedDuplicate: number;
};

// Has an escalation for this exact target already gone out within `hours`? Guards
// against re-nagging on repeated runs. Compares in JS because SQLite's
// datetime('now') default is space-separated, not ISO — a raw string compare
// against an ISO cutoff would be wrong across the date/time separator.
async function recentlyEscalated(
  entityType: string,
  entityId: string,
  now: Date,
  hours = 20,
): Promise<boolean> {
  const rows = await db
    .select({ createdAt: notifications.createdAt })
    .from(notifications)
    .where(
      and(
        eq(notifications.event, "ESCALATION"),
        eq(notifications.relatedEntityType, entityType),
        eq(notifications.relatedEntityId, entityId),
      ),
    );
  const cutoff = now.getTime() - hours * 3600 * 1000;
  return rows.some((r) => {
    const t = new Date(String(r.createdAt).replace(" ", "T")).getTime();
    return !Number.isNaN(t) && t >= cutoff;
  });
}

export async function runEscalations(now = new Date()): Promise<EscalationSummary> {
  // Make statuses current before deciding what's overdue.
  await reconcileSchedule(now);
  await reconcilePermits();

  const summary: EscalationSummary = {
    overdueActivities: 0,
    upcomingActivities: 0,
    lapsedPermits: 0,
    notificationsSent: 0,
    skippedDuplicate: 0,
  };

  const [sched, perms, equip] = await Promise.all([
    db.select().from(maintenanceSchedule),
    db.select().from(permits),
    db.select().from(equipment),
  ]);
  const eqLabel = new Map(equip.map((e) => [e.id, `${e.assetId} — ${e.name}`]));

  const fmtList = (items: string[], cap = 8) =>
    items.slice(0, cap).map((s) => `• ${s}`).join("\n") +
    (items.length > cap ? `\n…and ${items.length - cap} more.` : "");

  // ── Overdue maintenance activities ─────────────────────────────────────────
  const overdue = sched.filter((s) => s.status === "OVERDUE");
  summary.overdueActivities = overdue.length;

  // One digest per responsible person.
  const byPerson = new Map<string, typeof overdue>();
  for (const s of overdue) {
    if (!s.responsiblePersonId) continue;
    byPerson.set(s.responsiblePersonId, [...(byPerson.get(s.responsiblePersonId) ?? []), s]);
  }
  for (const [personId, items] of byPerson) {
    if (await recentlyEscalated("escalation:schedule", personId, now)) {
      summary.skippedDuplicate++;
      continue;
    }
    const body = `You have ${items.length} overdue maintenance ${
      items.length === 1 ? "activity" : "activities"
    }:\n${fmtList(items.map((i) => `${eqLabel.get(i.equipmentId) ?? "Equipment"} — ${i.activityType} (due ${i.plannedDate})`))}`;
    const sent = await notify({
      event: "ESCALATION",
      title: `Overdue maintenance — ${items.length} item${items.length === 1 ? "" : "s"}`,
      body,
      linkPath: "/schedule",
      relatedEntityType: "escalation:schedule",
      relatedEntityId: personId,
      userIds: [personId],
    });
    if (sent.length) summary.notificationsSent += sent.length;
  }

  // One plant-wide digest to the maintenance leadership.
  if (overdue.length) {
    if (await recentlyEscalated("escalation:schedule-all", "ALL", now)) {
      summary.skippedDuplicate++;
    } else {
      const unassigned = overdue.filter((s) => !s.responsiblePersonId).length;
      const body =
        `${overdue.length} maintenance ${overdue.length === 1 ? "activity is" : "activities are"} overdue across the plant` +
        `${unassigned ? ` (${unassigned} with no one assigned)` : ""}. Review the schedule and assign, complete, or reschedule them.`;
      const sent = await notify({
        event: "ESCALATION",
        title: `${overdue.length} overdue maintenance ${overdue.length === 1 ? "activity" : "activities"}`,
        body,
        linkPath: "/schedule",
        relatedEntityType: "escalation:schedule-all",
        relatedEntityId: "ALL",
        roles: ["MAINTENANCE_MANAGER", "FOREMAN", "FACTORY_MANAGER"],
      });
      if (sent.length) summary.notificationsSent += sent.length;
    }
  }

  // ── Due-soon reminders ─────────────────────────────────────────────────────
  // Proactive heads-up to the responsible person BEFORE an activity goes overdue.
  // Reconcile has already flipped past-due items to OVERDUE, so anything still
  // SCHEDULED is today-or-future.
  const today = now.toISOString().slice(0, 10);
  const horizon = new Date(now.getTime() + REMINDER_LEAD_DAYS * 86_400_000).toISOString().slice(0, 10);
  const upcoming = sched.filter(
    (s) => s.status === "SCHEDULED" && !s.completedDate && s.plannedDate >= today && s.plannedDate <= horizon,
  );
  summary.upcomingActivities = upcoming.length;

  const upcomingByPerson = new Map<string, typeof upcoming>();
  for (const s of upcoming) {
    if (!s.responsiblePersonId) continue;
    upcomingByPerson.set(s.responsiblePersonId, [...(upcomingByPerson.get(s.responsiblePersonId) ?? []), s]);
  }
  for (const [personId, items] of upcomingByPerson) {
    if (await recentlyEscalated("escalation:schedule-upcoming", personId, now)) {
      summary.skippedDuplicate++;
      continue;
    }
    const body = `You have ${items.length} maintenance ${
      items.length === 1 ? "activity" : "activities"
    } due in the next ${REMINDER_LEAD_DAYS} day${REMINDER_LEAD_DAYS === 1 ? "" : "s"}:\n${fmtList(
      items.map((i) => `${eqLabel.get(i.equipmentId) ?? "Equipment"} — ${i.activityType} (due ${i.plannedDate})`),
    )}`;
    const sent = await notify({
      event: "ESCALATION",
      title: `Maintenance due soon — ${items.length} item${items.length === 1 ? "" : "s"}`,
      body,
      linkPath: "/schedule",
      relatedEntityType: "escalation:schedule-upcoming",
      relatedEntityId: personId,
      userIds: [personId],
    });
    if (sent.length) summary.notificationsSent += sent.length;
  }

  // ── Lapsed permits ─────────────────────────────────────────────────────────
  const lapsed = perms.filter((p) => p.status === "EXPIRED");
  summary.lapsedPermits = lapsed.length;
  if (lapsed.length) {
    if (await recentlyEscalated("escalation:permits", "ALL", now)) {
      summary.skippedDuplicate++;
    } else {
      const body =
        `${lapsed.length} permit${lapsed.length === 1 ? " has" : "s have"} lapsed without close-out and must be reissued or formally closed:\n` +
        fmtList(lapsed.map((p) => `${p.permitNumber}${p.permitHolderName ? ` (holder: ${p.permitHolderName})` : ""}`));
      const sent = await notify({
        event: "ESCALATION",
        title: `${lapsed.length} lapsed permit${lapsed.length === 1 ? "" : "s"}`,
        body,
        linkPath: "/permits",
        relatedEntityType: "escalation:permits",
        relatedEntityId: "ALL",
        roles: PERMIT_ISSUE_ROLES,
      });
      if (sent.length) summary.notificationsSent += sent.length;
    }
  }

  return summary;
}
