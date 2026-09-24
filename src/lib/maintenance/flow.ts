// src/lib/maintenance/flow.ts
// The order the maintenance documents have to happen in, written down once.
//
// Every document in this system already existed and was already gated: the
// permit route refuses an unapproved JHA, the JHA hangs off a WMS, the WMS
// hangs off a work order. What was missing is the thing that makes anybody
// create the next one. A method statement nobody is waiting for is a method
// statement nobody writes, which is why the permits, WMSs and hazard analyses
// sat around dormant and unconnected to the work they were meant to authorise.
//
// So this module holds the forward direction. Given what exists so far it
// answers: what is the next document, who raises it, and what is waiting on
// it. The detail pages read it to show one specific call to action, the
// trackers read it to show where a job is stuck, and every transition writes
// an audit row naming the document before and the document after.
//
// Everything here is pure. No database, no session — it takes facts and
// returns a verdict, so the sequence can be tested without standing anything
// up, and so the UI and the API gate cannot drift apart on what comes next.
import {
  WORK_ASSIGN_ROLES,
  WMS_WRITE_ROLES,
  JHA_WRITE_ROLES,
  PERMIT_ISSUE_ROLES,
  WORK_ORDER_ASSIGNEE_ROLES,
  REPAIR_AUTHORISE_ROLES,
} from "@/lib/roles";

export type FlowDoc =
  | "SCHEDULE"
  | "BATCH"
  | "WORK_ORDER"
  | "WMS"
  | "JHA"
  | "PERMIT"
  | "WORK"
  | "REPORT";

export type FlowStep = {
  key: string;
  /** What this step is called on screen. */
  label: string;
  /** The document this step produces. */
  doc: FlowDoc;
  /** Who may complete it. An empty list means the people already on the job. */
  roles: string[];
  /** The call to action, written as an instruction to whoever owns it. */
  action: string;
  /** Why the step exists, shown to whoever is being held up by it. */
  because: string;
};

// ─── The PM flow ────────────────────────────────────────────────────────────
// The annual plan schedules a category on a date, not a machine. Everything
// from the batch onwards covers every machine of that category due that day:
// one assignment, one method statement, one hazard analysis, one permit.
export const PM_FLOW: FlowStep[] = [
  {
    key: "BATCH",
    label: "PM batch",
    doc: "BATCH",
    roles: WORK_ASSIGN_ROLES,
    action: "Raise the batch for this category and date",
    because: "The machines due together are one job, and they share one set of safety documents.",
  },
  {
    key: "ASSIGN",
    label: "Assignment",
    doc: "BATCH",
    roles: WORK_ASSIGN_ROLES,
    action: "Assign the batch to one person",
    because: "Assigning the batch assigns every machine in it, and tells that person it is theirs.",
  },
  {
    key: "WORK_ORDER",
    label: "Work orders",
    doc: "WORK_ORDER",
    roles: [],
    action: "Sign the work orders raised for the machines in this batch",
    because: "A work order is the authorisation to do the job. No PM starts without one.",
  },
  {
    key: "WMS",
    label: "Method statement",
    doc: "WMS",
    roles: WMS_WRITE_ROLES,
    action: "Write the method statement covering every machine in the batch",
    because: "HSE builds the hazard analysis from the method statement. No WMS, no permit.",
  },
  {
    key: "JHA",
    label: "Hazard analysis",
    doc: "JHA",
    roles: JHA_WRITE_ROLES,
    action: "Build the hazard analysis from the approved method statement",
    because: "A permit is issued against an approved hazard analysis, never against a bare request.",
  },
  {
    key: "PERMIT",
    label: "Permit to work",
    doc: "PERMIT",
    roles: PERMIT_ISSUE_ROLES,
    action: "Raise the permit covering the batch",
    because: "No permit, no PM. The permit is the document that lets somebody pick up a spanner.",
  },
  {
    key: "WORK",
    label: "PM execution",
    doc: "WORK",
    roles: [],
    action: "Complete the PM checklist for each machine and record the parts used",
    because: "Parts booked against the job are what keep the critical spares register honest.",
  },
];

