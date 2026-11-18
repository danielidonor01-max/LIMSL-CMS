// src/app/api/permits/[id]/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { permits, equipment, auditLog, wmsDocuments, jhaDocuments, workOrders, pmBatches, signoffs } from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { notify } from "@/lib/notifications";
import { CANCEL_REASONS, cancelNote } from "@/lib/hse/permit-cancel";
import { permitMachines } from "@/lib/hse/permit-machines";
import { nanoid } from "nanoid";
import { requireRoles } from "@/lib/authz";
import { PERMIT_WRITE_ROLES, PERMIT_ISSUE_ROLES } from "@/lib/roles";
import { getSignoffChain } from "@/lib/signoff/service";
import { chainSummary } from "@/lib/signoff/chains";
import { reconcilePermits, startDateOf, parseRenewals } from "@/lib/hse/permit-reconcile";
import { normaliseValidityDays, permitDays, renewalSummary, withIssueDay } from "@/lib/hse/permit-validity";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await reconcilePermits();

    const { id } = await params;
    const [permit] = await db.select().from(permits).where(eq(permits.id, id)).limit(1);
    if (!permit) {
      return NextResponse.json({ error: "Permit not found" }, { status: 404 });
    }

    const [eq1] = await db
      .select()
      .from(equipment)
      .where(eq(equipment.id, permit.equipmentId))
      .limit(1);

    // Every machine the permit covers, in the order the permit lists them.
    const machineIds = permitMachines(permit.equipmentIds, permit.equipmentId);
    const machineRows = machineIds.length
      ? await db
          .select({ id: equipment.id, assetId: equipment.assetId, name: equipment.name, location: equipment.location })
          .from(equipment)
          .where(inArray(equipment.id, machineIds))
      : [];
    const machines = machineIds
      .map((mid) => machineRows.find((m) => m.id === mid))
      .filter((m): m is (typeof machineRows)[number] => !!m);

    let batch = null;
    if (permit.batchId) {
      const [b] = await db
        .select({ id: pmBatches.id, batchNumber: pmBatches.batchNumber, workOrderNumber: pmBatches.workOrderNumber, title: pmBatches.title })
        .from(pmBatches)
        .where(eq(pmBatches.id, permit.batchId))
        .limit(1);
      batch = b ?? null;
    }

    const approvalChain = await getSignoffChain("PERMIT", id);
    const closeoutChain = await getSignoffChain("PERMIT_CLOSEOUT", id);

    // The chain behind the permit: the work order that authorised the job, the
    // method statement for it, and the hazard analysis it was issued against.
    let wms = null;
    if (permit.wmsId) {
      const [w] = await db.select().from(wmsDocuments).where(eq(wmsDocuments.id, permit.wmsId)).limit(1);
      wms = w ? { id: w.id, wmsNumber: w.wmsNumber, title: w.title, status: w.status } : null;
    }

    let jha = null;
    if (permit.jhaId) {
      const [j] = await db.select().from(jhaDocuments).where(eq(jhaDocuments.id, permit.jhaId)).limit(1);
      jha = j
        ? { id: j.id, jhaNumber: j.jhaNumber, title: j.title, status: j.status, steps: j.steps }
        : null;
    }

    let workOrder = null;
    if (permit.workOrderId) {
      const [w] = await db.select().from(workOrders).where(eq(workOrders.id, permit.workOrderId)).limit(1);
      workOrder = w
        ? { id: w.id, workOrderNumber: w.workOrderNumber, title: w.title, status: w.status }
        : null;
    }

    // Permits either side of this one, so an auditor can walk a job that ran
    // over several weeks in both directions.
    let supersedes = null;
    if (permit.supersedesPermitId) {
      const [prev] = await db
        .select({ id: permits.id, permitNumber: permits.permitNumber })
        .from(permits)
        .where(eq(permits.id, permit.supersedesPermitId))
        .limit(1);
      supersedes = prev ?? null;
    }
    let supersededBy = null;
    if (permit.supersededByPermitId) {
      const [next] = await db
        .select({ id: permits.id, permitNumber: permits.permitNumber })
        .from(permits)
        .where(eq(permits.id, permit.supersededByPermitId))
        .limit(1);
      supersededBy = next ?? null;
    }

    const start = startDateOf(permit);
    const validityDays = normaliseValidityDays(permit.validityDays);
    const today = new Date().toISOString().slice(0, 10);
    // The last approval signature is who put the permit in force on day one.
    const lastApprover = [...approvalChain]
      .filter((s) => s.status === "SIGNED" && s.signedAt)
      .sort((a, b) => String(a.signedAt).localeCompare(String(b.signedAt)))
      .pop();
    const marks = withIssueDay(
      parseRenewals(permit.renewalDays),
      start,
      permit.approvedAt ?? lastApprover?.signedAt ?? null,
      lastApprover?.signedByName ?? null,
    );

    // A closed or cancelled permit's record stops on the day it ended: the
    // days after it are not gaps, and it has no days "left".
    const ended = ["CLOSED", "CLOSED_LATE", "CLOSED_WORK_ONGOING", "CANCELLED", "BACKFILLED"].includes(permit.status);
    const endedOn = ended ? String(permit.closedAt ?? permit.acceptedAt ?? today).slice(0, 10) : null;
    const asOf = endedOn && endedOn < today ? endedOn : today;

    return NextResponse.json({
      ...permit,
      equipment: eq1 ?? null,
      machines,
      batch,
      wms,
      jhaDocument: jha,
      workOrder,
      supersedes,
      supersededBy,
      validity: {
        startDate: start,
        validityDays,
        days: permitDays(start, validityDays),
        marks,
        endedOn,
        summary: renewalSummary(start, validityDays, marks, asOf),
      },
      approval: chainSummary(approvalChain),
      closeout: closeoutChain.length ? chainSummary(closeoutChain) : null,
      // The printed permit carries the signatures themselves, not a count of
      // them: it is filed as the evidence that the work was authorised.
      approvalSteps: approvalChain.map((c) => ({
        roleLabel: c.roleLabel,
        status: c.status,
        signedByName: c.signedByName,
        signedAt: c.signedAt,
        signatureData: c.signatureData,
      })),
      closeoutSteps: closeoutChain.map((c) => ({
        roleLabel: c.roleLabel,
        status: c.status,
        signedByName: c.signedByName,
        signedAt: c.signedAt,
        signatureData: c.signatureData,
      })),
    });
  } catch (error: any) {
    console.error("Failed to fetch permit:", error);
    return NextResponse.json({ error: "Failed to fetch permit" }, { status: 500 });
  }
}

