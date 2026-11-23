// src/lib/maintenance/round-reminders.ts
// Telling the people who assign work that a category's round is coming and
// nobody is on it (LIMSL, 23 Nov 2026).
//
// Nobody is named against a plan row ahead of time, so the "due soon" reminder,
// which goes to the person assigned, reached nobody: a crane round three days
// away told no one. The round is the unit here, not the machine: one line per
// category and date, however many machines it covers.
//
// A round is announced seven days before, and then every day from two days
// before until somebody is assigned (assigning raises its batch). Once it is
// past its date it is overdue, and the overdue digest takes over.
//
// Pure, so the reminder scan and the tests agree on which rounds are due a word.

export type RoundRow = {
  equipmentId: string;
  plannedDate: string;
  activityType: string;
  status: string;
  responsiblePersonId: string | null;
  batchId: string | null;
  completedDate: string | null;
  category: string | null;
};

export type UpcomingRound = {
  category: string;
  plannedDate: string;
  activityType: string;
  machines: number;
  daysToGo: number;
};

/** First notice this many days ahead. */
export const ROUND_FIRST_NOTICE_DAYS = 7;
/** Daily notices from this many days ahead. */
export const ROUND_DAILY_FROM_DAYS = 2;

const dayNumber = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / 864e5;

export const isNoticeDay = (daysToGo: number) =>
  daysToGo === ROUND_FIRST_NOTICE_DAYS || (daysToGo >= 0 && daysToGo <= ROUND_DAILY_FROM_DAYS);

/** Rounds with nobody assigned that are due a notice today, soonest first. */
export function roundsToAnnounce(rows: RoundRow[], today: string): UpcomingRound[] {
  const rounds = new Map<string, UpcomingRound & { ids: Set<string> }>();
  for (const r of rows) {
    if (r.activityType !== "PM" && r.activityType !== "INS") continue;
    if (r.status !== "SCHEDULED" || r.completedDate || r.responsiblePersonId || r.batchId || !r.category) continue;
    const daysToGo = Math.round(dayNumber(r.plannedDate) - dayNumber(today));
    if (!isNoticeDay(daysToGo)) continue;
    const key = `${r.plannedDate}|${r.category}|${r.activityType}`;
    const round = rounds.get(key) ?? {
      category: r.category,
      plannedDate: r.plannedDate.slice(0, 10),
      activityType: r.activityType,
      machines: 0,
      daysToGo,
      ids: new Set<string>(),
    };
    if (!round.ids.has(r.equipmentId)) {
      round.ids.add(r.equipmentId);
      round.machines++;
    }
    rounds.set(key, round);
  }
  return [...rounds.values()]
    .map(({ ids: _ids, ...round }) => round)
    .sort((a, b) => a.plannedDate.localeCompare(b.plannedDate) || a.category.localeCompare(b.category));
}

/** One line of the notice, as a person would say it. */
export function roundLine(round: UpcomingRound, label: string, dateText: string): string {
  const what = round.activityType === "INS" ? "inspection" : "PM";
  const when = round.daysToGo === 0 ? "today" : round.daysToGo === 1 ? "tomorrow" : `in ${round.daysToGo} days`;
  return `${label} ${what}, ${dateText} (${when}), ${round.machines} machine${round.machines === 1 ? "" : "s"}`;
}
