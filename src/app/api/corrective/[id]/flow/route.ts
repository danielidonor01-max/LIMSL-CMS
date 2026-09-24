// src/app/api/corrective/[id]/flow/route.ts
// Moving a reported fault along, one named act at a time.
//
// A breakdown does not become work because somebody edited a field. It becomes
// work because the Factory Manager decided the repair goes ahead and handed it
// to the Foreman, because the Foreman put a name on it, and because that person
// raised the work order that authorises them to touch the machine. Each of
// those is a decision by a specific person, so each is its own action with its
// own gate and its own audit line, rather than three optional fields on a form.
//
// Unlike a PM, a breakdown is one machine. Its method statement, hazard
// analysis and permit are all specific to it.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  correctiveMaintenance,
  equipment,
  users,
  workOrders,
  wmsDocuments,
  jhaDocuments,
  permits,
  auditLog,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireRoles } from "@/lib/authz";
import { WORK_ASSIGN_ROLES, REPAIR_AUTHORISE_ROLES } from "@/lib/roles";
import { notify } from "@/lib/notifications";
import { raiseWorkOrder } from "@/lib/maintenance/raise-work-order";
import { cmFlowState } from "@/lib/maintenance/flow";


async function documents(id: string, record: typeof correctiveMaintenance.$inferSelect) {
  const wos = await db
    .select({ id: workOrders.id, status: workOrders.status, workOrderNumber: workOrders.workOrderNumber })
    .from(workOrders)
    .where(eq(workOrders.cmsId, id));

  const woId = record.workOrderId ?? wos[0]?.id ?? null;
  const [wms] = woId
    ? await db.select().from(wmsDocuments).where(eq(wmsDocuments.workOrderId, woId)).limit(1)
    : [];
  const [jha] = wms ? await db.select().from(jhaDocuments).where(eq(jhaDocuments.wmsId, wms.id)).limit(1) : [];
  const [permit] = jha ? await db.select().from(permits).where(eq(permits.jhaId, jha.id)).limit(1) : [];

  return { wos, woId, wms: wms ?? null, jha: jha ?? null, permit: permit ?? null };
}

