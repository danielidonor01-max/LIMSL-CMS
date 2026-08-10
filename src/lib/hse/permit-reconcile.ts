// src/lib/hse/permit-reconcile.ts
// A permit's status is driven by its signatures and by the calendar, never by a
// button:
//   PENDING_APPROVAL -> ACTIVE          the PTW chain is fully signed, work may begin
//   ACTIVE           -> CLOSED          the close-out chain is fully signed
//   validity elapsed, job done          -> CLOSED_LATE
//   validity elapsed, job unfinished    -> CLOSED_WORK_ONGOING, successor raised
//
// The last case is the one LIMSL actually works to. The signatures on a permit
// authorised a specific week; when that week runs out they cannot be stretched
// over another, so the permit is closed as work ongoing and a fresh one
// referencing it starts its own seven days.
import { db } from "@/lib/db";
import { permits, auditLog } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { nextDocNumber } from "@/lib/doc-number";
import { ensureSignoffChain, getSignoffChain } from "@/lib/signoff/service";
import { chainSummary } from "@/lib/signoff/chains";
import { notify } from "@/lib/notifications";
import { PERMIT_ISSUE_ROLES } from "@/lib/roles";
import {
  DEFAULT_PERMIT_VALIDITY_DAYS,
  normaliseValidityDays,
  expiryDateOf,
  expiryDecision,
  renewalSummary,
  workOngoingClosureNote,
  type RenewalMarks,
} from "./permit-validity";

type PermitRow = typeof permits.$inferSelect;

// Permits raised before the validity grid existed carry only an issuedDate
// timestamp. Falling back to its date part keeps them inside a window rather
// than treating them as having none.
export function startDateOf(p: Pick<PermitRow, "startDate" | "issuedDate" | "createdAt">): string {
  return String(p.startDate ?? p.issuedDate ?? p.createdAt).slice(0, 10);
}

export function parseRenewals(raw: string | null): RenewalMarks {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as RenewalMarks) : {};
  } catch {
    return {};
  }
}

// The successor carries the same job, the same supporting documents and the
// same people, and starts PENDING_APPROVAL with its own week.
async function raiseSuccessor(previous: PermitRow, today: string) {
  const permitNumber = await nextDocNumber("PTW");
  const id = nanoid();
  const validityDays = normaliseValidityDays(previous.validityDays);

  await db.insert(permits).values({
    id,
    permitNumber,
    taskNo: previous.taskNo,
    workOrderId: previous.workOrderId,
    equipmentId: previous.equipmentId,
    workDescription: previous.workDescription,
    hazardsIdentified: previous.hazardsIdentified,
    controlMeasures: previous.controlMeasures,
    wmsId: previous.wmsId,
    jhaId: previous.jhaId,
    jha: previous.jha,
    lotoApplied: previous.lotoApplied,
    ppeRequired: previous.ppeRequired,
    areaBarricaded: previous.areaBarricaded,
    workTypes: previous.workTypes,
    facility: previous.facility,
    workArea: previous.workArea,
    zoneClassification: previous.zoneClassification,
    startDate: today,
    startTime: previous.startTime,
    durationHours: previous.durationHours,
    workerCount: previous.workerCount,
    permitDepartment: previous.permitDepartment,
    validityDays,
    documentMarks: previous.documentMarks,
    precautionMarks: previous.precautionMarks,
    ppeMarks: previous.ppeMarks,
    additionalRequirements: previous.additionalRequirements,
    // The grid starts empty. Days worked under the old permit belong to the old
    // permit, and carrying them forward would double-count the evidence.
    renewalDays: null,
    issuedById: previous.issuedById,
    permitHolderId: previous.permitHolderId,
    permitHolderName: previous.permitHolderName,
    contractorId: previous.contractorId,
    issuedDate: new Date().toISOString(),
    expiryDate: expiryDateOf(today, validityDays),
    supersedesPermitId: previous.id,
    status: "PENDING_APPROVAL",
  });

  await ensureSignoffChain(
    "PERMIT",
    id,
    permitNumber,
    previous.permitHolderId
      ? {
          PERMIT_HOLDER: {
            id: previous.permitHolderId,
            name: previous.permitHolderName ?? "Permit holder",
          },
        }
      : undefined,
  );

  return { id, permitNumber };
}

