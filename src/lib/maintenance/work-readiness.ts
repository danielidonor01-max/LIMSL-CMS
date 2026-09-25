// src/lib/maintenance/work-readiness.ts
// Whether work may start on a job today.
//
// No work order, no work. No permit, no work. Every document in the chain was
// already gated where it is created — a permit cannot be raised on an
// unapproved hazard analysis, and so on — but nothing stood at the one moment
// that matters: somebody picking up a spanner. Clocking on to a work order
// checked only that the job was not closed. So a technician could start on a
// job nobody had approved, with no permit, on the fourth day of a permit whose
// renewal nobody had signed.
//
// This is the check at that moment. It is pure: it takes what the documents
// say and today's date, and returns every condition with whether it is met, so
// the screen can show the whole list and the server can refuse on the first
// one that is not. The same answer, from the same function, on both sides.
//
// The daily rule is LIMSL's paper permit: it runs for a fixed number of days
// and is renewed one day at a time by the Asset Holder Supervisor. The first
// day is covered by the permit's own approval; every day after that needs that
// day's renewal signed before work starts — "revalidate before commencing".
import { isWithinWindow, expiryDateOf, type RenewalMarks } from "@/lib/hse/permit-validity";
import { jhaMatchesWms } from "@/lib/hse/standing-documents";

export type CheckKey = "WORK_ORDER" | "WMS" | "JHA" | "PERMIT" | "PERMIT_WINDOW" | "REVALIDATED";

export type ReadinessCheck = { key: CheckKey; label: string; ok: boolean; detail: string };

export type Readiness = {
  ok: boolean;
  checks: ReadinessCheck[];
  firstBlocker: ReadinessCheck | null;
  /** Everything is in place except today's revalidation — the one thing a
   *  technician can ask for from the job itself. */
  needsRevalidation: boolean;
};

export type ReadinessInput = {
  today: string;
  workOrder: {
    workOrderNumber?: string | null;
    status: string;
    approvalRetrospective?: boolean | null;
  } | null;
  wms: { status: string; wmsNumber?: string | null; revision?: number | null } | null;
  jha: { status: string; jhaNumber?: string | null; wmsRevision?: number | null } | null;
  permit: {
    status: string;
    permitNumber?: string | null;
    startDate?: string | null;
    validityDays?: number | null;
    renewalDays?: string | RenewalMarks | null;
  } | null;
};

const readable = (s: string | null | undefined) => String(s ?? "").toLowerCase().replace(/_/g, " ");

export function parseRenewalMarks(raw: string | RenewalMarks | null | undefined): RenewalMarks {
  if (!raw) return {};
  if (typeof raw !== "string") return raw;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? (v as RenewalMarks) : {};
  } catch {
    return {};
  }
}

