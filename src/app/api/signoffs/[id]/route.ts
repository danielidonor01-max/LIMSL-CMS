// src/app/api/signoffs/[id]/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { signoffs, auditLog } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { auth } from "@/auth";
import { canSignStep } from "@/lib/roles";
import { getSignoffChain, isStepUnlocked } from "@/lib/signoff/service";

// POST /api/signoffs/[id] → sign (or reject) one step in a chain.
// Enforces: authenticated, role matches the step (or senior/super-admin), and
// all earlier required steps are already signed.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    const user = session?.user as { id?: string; name?: string; role?: string } | undefined;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const body = await request.json();
    const action = body.action === "reject" ? "reject" : "sign";

    const [step] = await db.select().from(signoffs).where(eq(signoffs.id, id)).limit(1);
    if (!step) return NextResponse.json({ error: "Sign-off step not found" }, { status: 404 });
    if (step.status === "SIGNED") {
      return NextResponse.json({ error: "This step is already signed" }, { status: 409 });
    }

    if (!canSignStep(user.role, step.role)) {
      return NextResponse.json(
        { error: `This step must be signed by ${step.roleLabel}. Your role is not authorised.` },
        { status: 403 },
      );
    }

    if (action === "sign") {
      const chain = await getSignoffChain(step.entityType, step.entityId);
      if (!isStepUnlocked(chain, step.stepOrder)) {
        return NextResponse.json(
          { error: "Earlier required sign-offs must be completed first." },
          { status: 409 },
        );
      }
      if (!body.signatureData) {
        return NextResponse.json({ error: "A drawn signature is required." }, { status: 400 });
      }
    }

    await db
      .update(signoffs)
      .set({
        status: action === "reject" ? "REJECTED" : "SIGNED",
        signedById: user.id ?? null,
        signedByName: user.name ?? null,
        signedByRole: user.role ?? null,
        signatureData: action === "sign" ? body.signatureData : null,
        comments: body.comments || null,
        signedAt: new Date().toISOString(),
      })
      .where(eq(signoffs.id, id));

    await db.insert(auditLog).values({
      id: nanoid(),
      userId: user.id ?? null,
      userName: user.name ?? "User",
      action: action === "reject" ? "REJECT" : "SIGN",
      entityType: step.entityType,
      entityId: step.entityId,
      entityDescription: `${step.roleLabel} ${action === "reject" ? "rejected" : "signed"}`,
    });

    const [updated] = await db.select().from(signoffs).where(eq(signoffs.id, id)).limit(1);
    return NextResponse.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to sign:", error);
    return NextResponse.json({ error: "Failed to sign", details: message }, { status: 500 });
  }
}
