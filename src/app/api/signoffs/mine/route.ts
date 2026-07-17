// src/app/api/signoffs/mine/route.ts
// The current user's action queue: every sign-off step that is theirs to sign
// right now — pending, unlocked (all earlier required steps signed), and matching
// their role (or a senior/super-admin who may cover it). Spans every module that
// uses the sign-off engine.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  signoffs,
  permits,
  wmsDocuments,
  procedureRevisions,
  correctiveMaintenance,
  pmChecklists,
} from "@/lib/db/schema";
import { auth } from "@/auth";
import { isStepUnlocked } from "@/lib/signoff/chains";

const LABEL: Record<string, string> = {
  PERMIT: "Permit-to-Work",
  PERMIT_CLOSEOUT: "Permit close-out",
  WMS: "Work Method Statement",
  PROCEDURE: "Maintenance Procedure",
  PM_CHECKLIST: "PM checklist",
  CORRECTIVE: "Corrective / RCA",
};

export async function GET() {
  try {
    const session = await auth();
    const user = session?.user as { id?: string; role?: string } | undefined;
    if (!user?.role) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const all = await db.select().from(signoffs);

    // Group by entity, then pick the single actionable "next" step per chain.
    const groups = new Map<string, typeof all>();
    for (const s of all) {
      const k = `${s.entityType}|${s.entityId}`;
      const arr = groups.get(k);
      if (arr) arr.push(s);
      else groups.set(k, [s]);
    }

    type Mine = {
      stepId: string;
      entityType: string;
      entityId: string;
      roleLabel: string;
      stepOrder: number;
    };
    const mine: Mine[] = [];
    for (const chain of groups.values()) {
      const sorted = [...chain].sort((a, b) => a.stepOrder - b.stepOrder);
      // The next unsigned required step whose predecessors are all signed.
      const next = sorted.find(
        (s) => s.required && s.status !== "SIGNED" && s.status !== "REJECTED" &&
          isStepUnlocked(sorted, s.stepOrder),
      );
      if (!next) continue;
      // A user's personal queue is the steps that are THEIRS by role — their own
      // responsibility, not every junior step a senior could also cover. The
      // senior-override capability still lives on the entity page (canSignStep).
      if (next.role !== user.role) continue;
      mine.push({
        stepId: next.id,
        entityType: next.entityType,
        entityId: next.entityId,
        roleLabel: next.roleLabel,
        stepOrder: next.stepOrder,
      });
    }

    if (mine.length === 0) return NextResponse.json({ items: [] });

    // Batch-load referenced entities for friendly labels + deep links.
    const need = (t: string) => mine.some((m) => m.entityType === t);
    const [permitRows, wmsRows, procRows, cmRows, pmRows] = await Promise.all([
      need("PERMIT") || need("PERMIT_CLOSEOUT") ? db.select().from(permits) : [],
      need("WMS") ? db.select().from(wmsDocuments) : [],
      need("PROCEDURE") ? db.select().from(procedureRevisions) : [],
      need("CORRECTIVE") ? db.select().from(correctiveMaintenance) : [],
      need("PM_CHECKLIST") ? db.select().from(pmChecklists) : [],
    ]);
    const permitById = new Map(permitRows.map((r) => [r.id, r]));
    const wmsById = new Map(wmsRows.map((r) => [r.id, r]));
    const procById = new Map(procRows.map((r) => [r.id, r]));
    const cmById = new Map(cmRows.map((r) => [r.id, r]));
    const pmById = new Map(pmRows.map((r) => [r.id, r]));

    const items = mine.map((m) => {
      let reference = "";
      let link = "";
      switch (m.entityType) {
        case "PERMIT":
        case "PERMIT_CLOSEOUT": {
          const p = permitById.get(m.entityId);
          reference = p?.permitNumber ?? "";
          link = `/permits/${m.entityId}`;
          break;
        }
        case "WMS": {
          const w = wmsById.get(m.entityId);
          reference = w?.wmsNumber ?? w?.title ?? "";
          link = `/wms/${m.entityId}`;
          break;
        }
        case "PROCEDURE": {
          const pr = procById.get(m.entityId);
          reference = pr ? `${pr.code ?? "Procedure"} Rev ${pr.revision}` : "";
          link = `/procedure/${m.entityId}`;
          break;
        }
        case "CORRECTIVE": {
          const c = cmById.get(m.entityId);
          reference = c?.cmrfNumber ?? "";
          link = `/corrective/${m.entityId}`;
          break;
        }
        case "PM_CHECKLIST": {
          const pm = pmById.get(m.entityId);
          reference = "PM checklist";
          link = pm?.workOrderId ? `/work-orders/${pm.workOrderId}` : "/work-orders";
          break;
        }
      }
      return {
        stepId: m.stepId,
        entityType: m.entityType,
        typeLabel: LABEL[m.entityType] ?? m.entityType,
        reference,
        roleLabel: m.roleLabel,
        link,
      };
    });

    return NextResponse.json({ items });
  } catch (error: any) {
    console.error("Failed to load sign-off queue:", error);
    return NextResponse.json({ error: "Failed to load sign-off queue", details: error.message }, { status: 500 });
  }
}