export async function reconcilePermits() {
  const all = await db.select().from(permits);
  const today = new Date().toISOString().slice(0, 10);

  for (const p of all) {
    if (
      p.status === "CLOSED" ||
      p.status === "CLOSED_LATE" ||
      p.status === "CLOSED_WORK_ONGOING" ||
      p.status === "CANCELLED"
    ) {
      continue;
    }

    const start = startDateOf(p);
    const validityDays = normaliseValidityDays(p.validityDays);

    if (p.status === "PENDING_APPROVAL") {
      const chain = await getSignoffChain("PERMIT", p.id);
      if (chain.length && chainSummary(chain).complete) {
        await db
          .update(permits)
          .set({ status: "ACTIVE", approvedAt: new Date().toISOString() })
          .where(eq(permits.id, p.id));
        // Authorised, so open the close-out chain the job will be signed off on.
        await ensureSignoffChain("PERMIT_CLOSEOUT", p.id);
        continue;
      }
    }

    const closeout = await getSignoffChain("PERMIT_CLOSEOUT", p.id);
    const closeoutComplete = closeout.length > 0 && chainSummary(closeout).complete;

    // A permit that WAS authorised put real isolation on real machinery. Even
    // after its week is over somebody still has to sign "isolation removed, safe
    // to re-energise", so close-out stays reachable on an expired permit.
    if (closeoutComplete && (p.status === "ACTIVE" || p.approvedAt)) {
      await db
        .update(permits)
        .set({
          status: "CLOSED",
          closureReason: "COMPLETED",
          closedAt: new Date().toISOString(),
        })
        .where(eq(permits.id, p.id));
      continue;
    }

    const workComplete = closeoutComplete || p.handbackOutcome === "COMPLETED";
    const decision = expiryDecision({
      startDate: start,
      validityDays,
      today,
      status: p.status,
      workComplete,
    });

    if (decision.action === "CLOSE_WORK_ONGOING") {
      const summary = renewalSummary(start, validityDays, parseRenewals(p.renewalDays), today);

      // Only an authorised permit gets a successor. One that never collected its
      // signatures had no work under it to continue.
      const successor = p.approvedAt ? await raiseSuccessor(p, today) : null;

      await db
        .update(permits)
        .set({
          status: p.approvedAt ? "CLOSED_WORK_ONGOING" : "EXPIRED",
          closureReason: p.approvedAt ? "WORK_ONGOING" : "CANCELLED",
          closureNote: p.approvedAt
            ? workOngoingClosureNote(summary, successor?.permitNumber)
            : `Validity period elapsed on ${summary.expiresOn} before the permit was fully signed. A fresh permit must be raised.`,
          closedAt: new Date().toISOString(),
          supersededByPermitId: successor?.id ?? null,
        })
        .where(eq(permits.id, p.id));

      await db.insert(auditLog).values({
        id: nanoid(),
        userId: null,
        userName: "System",
        action: "UPDATE",
        entityType: "permit",
        entityId: p.id,
        entityDescription: successor
          ? `${p.permitNumber} closed as work ongoing, continued under ${successor.permitNumber}`
          : `${p.permitNumber} expired before it was fully signed`,
      });

      if (successor) {
        try {
          await notify({
            event: "GENERAL",
            title: `${p.permitNumber} has run out, ${successor.permitNumber} raised`,
            body:
              `The validity period on ${p.permitNumber} elapsed with the work unfinished. ` +
              `${successor.permitNumber} continues it and needs the full signature chain before work resumes.`,
            linkPath: `/permits/${successor.id}`,
            relatedEntityType: "permit",
            relatedEntityId: successor.id,
            userIds: p.permitHolderId ? [p.permitHolderId] : undefined,
            roles: PERMIT_ISSUE_ROLES,
          });
        } catch (err) {
          console.warn("permit supersession: notify failed", err);
        }
      }
      continue;
    }

    if (decision.action === "CLOSE_COMPLETE") {
      await db
        .update(permits)
        .set({
          status: "CLOSED_LATE",
          closureReason: "COMPLETED",
          closureNote: `Work handed back complete. Closed after the validity period ended on ${expiryDateOf(start, validityDays)}.`,
          closedAt: new Date().toISOString(),
        })
        .where(eq(permits.id, p.id));
      continue;
    }

    if (decision.action === "WARN") {
      // A successor needs its full signature chain before work can resume, and
      // that cannot be collected on the morning it is needed.
      try {
        await notify({
          event: "GENERAL",
          title: `${p.permitNumber} expires in ${decision.daysLeft} day(s)`,
          body:
            `${p.workDescription}. If the job will not finish inside the validity period, ` +
            `raise the continuation permit now so it is signed before this one runs out.`,
          linkPath: `/permits/${p.id}`,
          relatedEntityType: "permit",
          relatedEntityId: p.id,
          userIds: p.permitHolderId ? [p.permitHolderId] : undefined,
          roles: PERMIT_ISSUE_ROLES,
        });
      } catch (err) {
        console.warn("permit expiry warning: notify failed", err);
      }
    }
  }
}

export { DEFAULT_PERMIT_VALIDITY_DAYS };
