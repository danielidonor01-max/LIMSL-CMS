// src/app/api/contractors/[id]/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { contractors, auditLog } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireRoles } from "@/lib/authz";
import { COMPLIANCE_WRITE_ROLES } from "@/lib/roles";
import { assessContractor } from "@/lib/hse/contractors";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const gate = await requireRoles(COMPLIANCE_WRITE_ROLES);
    if (gate.res) return gate.res;

    const { id } = await params;
    const body = await request.json();

    const [existing] = await db.select().from(contractors).where(eq(contractors.id, id)).limit(1);
    if (!existing) return NextResponse.json({ error: "Contractor not found" }, { status: 404 });

    // Suspending is a safety decision that stops permits being issued, so it
    // carries a reason, "why is this company barred" is the first question
    // anyone will ask, including the company.
    if (body.action === "suspend") {
      const reason = String(body.suspensionReason ?? "").trim();
      if (reason.length < 5) {
        return NextResponse.json({ error: "Give the reason for suspending this contractor." }, { status: 400 });
      }
      await db
        .update(contractors)
        .set({ status: "SUSPENDED", suspensionReason: reason, updatedAt: new Date().toISOString() })
        .where(eq(contractors.id, id));
      await db.insert(auditLog).values({
        id: nanoid(),
        userId: gate.actor?.id ?? null,
        userName: gate.actor?.name || "System",
        action: "UPDATE",
        entityType: "contractor",
        entityId: id,
        entityDescription: `${existing.companyName} SUSPENDED, ${reason}`,
      });
      return NextResponse.json({ ok: true, status: "SUSPENDED" });
    }

    if (body.action === "reinstate") {
      await db
        .update(contractors)
        .set({ status: "ACTIVE", suspensionReason: null, updatedAt: new Date().toISOString() })
        .where(eq(contractors.id, id));
      await db.insert(auditLog).values({
        id: nanoid(),
        userId: gate.actor?.id ?? null,
        userName: gate.actor?.name || "System",
        action: "UPDATE",
        entityType: "contractor",
        entityId: id,
        entityDescription: `${existing.companyName} reinstated`,
      });
      // Reinstating does not make expired paperwork valid; say so plainly rather
      // than letting the green tick imply it.
      const after = assessContractor({ ...existing, status: "ACTIVE" });
      return NextResponse.json({ ok: true, status: "ACTIVE", eligibility: after });
    }

    const set: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    for (const k of [
      "companyName", "tradeSpecialty", "contactPerson", "phone", "email",
      "insuranceProvider", "insurancePolicyNumber", "insuranceExpiryDate", "insuranceCoverAmount",
      "inductionDate", "inductionValidUntil", "inductionByName", "notes",
    ]) {
      if (body[k] !== undefined) set[k] = body[k] || null;
    }

    if (Object.keys(set).length === 1) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    await db.update(contractors).set(set).where(eq(contractors.id, id));

    // Renewing a certificate is the event worth recording, it is the evidence
    // that the gate was opened deliberately.
    if (set.insuranceExpiryDate || set.inductionValidUntil) {
      await db.insert(auditLog).values({
        id: nanoid(),
        userId: gate.actor?.id ?? null,
        userName: gate.actor?.name || "System",
        action: "UPDATE",
        entityType: "contractor",
        entityId: id,
        entityDescription:
          `${existing.companyName} paperwork updated , ` +
          (set.insuranceExpiryDate ? ` insurance to ${set.insuranceExpiryDate}` : "") +
          (set.inductionValidUntil ? ` induction to ${set.inductionValidUntil}` : ""),
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to update contractor:", error);
    return NextResponse.json({ error: "Failed to update contractor" }, { status: 500 });
  }
}