// Cancel a permit. Approval and close-out are NOT actions here, they are driven
// by the sign-off chains (see reconcilePermits), so a permit can never be marked
// approved or closed without the required signatures.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const gate = await requireRoles(PERMIT_WRITE_ROLES);
    if (gate.res) return gate.res;

    const { id } = await params;
    const body = await request.json();

    if (body.status !== "CANCELLED") {
      return NextResponse.json(
        {
          error:
            "Only cancellation is a manual action. A permit becomes ACTIVE when its sign-off chain is complete, and CLOSED when its close-out chain is signed.",
        },
        { status: 400 },
      );
    }

    const [permit] = await db.select().from(permits).where(eq(permits.id, id)).limit(1);
    if (!permit) return NextResponse.json({ error: "Permit not found" }, { status: 404 });
    if (permit.status === "CLOSED" || permit.status === "CANCELLED") {
      return NextResponse.json(
        { error: `Permit is already ${permit.status.toLowerCase()}.` },
        { status: 409 },
      );
    }

    // Why it was cancelled is the record (LIMSL, 16 Nov 2026). A permit is
    // usually withdrawn because something in the JHA or the WMS behind it is
    // wrong, and the people who correct it and reissue need to know which.
    const reason = String(body.reason ?? "");
    const note = String(body.note ?? "").trim();
    if (!CANCEL_REASONS.some((r) => r.value === reason)) {
      return NextResponse.json({ error: "Say why the permit is being cancelled." }, { status: 400 });
    }
    if (note.length < 10) {
      return NextResponse.json(
        { error: "Say what has to be corrected, in a sentence. It goes to whoever fixes it and reissues." },
        { status: 400 },
      );
    }
    const closureNote = cancelNote(reason, note);

    await db
      .update(permits)
      .set({ status: "CANCELLED", closedAt: new Date().toISOString(), closureReason: "CANCELLED", closureNote })
      .where(eq(permits.id, id));

    // A cancelled permit asks nobody to sign it. The signatures already given
    // stay as the record of how far it got; the steps still waiting go.
    const chain = await getSignoffChain("PERMIT", id);
    await db
      .delete(signoffs)
      .where(and(inArray(signoffs.entityType, ["PERMIT", "PERMIT_CLOSEOUT"]), eq(signoffs.entityId, id), eq(signoffs.status, "PENDING")));

    // The batch is free for a corrected permit to be raised against it.
    if (permit.batchId) {
      const [b] = await db.select().from(pmBatches).where(eq(pmBatches.id, permit.batchId)).limit(1);
      if (b && b.permitId === id) {
        await db
          .update(pmBatches)
          .set({
            permitId: null,
            status: b.status === "IN_PROGRESS" ? (b.assignedToId ? "ASSIGNED" : "PLANNED") : b.status,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(pmBatches.id, b.id));
      }
    }

    await db.insert(auditLog).values({
      id: nanoid(),
      userId: gate.actor?.id ?? null,
      userName: gate.actor?.name || "System",
      action: "CANCEL",
      entityType: "permit",
      entityId: id,
      entityDescription: `Permit ${permit.permitNumber} cancelled. ${closureNote}`,
    });

    // Everyone who signed it or holds it hears why, and HSE, who reissue.
    try {
      const signers = chain.filter((s) => s.status === "SIGNED" && s.signedById).map((s) => s.signedById!);
      const people = [...new Set([...signers, ...(permit.permitHolderId ? [permit.permitHolderId] : [])])].filter(
        (u) => u !== gate.actor?.id,
      );
      await notify({
        event: "GENERAL",
        title: `Permit ${permit.permitNumber} cancelled`,
        body: `${gate.actor?.name ?? "HSE"} cancelled it. ${closureNote} Correct the document, then a new permit is raised.`,
        linkPath: `/permits/${id}`,
        relatedEntityType: "permit",
        relatedEntityId: id,
        userIds: people,
        roles: PERMIT_ISSUE_ROLES,
      });
    } catch (err) {
      console.warn("permit cancel: notify failed", err);
    }

    const [updated] = await db.select().from(permits).where(eq(permits.id, id)).limit(1);
    return NextResponse.json(updated);
  } catch (error: any) {
    console.error("Failed to update permit:", error);
    return NextResponse.json({ error: "Failed to update permit" }, { status: 500 });
  }
}
