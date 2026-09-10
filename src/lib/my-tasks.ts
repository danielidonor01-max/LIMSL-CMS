// src/lib/my-tasks.ts
// What one technician has to do, in the order they have to do it.
//
// Finding today's work meant opening the schedule, filtering to your own name,
// and reading down 81 rows for the three that were yours. That is a filter, not
// a task list, and it puts the burden of noticing an overdue job on the person
// least able to see the whole picture.
//
// This module is the ordering, kept separate from the route so it can be tested
// without a database. The rule it encodes is small but it is the whole product
// decision: overdue first, oldest overdue at the very top, because the job that
// has been waiting longest is the one most likely to have been forgotten.

export type TaskKind = "WORK_ORDER" | "SCHEDULE";

export type Task = {
  kind: TaskKind;
  id: string;
  code: string | null;
  title: string;
  href: string;
  dueDate: string | null;
  status: string;
  /** Assigned to you, or you are named as an assistant on somebody else's job. */
  assisting?: boolean;
  /** Work that cannot start yet, with the reason. Shown, never hidden. */
  blockedReason?: string | null;
};

export type Bucket = "OVERDUE" | "TODAY" | "SOON" | "LATER" | "UNDATED";

const SOON_DAYS = 7;

function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export function bucketOf(dueDate: string | null | undefined, today: string): Bucket {
  // An undated job is not "later". It has no date at all, which is its own
  // problem, and folding it in with next month's work hides that.
  if (!dueDate) return "UNDATED";
  if (dueDate < today) return "OVERDUE";
  if (dueDate === today) return "TODAY";
  return daysBetween(today, dueDate) <= SOON_DAYS ? "SOON" : "LATER";
}

export type GroupedTasks = Record<Bucket, Task[]>;

export function groupTasks(tasks: Task[], today: string): GroupedTasks {
  const out: GroupedTasks = { OVERDUE: [], TODAY: [], SOON: [], LATER: [], UNDATED: [] };

  for (const t of tasks) out[bucketOf(t.dueDate, today)].push(t);

  // Oldest overdue first: the job waiting longest is the one most likely to
  // have been forgotten. Everything else reads soonest-first, which is the
  // order it will actually be worked in.
  out.OVERDUE.sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));
  for (const k of ["TODAY", "SOON", "LATER"] as const) {
    out[k].sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));
  }

  return out;
}

export const BUCKET_LABEL: Record<Bucket, string> = {
  OVERDUE: "Overdue",
  TODAY: "Today",
  SOON: "This week",
  LATER: "Later",
  UNDATED: "No date set",
};

// The sentence at the top of the page. Worst-first, the same rule the dashboard
// and the KPI page follow, so the three read as one system rather than three
// opinions about what matters.
export function headlineFor(g: GroupedTasks, firstName?: string | null): string {
  const who = firstName ? `, ${firstName}` : "";
  const n = (b: Bucket) => g[b].length;

  if (n("OVERDUE") > 0) {
    return n("OVERDUE") === 1
      ? `One job is overdue${who}.`
      : `${n("OVERDUE")} jobs are overdue${who}.`;
  }
  if (n("TODAY") > 0) {
    return n("TODAY") === 1 ? `One job is due today${who}.` : `${n("TODAY")} jobs are due today${who}.`;
  }
  if (n("SOON") > 0) {
    return n("SOON") === 1 ? `One job this week${who}.` : `${n("SOON")} jobs this week${who}.`;
  }
  if (n("LATER") > 0 || n("UNDATED") > 0) return `Nothing is due yet${who}.`;
  return `Nothing is assigned to you${who}.`;
}

export function totalOutstanding(g: GroupedTasks): number {
  return (Object.keys(g) as Bucket[]).reduce((a, k) => a + g[k].length, 0);
}
