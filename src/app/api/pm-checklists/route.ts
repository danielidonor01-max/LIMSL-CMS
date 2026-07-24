// src/app/api/pm-checklists/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  pmChecklists,
  workOrders,
  maintenanceSchedule,
  equipment,
  permits,
  auditLog,
  signoffs,
  correctiveMaintenance,
} from "@/lib/db/schema";
import { and, eq, ne } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireRoles } from "@/lib/authz";
import { MAINTENANCE_WRITE_ROLES } from "@/lib/roles";
import { reconcilePermits } from "@/app/api/permits/route";
import { generateNextOccurrence } from "@/lib/schedule";
import { logEquipmentEvent } from "@/lib/equipment-log";
import { ensureSignoffChain, getSignoffChain } from "@/lib/signoff/service";
import { notifyNextSigner } from "@/lib/notifications";

// Submitting a completed PM checklist closes the loop:
//  1. persist the checklist (with drawn signatures)
//  2. mark the work order COMPLETED
//  3. mark the linked schedule activity COMPLETED
//  4. roll the equipment's last/next maintenance dates forward
export async function POST(request: Request) {
  try {
    const gate = await requireRoles(MAINTENANCE_WRITE_ROLES);
    if (gate.res) return gate.res;

    const body = await request.json();

    if (!body.workOrderId || !body.equipmentId) {
      return NextResponse.json(
        { error: "workOrderId and equipmentId are required" },
        { status: 400 },
      );
    }

    // Enforce PTW: if a Permit-to-Work is attached to this work order, it must be
    // signed off (ACTIVE) before the PM can be completed. This is the server-side
    // audit backing the technician's checklist attestation — a self-declared
    // "PTW issued" checkbox can't stand in for a real, signed permit.
    await reconcilePermits();
    const linkedPermits = await db.select().from(permits).where(eq(permits.workOrderId, body.workOrderId));
    if (linkedPermits.length > 0 && !linkedPermits.some((p) => p.status === "ACTIVE")) {
      const p = linkedPermits[0];
      return NextResponse.json(
        {
          error:
            `Permit ${p.permitNumber} is ${p.status.replace("_", " ").toLowerCase()} — the Permit-to-Work must be ` +
            `signed off (ACTIVE) before this PM checklist can be submitted.`,
        },
        { status: 409 },
      );
    }

    const today = new Date().toISOString().slice(0, 10);
    const checklistId = nanoid();

    const checklist = {
      id: checklistId,
      workOrderId: body.workOrderId,
      equipmentId: body.equipmentId,
      date: body.date || today,
      ptwIssued: !!body.ptwIssued,
      lotoApplied: !!body.lotoApplied,
      ppeWorn: !!body.ppeWorn,
      areaSafe: !!body.areaSafe,
      visualInspection: JSON.stringify(body.visualInspection ?? []),
      functionalTests: JSON.stringify(body.functionalTests ?? []),
      lubrication: JSON.stringify(body.lubrication ?? []),
      electricalChecks: JSON.stringify(body.electricalChecks ?? []),
      calibrationMeasurements: body.calibrationMeasurements
        ? JSON.stringify(body.calibrationMeasurements)
        : null,
      observations: body.observations || "",
      correctiveActionRequired: !!body.correctiveActionRequired,
      actionDescription: body.actionDescription || "",
      sparePartsNeeded: body.sparePartsNeeded || "",
      pmCompleted: body.pmCompleted !== false,
      nextPMDate: body.nextPMDate || null,
      technicianSignature: body.technicianSignature || null,
      supervisorSignature: body.supervisorSignature || null,
      // The performing technician is the authenticated submitter — never client
      // text. (The supervisor's authenticated approval lives in the PM sign-off
      // chain started below; the name here is display-only shop-floor capture.)
      technicianName: gate.actor?.name || body.technicianName || null,
      supervisorName: body.supervisorName || null,
      signedAt: new Date().toISOString(),
    };

    await db.insert(pmChecklists).values(checklist);

    // 2. Complete the work order
    await db
      .update(workOrders)
      .set({
        status: "COMPLETED",
        completionDate: today,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(workOrders.id, body.workOrderId));

    // 3. Complete the linked schedule activity and spawn its next occurrence so
    //    the PM programme perpetuates itself instead of emptying out.
    const [wo] = await db
      .select()
      .from(workOrders)
      .where(eq(workOrders.id, body.workOrderId))
      .limit(1);
    let recurredDate: string | null = null;
    if (wo?.scheduleId) {
      await db
        .update(maintenanceSchedule)
        .set({ status: "COMPLETED", completedDate: today })
        .where(eq(maintenanceSchedule.id, wo.scheduleId));
      const [schedRow] = await db
        .select()
        .from(maintenanceSchedule)
        .where(eq(maintenanceSchedule.id, wo.scheduleId))
        .limit(1);
      if (schedRow) recurredDate = await generateNextOccurrence(schedRow);
    }

    // 4. Roll the equipment maintenance dates forward. Prefer the auto-computed
    //    next PM date over a technician-typed one so the register stays in step
    //    with the schedule. A PM sign-off must not present a machine as fit for
    //    service while a corrective fault is still open on it.
    const [openCm] = await db
      .select({ id: correctiveMaintenance.id })
      .from(correctiveMaintenance)
      .where(
        and(
          eq(correctiveMaintenance.equipmentId, body.equipmentId),
          ne(correctiveMaintenance.status, "CLOSED"),
        ),
      )
      .limit(1);
    await db
      .update(equipment)
      .set({
        lastMaintenanceDate: today,
        nextMaintenanceDate: recurredDate || body.nextPMDate || null,
        ...(body.correctiveActionRequired
          ? { status: "UNDER_MAINTENANCE" }
          : openCm
            ? {}
            : { status: "OPERATIONAL" }),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(equipment.id, body.equipmentId));

    await db.insert(auditLog).values({
      id: nanoid(),
      userId: gate.actor?.id ?? null,
      userName: gate.actor?.name || body.technicianName || "Technician",
      action: "SIGN",
      entityType: "pm_checklist",
      entityId: checklistId,
      entityDescription: `PM checklist signed for WO ${wo?.workOrderNumber ?? body.workOrderId}`,
    });

    // Start the PM approval chain NOW (not lazily on some later page load): the
    // submitting technician's authenticated signature covers step 1, and the
    // Foreman is notified that verification is due. The work order itself stays
    // COMPLETED — the chain governs the checklist record's approval, not whether
    // the physical work happened.
    try {
      const chain = await ensureSignoffChain("PM_CHECKLIST", checklistId, wo?.workOrderNumber);
      const step1 = chain.find((s) => s.stepOrder === 1 && s.role === "TECHNICIAN");
      if (step1 && checklist.technicianSignature && step1.status === "PENDING") {
        await db
          .update(signoffs)
          .set({
            status: "SIGNED",
            signedById: gate.actor?.id ?? null,
            signedByName: gate.actor?.name ?? null,
            signedByRole: gate.actor?.role ?? null,
            signatureData: checklist.technicianSignature,
            signedAt: new Date().toISOString(),
          })
          .where(eq(signoffs.id, step1.id));
        const fresh = await getSignoffChain("PM_CHECKLIST", checklistId);
        await notifyNextSigner("PM_CHECKLIST", checklistId, fresh, wo?.workOrderNumber);
      }
    } catch (err) {
      console.warn("pm-checklists: sign-off chain start failed (non-fatal)", err);
    }

    // Record the PM on the machine's lifetime log (best-effort).
    try {
      await logEquipmentEvent({
        equipmentId: body.equipmentId,
        category: "PM",
        title: `Preventive maintenance completed${wo?.workOrderNumber ? ` — ${wo.workOrderNumber}` : ""}`,
        detail: body.correctiveActionRequired
          ? `Follow-up corrective action flagged: ${body.actionDescription || "see checklist"}`
          : "PM checklist signed off; equipment returned to service.",
        refType: "work_order",
        refId: wo?.id ?? null,
        href: body.workOrderId ? `/work-orders/${body.workOrderId}/pm-checklist` : null,
        source: "AUTO",
        performedById: gate.actor?.id ?? null,
        performedByName: gate.actor?.name || body.technicianName || null,
        occurredAt: `${today}T00:00:00Z`,
      });
    } catch (err) {
      console.warn("pm-checklists: equipment log failed (non-fatal)", err);
    }

    return NextResponse.json({ ...checklist, id: checklistId }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to submit PM checklist:", error);
    return NextResponse.json(
      { error: "Failed to submit PM checklist", details: message },
      { status: 500 },
    );
  }
}
