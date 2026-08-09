// src/app/api/non-conformities/[id]/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { nonConformities, auditLog } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireRoles } from "@/lib/authz";
import { COMPLIANCE_WRITE_ROLES } from "@/lib/roles";
import { ensureSignoffChain, getSignoffChain } from "@/lib/signoff/service";
import { chainSummary } from "@/lib/signoff/chains";

// A safety incident is investigated by HSE under its own chain; every other
// non-conformity runs the QA/QC-led CAPA chain.
export const ncEntityType = (type: string | null | undefined) =>
  type === "SAFETY_INCIDENT" ? "SAFETY_INCIDENT" : "NON_CONFORMITY";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const gate = await requireRoles(COMPLIANCE_WRITE_ROLES);
    if (gate.res) return gate.res;

    const resolvedParams = await params;
    const body = await request.json();

    const currentRecords = await db
      .select()
      .from(nonConformities)
      .where(eq(nonConformities.id, resolvedParams.id));

    if (currentRecords.length === 0) {
      return NextResponse.json({ error: "Non-conformity not found" }, { status: 404 });
    }

    const nc = currentRecords[0];

    // ── Close-out gate (ISO 9001 10.2.1/10.2.2, ISO 45001 10.2) ──────────────
    // An NC used to close on a status change alone, no root cause, no action,
    // no verification, no signatures. The clause requires evidence of the
    // action taken AND of its effectiveness, so close-out now demands the same
    // rigour a machine breakdown already does.
    const closingOut = body.status === "CLOSED" && nc.status !== "CLOSED";
    if (closingOut) {
      const rootCause = String(body.rootCause ?? nc.rootCause ?? "").trim();
      const correctiveAction = String(body.correctiveAction ?? nc.correctiveAction ?? "").trim();
      const missing: string[] = [];
      if (!rootCause) missing.push("a documented root cause");
      if (!correctiveAction) missing.push("the corrective action taken");
      if (missing.length) {
        return NextResponse.json(
          { error: `Close-out requires ${missing.join(" and ")}, ISO 9001 10.2.2 requires this evidence to be retained.` },
          { status: 400 },
        );
      }

      const entityType = ncEntityType(nc.type);
      await ensureSignoffChain(entityType, nc.id, nc.ncNumber);
      const chain = await getSignoffChain(entityType, nc.id);
      const summary = chainSummary(chain);
      if (!summary.complete) {
        return NextResponse.json(
          {
            error:
              `Close-out requires the ${entityType === "SAFETY_INCIDENT" ? "incident investigation" : "corrective-action"} ` +
              `sign-off chain, ${summary.signed} of ${summary.total} signatures are in place, including the ` +
              `effectiveness verification. Complete the chain on this record first.`,
          },
          { status: 409 },
        );
      }
    }

    const updateFields: any = {
      status: body.status ?? nc.status,
      rootCause: body.rootCause ?? nc.rootCause,
      correctiveAction: body.correctiveAction ?? nc.correctiveAction,
      closeOutDate: body.status === "CLOSED" ? new Date().toISOString().split("T")[0] : nc.closeOutDate,
      updatedAt: new Date().toISOString(),
    };

    const updated = await db
      .update(nonConformities)
      .set(updateFields)
      .where(eq(nonConformities.id, resolvedParams.id))
      .returning();

    // Every NC state change is auditable evidence, especially the close-out.
    await db.insert(auditLog).values({
      id: nanoid(),
      userId: gate.actor?.id ?? null,
      userName: gate.actor?.name ?? "User",
      action: body.status === "CLOSED" && nc.status !== "CLOSED" ? "CLOSE" : "UPDATE",
      entityType: "non_conformity",
      entityId: nc.id,
      entityDescription:
        body.status && body.status !== nc.status
          ? `NC ${nc.ncNumber} status ${nc.status} → ${body.status}`
          : `NC ${nc.ncNumber} updated (root cause / corrective action)`,
    });

    return NextResponse.json(updated[0] || { success: true });
  } catch (error: any) {
    console.error("Failed to update non-conformity:", error);
    return NextResponse.json({ error: "Failed to update NC" }, { status: 500 });
  }
}
