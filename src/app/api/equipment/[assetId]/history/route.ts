// src/app/api/equipment/[assetId]/history/route.ts
// Unified maintenance history timeline for a single machine, aggregated from
// work orders, PM checklists, corrective cases, non-conformities, schedule
// completions and document uploads.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  equipment,
  workOrders,
  pmChecklists,
  correctiveMaintenance,
  nonConformities,
  maintenanceSchedule,
  equipmentDocuments,
} from "@/lib/db/schema";
import { eq, or } from "drizzle-orm";

type Event = {
  date: string;
  type: string;
  title: string;
  detail?: string;
  ref?: string;
  href?: string;
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ assetId: string }> },
) {
  try {
    const { assetId } = await params;
    const slash = assetId.replace(/-/g, "/");

    const [eqp] = await db
      .select()
      .from(equipment)
      .where(or(eq(equipment.assetId, slash), eq(equipment.assetId, assetId)))
      .limit(1);

    if (!eqp) {
      return NextResponse.json({ error: "Equipment not found" }, { status: 404 });
    }

    const id = eqp.id;
    const events: Event[] = [];

    // Work orders
    const wos = await db.select().from(workOrders).where(eq(workOrders.equipmentId, id));
    for (const w of wos) {
      events.push({
        date: w.createdAt?.slice(0, 10) || w.plannedDate || "",
        type: "WORK_ORDER",
        title: `${w.workOrderNumber} — ${w.title}`,
        detail: `Type ${w.type} · ${w.status}`,
        ref: w.workOrderNumber,
        href: `/work-orders/${w.id}`,
      });
      if (w.completionDate) {
        events.push({
          date: w.completionDate,
          type: "WORK_ORDER_DONE",
          title: `${w.workOrderNumber} completed`,
          detail: w.technicianName ? `by ${w.technicianName}` : undefined,
          href: `/work-orders/${w.id}`,
        });
      }
    }

    // PM checklists
    const checks = await db.select().from(pmChecklists).where(eq(pmChecklists.equipmentId, id));
    for (const c of checks) {
      events.push({
        date: c.signedAt?.slice(0, 10) || c.date,
        type: "PM_CHECKLIST",
        title: "PM checklist signed off",
        detail: [c.technicianName, c.supervisorName].filter(Boolean).join(" / "),
        href: `/work-orders/${c.workOrderId}`,
      });
    }

    // Corrective maintenance
    const cms = await db
      .select()
      .from(correctiveMaintenance)
      .where(eq(correctiveMaintenance.equipmentId, id));
    for (const cm of cms) {
      events.push({
        date: cm.reportedDate,
        type: "CORRECTIVE",
        title: `${cm.cmrfNumber} — ${cm.observedFault || cm.faultType || "Fault reported"}`,
        detail: `${cm.urgency} urgency · ${cm.status}`,
        ref: cm.cmrfNumber,
        href: `/corrective/${cm.id}`,
      });
      if (cm.closeOutDate) {
        events.push({
          date: cm.closeOutDate,
          type: "CORRECTIVE_CLOSED",
          title: `${cm.cmrfNumber} closed out`,
          detail: cm.repairStatus || undefined,
          href: `/corrective/${cm.id}`,
        });
      }
    }

    // Non-conformities
    const ncs = await db.select().from(nonConformities).where(eq(nonConformities.equipmentId, id));
    for (const nc of ncs) {
      events.push({
        date: nc.detectedDate,
        type: "NON_CONFORMITY",
        title: `${nc.ncNumber} — ${nc.type}`,
        detail: `${nc.severity} · ${nc.status}`,
        ref: nc.ncNumber,
        href: `/audit/non-conformity`,
      });
    }

    // Completed scheduled activities
    const sched = await db
      .select()
      .from(maintenanceSchedule)
      .where(eq(maintenanceSchedule.equipmentId, id));
    for (const s of sched) {
      if (s.status === "COMPLETED" && s.completedDate) {
        events.push({
          date: s.completedDate,
          type: "SCHEDULE_DONE",
          title: `${s.activityType} completed`,
          detail: s.taskDescription || undefined,
        });
      }
    }

    // Documents
    const docs = await db
      .select()
      .from(equipmentDocuments)
      .where(eq(equipmentDocuments.equipmentId, id));
    for (const d of docs) {
      if (d.status === "AVAILABLE" && (d.issuedDate || d.createdAt)) {
        events.push({
          date: (d.issuedDate || d.createdAt || "").slice(0, 10),
          type: "DOCUMENT",
          title: `${d.docType.replace(/_/g, " ")} on file`,
          detail: d.title,
        });
      }
    }

    events.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

    return NextResponse.json({ equipment: eqp, events });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to build history:", error);
    return NextResponse.json({ error: "Failed to build history", details: message }, { status: 500 });
  }
}