async function facts(id: string, record: typeof correctiveMaintenance.$inferSelect) {
  const d = await documents(id, record);
  return {
    motionedAt: record.repairAuthorisedAt,
    assignedToId: record.assignedToId,
    workOrderCount: d.wos.length,
    wmsStatus: d.wms?.status ?? null,
    jhaStatus: d.jha?.status ?? null,
    permitStatus: d.permit?.status ?? null,
    completed: record.status === "CLOSED",
  };
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const [record] = await db
      .select()
      .from(correctiveMaintenance)
      .where(eq(correctiveMaintenance.id, id))
      .limit(1);
    if (!record) return NextResponse.json({ error: "Record not found" }, { status: 404 });
    const d = await documents(id, record);
    return NextResponse.json({
      flow: cmFlowState(await facts(id, record)),
      workOrder: d.wos.find((w) => w.id === d.woId) ?? d.wos[0] ?? null,
      wms: d.wms ? { id: d.wms.id, wmsNumber: d.wms.wmsNumber, status: d.wms.status } : null,
      jha: d.jha ? { id: d.jha.id, jhaNumber: d.jha.jhaNumber, status: d.jha.status } : null,
      permit: d.permit ? { id: d.permit.id, permitNumber: d.permit.permitNumber, status: d.permit.status } : null,
      assignedToName: record.assignedToName,
      repairAuthorisedByName: record.repairAuthorisedByName,
    });
  } catch (error) {
    console.error("Failed to read corrective flow:", error);
    return NextResponse.json({ error: "Failed to read the repair flow" }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const action = String(body.action ?? "");

    const [record] = await db
      .select()
      .from(correctiveMaintenance)
      .where(eq(correctiveMaintenance.id, id))
      .limit(1);
    if (!record) return NextResponse.json({ error: "Record not found" }, { status: 404 });

    const [machine] = await db
      .select({ assetId: equipment.assetId, name: equipment.name })
      .from(equipment)
      .where(eq(equipment.id, record.equipmentId))
      .limit(1);
    const machineLabel = [machine?.assetId, machine?.name].filter(Boolean).join(" ") || "the machine";

    // ── The Factory Manager authorises the repair ─────────────────────────
    if (action === "AUTHORISE") {
      const gate = await requireRoles(REPAIR_AUTHORISE_ROLES);
      if (gate.res) return gate.res;

      if (record.repairAuthorisedAt) {
        return NextResponse.json(
          { error: `The repair was already authorised by ${record.repairAuthorisedByName}.` },
          { status: 409 },
        );
      }

      const now = new Date().toISOString();
      await db
        .update(correctiveMaintenance)
        .set({
          repairAuthorisedAt: now,
          repairAuthorisedById: gate.actor?.id ?? null,
          repairAuthorisedByName: gate.actor?.name ?? null,
          status: record.status === "OPEN" ? "IN_PROGRESS" : record.status,
          updatedAt: now,
        })
        .where(eq(correctiveMaintenance.id, id));

      await db.insert(auditLog).values({
        id: nanoid(),
        userId: gate.actor?.id ?? null,
        userName: gate.actor?.name || "System",
        action: "APPROVE",
        entityType: "corrective_maintenance",
        entityId: id,
        entityDescription: `${record.cmrfNumber}, repair authorised on ${machineLabel} and passed to the Foreman`,
      });

      try {
        await notify({
          event: "GENERAL",
          title: `Repair authorised, ${record.cmrfNumber}`,
          body:
            `${machineLabel}. ${record.faultDescription ? `${String(record.faultDescription).slice(0, 140)}. ` : ""}` +
            `Authorised by ${gate.actor?.name}. Assign a technician so the work order and safety ` +
            `documents can be raised.`,
          linkPath: `/corrective/${id}`,
          relatedEntityType: "corrective_maintenance",
          relatedEntityId: id,
          roles: ["FOREMAN"],
        });
      } catch (err) {
        console.warn("corrective authorise: notify failed", err);
      }

      return NextResponse.json({ ok: true, flow: cmFlowState(await facts(id, { ...record, repairAuthorisedAt: now })) });
    }

    // ── The Foreman puts a name on it ─────────────────────────────────────
    if (action === "ASSIGN") {
      const gate = await requireRoles(WORK_ASSIGN_ROLES);
      if (gate.res) return gate.res;

      if (!record.repairAuthorisedAt) {
        return NextResponse.json(
          {
            error:
              "The Factory Manager has not authorised this repair yet. A fault is assigned once the " +
              "repair has been agreed, not before.",
          },
          { status: 409 },
        );
      }

      const personId = String(body.assignedToId ?? "");
      const [person] = await db
        .select({ id: users.id, name: users.name, isActive: users.isActive })
        .from(users)
        .where(eq(users.id, personId))
        .limit(1);
      if (!person) return NextResponse.json({ error: "That person was not found." }, { status: 400 });
      if (person.isActive === false) {
        return NextResponse.json({ error: `${person.name} is no longer an active account.` }, { status: 409 });
      }

      await db
        .update(correctiveMaintenance)
        .set({
          assignedToId: person.id,
          assignedToName: person.name,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(correctiveMaintenance.id, id));

      await db.insert(auditLog).values({
        id: nanoid(),
        userId: gate.actor?.id ?? null,
        userName: gate.actor?.name || "System",
        action: "UPDATE",
        entityType: "corrective_maintenance",
        entityId: id,
        entityDescription: `${record.cmrfNumber}, repair on ${machineLabel} assigned to ${person.name}`,
      });

      try {
        await notify({
          event: "GENERAL",
          title: `Repair assigned to you, ${record.cmrfNumber}`,
          body:
            `${machineLabel}. ${record.faultDescription ? `${String(record.faultDescription).slice(0, 140)}. ` : ""}` +
            `Raise the work order, then the method statement for this machine. HSE builds the hazard ` +
            `analysis and the permit from it, and work cannot start until the permit is raised.`,
          linkPath: `/corrective/${id}`,
          relatedEntityType: "corrective_maintenance",
          relatedEntityId: id,
          userIds: [person.id],
        });
      } catch (err) {
        console.warn("corrective assign: notify failed", err);
      }

      return NextResponse.json({
        ok: true,
        flow: cmFlowState(await facts(id, { ...record, assignedToId: person.id })),
      });
    }

    // ── The assigned person raises the work order ─────────────────────────
    if (action === "RAISE_WORK_ORDER") {
      const gate = await requireRoles([...WORK_ASSIGN_ROLES, "TECHNICIAN"]);
      if (gate.res) return gate.res;

      if (!record.assignedToId) {
        return NextResponse.json(
          { error: "Nobody is assigned to this repair yet." },
          { status: 409 },
        );
      }
      // The paperwork belongs to the person carrying the job. A manager can
      // still raise it on their behalf; another technician cannot.
      const isOwner = gate.actor?.id === record.assignedToId;
      if (!isOwner && !WORK_ASSIGN_ROLES.includes(gate.actor?.role ?? "")) {
        return NextResponse.json(
          { error: `This repair is assigned to ${record.assignedToName}. They raise its work order.` },
          { status: 403 },
        );
      }
      if (record.workOrderId) {
        return NextResponse.json(
          { error: "A work order has already been raised for this repair." },
          { status: 409 },
        );
      }

      const wo = await raiseWorkOrder({
        type: record.urgency === "CRITICAL" ? "EMERGENCY" : "CORRECTIVE",
        equipmentId: record.equipmentId,
        title: `Repair, ${machineLabel}`,
        description: record.faultDescription || `Corrective repair under ${record.cmrfNumber}.`,
        plannedDate: new Date().toISOString().slice(0, 10),
        cmsId: id,
        technicianId: record.assignedToId,
        technicianName: record.assignedToName,
        priority: record.urgency === "CRITICAL" ? "CRITICAL" : record.urgency || "HIGH",
        actor: gate.actor ?? {},
        origin: `raised for ${record.cmrfNumber}`,
      });

      await db
        .update(correctiveMaintenance)
        .set({ workOrderId: wo.id, updatedAt: new Date().toISOString() })
        .where(eq(correctiveMaintenance.id, id));

      return NextResponse.json(
        { ok: true, workOrderId: wo.id, workOrderNumber: wo.workOrderNumber },
        { status: 201 },
      );
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    console.error("Failed to advance corrective flow:", error);
    return NextResponse.json({ error: "Failed to move the repair on" }, { status: 500 });
  }
}