export function readinessToWork(input: ReadinessInput): Readiness {
  const { today, workOrder: wo, wms, jha, permit } = input;
  const checks: ReadinessCheck[] = [];

  // ── The work order: the authorisation to do the job ──────────────────
  {
    const n = wo?.workOrderNumber ?? "The work order";
    let ok = false;
    let detail = "";
    if (!wo) detail = "No work order has been raised for this job. No work order, no work.";
    else if (wo.status === "PENDING_APPROVAL") detail = `${n} is waiting for its approval signatures.`;
    else if (wo.status === "REJECTED") detail = `${n} was rejected and has not been resubmitted.`;
    else if (wo.status === "CANCELLED") detail = `${n} was cancelled.`;
    else if (wo.status === "COMPLETED") detail = `${n} is completed. There is no more work to start on it.`;
    else {
      ok = true;
      // The one standing exception, kept deliberately: an emergency starts now
      // and is signed for after the fact. It still needs everything below.
      detail = wo.approvalRetrospective
        ? `${n} is an emergency, commenced before its signatures, which are still owed.`
        : `${n} is approved.`;
    }
    checks.push({ key: "WORK_ORDER", label: "Work order approved", ok, detail });
  }

  // ── The method statement ──────────────────────────────────────────────
  checks.push({
    key: "WMS",
    label: "Method statement approved",
    ok: wms?.status === "APPROVED",
    detail: !wms
      ? "There is no method statement for this job."
      : wms.status === "APPROVED"
        ? `${wms.wmsNumber ?? "The method statement"} is approved${wms.revision ? ` (revision ${wms.revision})` : ""}.`
        : `${wms.wmsNumber ?? "The method statement"} is ${readable(wms.status)}.`,
  });

  // ── The hazard analysis, and that it matches the method ───────────────
  {
    const n = jha?.jhaNumber ?? "The hazard analysis";
    const ok = !!jha && jha.status === "APPROVED" && jhaMatchesWms(jha, wms);
    checks.push({
      key: "JHA",
      label: "Hazard analysis approved by HSE",
      ok,
      detail: !jha
        ? "HSE have not attached a hazard analysis to this job."
        : jha.status !== "APPROVED"
          ? `${n} is ${readable(jha.status)}.`
          : !jhaMatchesWms(jha, wms)
            ? `${n} was written against an earlier revision of the method statement and must be revised by HSE.`
            : `${n} is approved.`,
    });
  }

  // ── The permit: raised, fully signed, still in force ───────────────────
  {
    const n = permit?.permitNumber ?? "The permit";
    let ok = false;
    let detail = "";
    if (!permit) detail = "HSE have not raised a permit for this job. No permit, no work.";
    else if (permit.status === "ACTIVE") {
      ok = true;
      detail = `${n} is signed and in force.`;
    } else if (permit.status === "PENDING_APPROVAL" || permit.status === "DRAFT") {
      detail = `${n} is raised but not yet fully signed.`;
    } else if (permit.status === "EXPIRED") {
      detail = `${n} has expired. HSE raise a successor before work continues.`;
    } else if (String(permit.status).startsWith("CLOSED")) {
      detail = `${n} has been closed. A new permit is needed for more work.`;
    } else {
      detail = `${n} is ${readable(permit.status)}.`;
    }
    checks.push({ key: "PERMIT", label: "Permit raised and signed by HSE", ok, detail });
  }

  // ── Today falls within the permit's validity ──────────────────────────
  {
    const start = permit?.startDate ?? null;
    const days = permit?.validityDays ?? 7;
    const ok = !!start && isWithinWindow(start, days, today);
    checks.push({
      key: "PERMIT_WINDOW",
      label: "Permit valid today",
      ok,
      detail: !start
        ? "The permit has no start date."
        : ok
          ? `Valid ${start} to ${expiryDateOf(start, days)}.`
          : today < start
            ? `The permit starts on ${start}.`
            : `The permit ran out on ${expiryDateOf(start, days)}.`,
    });
  }

  // ── Today's revalidation ──────────────────────────────────────────────
  {
    const start = permit?.startDate ?? null;
    const mark = parseRenewalMarks(permit?.renewalDays)[today];
    let ok = false;
    let detail = "";
    if (start && today === start) {
      ok = true;
      detail = "First day of the permit, covered by its own approval.";
    } else if (mark?.status === "WORKED") {
      ok = true;
      detail = `Revalidated today${mark.time ? ` at ${mark.time}` : ""}${mark.signedByName ? ` by ${mark.signedByName}` : ""}.`;
    } else if (mark?.status === "NOT_WORKED") {
      detail = "Today is marked on the permit as a day not worked.";
    } else {
      detail =
        "Today's revalidation has not been signed. The Maintenance Manager revalidates the permit " +
        "for the day before work starts.";
    }
    checks.push({ key: "REVALIDATED", label: "Revalidated for today", ok, detail });
  }

  const firstBlocker = checks.find((c) => !c.ok) ?? null;
  return {
    ok: !firstBlocker,
    checks,
    firstBlocker,
    needsRevalidation: !!firstBlocker && firstBlocker.key === "REVALIDATED" && !!permit?.startDate && today !== permit.startDate,
  };
}