// ─── The CM flow ────────────────────────────────────────────────────────────
// A breakdown is one machine, so unlike a PM its method statement, its hazard
// analysis and its permit are all specific to that machine.
export const CM_FLOW: FlowStep[] = [
  {
    key: "REPORT",
    label: "Fault report",
    doc: "REPORT",
    roles: [],
    action: "Report the fault",
    because: "Nothing moves until the breakdown is on the record.",
  },
  {
    key: "MOTION",
    label: "Repair authorised",
    doc: "REPORT",
    roles: REPAIR_AUTHORISE_ROLES,
    action: "Move the repair to the Foreman",
    because:
      "The Factory Manager decides the repair goes ahead and hands it to the Foreman to resource.",
  },
  {
    key: "ASSIGN",
    label: "Assignment",
    doc: "REPORT",
    roles: WORK_ASSIGN_ROLES,
    action: "Assign the repair to a technician",
    because: "The Foreman picks who does the work, and that person raises the paperwork.",
  },
  {
    key: "WORK_ORDER",
    label: "Work order",
    doc: "WORK_ORDER",
    roles: WORK_ORDER_ASSIGNEE_ROLES,
    action: "Raise the work order for the affected machine",
    because: "A work order is the authorisation to do the job. No repair starts without one.",
  },
  {
    key: "WMS",
    label: "Method statement",
    doc: "WMS",
    roles: WMS_WRITE_ROLES,
    action: "Write the method statement for the affected machine",
    because: "HSE builds the hazard analysis from it, and the permit rests on both.",
  },
  {
    key: "JHA",
    label: "Hazard analysis",
    doc: "JHA",
    roles: JHA_WRITE_ROLES,
    action: "Build the hazard analysis from the approved method statement",
    because: "A permit is issued against an approved hazard analysis, never against a bare request.",
  },
  {
    key: "PERMIT",
    label: "Permit to work",
    doc: "PERMIT",
    roles: PERMIT_ISSUE_ROLES,
    action: "Raise the permit for the repair",
    because: "No permit, no repair work.",
  },
  {
    key: "WORK",
    label: "Repair and close-out",
    doc: "WORK",
    roles: [],
    action: "Carry out the repair, record the parts used and close it out",
    because: "Parts booked against the job are what keep the critical spares register honest.",
  },
];

// What is known about a job so far. Every field is optional because the
// earliest stages genuinely do not have most of them yet.
export type FlowFacts = {
  batchId?: string | null;
  assignedToId?: string | null;
  /** Work orders belonging to the job. */
  workOrderCount?: number;
  wmsStatus?: string | null;
  jhaStatus?: string | null;
  permitStatus?: string | null;
  /** CM only: the Factory Manager has moved it to the Foreman. */
  motionedAt?: string | null;
  completed?: boolean;
};

export type FlowState = {
  steps: FlowStep[];
  /** The step waiting to be done. Equals steps.length once the job is finished. */
  currentIndex: number;
  current: FlowStep | null;
  /** Keys of the steps already satisfied. */
  done: string[];
};

const APPROVED = (s: string | null | undefined) => s === "APPROVED";

// A permit counts as raised once it exists and has not been refused. It is
// still doing its job while it waits for its own signatures, so treating only
// ACTIVE as raised would tell HSE to raise a second one.
const LIVE_PERMIT = (s: string | null | undefined) => !!s && s !== "REJECTED" && s !== "CANCELLED";

// The flow is a sequence, not a checklist: the first unsatisfied step is where
// the job is, and nothing past it counts even if it somehow exists.
function evaluate(steps: FlowStep[], satisfied: (key: string) => boolean): FlowState {
  const done: string[] = [];
  for (const step of steps) {
    if (!satisfied(step.key)) break;
    done.push(step.key);
  }
  return { steps, currentIndex: done.length, current: steps[done.length] ?? null, done };
}

export function pmFlowState(facts: FlowFacts): FlowState {
  return evaluate(PM_FLOW, (key) => {
    switch (key) {
      case "BATCH":
        return !!facts.batchId;
      case "ASSIGN":
        return !!facts.assignedToId;
      case "WORK_ORDER":
        return (facts.workOrderCount ?? 0) > 0;
      case "WMS":
        return APPROVED(facts.wmsStatus);
      case "JHA":
        return APPROVED(facts.jhaStatus);
      case "PERMIT":
        return LIVE_PERMIT(facts.permitStatus);
      case "WORK":
        return !!facts.completed;
      default:
        return false;
    }
  });
}

export function cmFlowState(facts: FlowFacts): FlowState {
  return evaluate(CM_FLOW, (key) => {
    switch (key) {
      // Reporting is what creates the record, so by the time anything asks,
      // it has happened.
      case "REPORT":
        return true;
      case "MOTION":
        return !!facts.motionedAt;
      case "ASSIGN":
        return !!facts.assignedToId;
      case "WORK_ORDER":
        return (facts.workOrderCount ?? 0) > 0;
      case "WMS":
        return APPROVED(facts.wmsStatus);
      case "JHA":
        return APPROVED(facts.jhaStatus);
      case "PERMIT":
        return LIVE_PERMIT(facts.permitStatus);
      case "WORK":
        return !!facts.completed;
      default:
        return false;
    }
  });
}

/** Whether this person may take the step, by role. */
export function canTake(step: FlowStep | null, role: string | null | undefined): boolean {
  if (!step) return false;
  if (step.roles.length === 0) return true;
  return step.roles.includes(role ?? "");
}
