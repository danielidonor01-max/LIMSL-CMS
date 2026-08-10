// src/app/api/signoffs/[id]/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { signoffs, auditLog } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { auth } from "@/auth";
import { canSignStep } from "@/lib/roles";
import { getSignoffChain, isStepUnlocked } from "@/lib/signoff/service";
import { notify, notifyNextSigner } from "@/lib/notifications";

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

    // A step bound to a named person is not a role check. The permit holder
    // attests that HE will observe the precautions; another technician signing
    // that line is attesting to something he has no standing to attest to.
    // Super Admin may still step in, and it lands in the override path below
    // where it has to be justified.
    if (step.signerUserId && step.signerUserId !== user.id && user.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        {
          error:
            `This step is ${step.signerUserName ?? "another person"}'s to sign. ` +
            `${step.roleLabel} attests personally and cannot be signed on their behalf.`,
        },
        { status: 403 },
      );
    }

    if (!step.signerUserId && !canSignStep(user.role, step.role)) {
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
      // Segregation of duties: a multi-level chain means multiple PEOPLE.
      // Seniority lets a manager cover a junior step, which previously let one
      // senior sign an entire chain alone, including the HSE safety step,       // collapsing the control the chain exists to provide.
      const alreadySigned = chain.find(
        (s) => s.id !== step.id && s.status === "SIGNED" && s.signedById && s.signedById === user.id,
      );
      if (alreadySigned) {
        return NextResponse.json(
          {
            error:
              `You already signed "${alreadySigned.roleLabel}" on this record. ` +
              `Each step must be signed by a different person, ask the responsible ${step.roleLabel} to sign.`,
          },
          { status: 409 },
        );
      }
      if (!body.signatureData) {
        return NextResponse.json({ error: "A drawn signature is required." }, { status: 400 });
      }
    }

    // Signing a step your role does not name is an EXCEPTION, a Super Admin
    // stepping in for an absent manager, or a senior covering a junior. The
    // chain's intent is unchanged by that, so the exception has to justify
    // itself: an auditor's first question is "why did this person sign the
    // Maintenance Manager's step", and "they were allowed to" is not an answer.
    // On a person-bound step the named signer is never an override, whatever
    // their role: they are exactly who the step asks for. Anyone else is.
    const isOverride =
      action === "sign" &&
      (step.signerUserId ? step.signerUserId !== user.id : user.role !== step.role);
    const overrideReason = String(body.overrideReason ?? "").trim();
    if (isOverride && overrideReason.length < 10) {
      return NextResponse.json(
        {
          error:
            `This step names ${step.roleLabel}. You may sign it, but the reason has to be recorded, ` +
            `say why you are signing in their place (at least a sentence).`,
          requiresOverrideReason: true,
          stepRoleLabel: step.roleLabel,
        },
        { status: 400 },
      );
    }

    await db
      .update(signoffs)
      .set({
        status: action === "reject" ? "REJECTED" : "SIGNED",
        signedById: user.id ?? null,
        signedByName: user.name ?? null,
        signedByRole: user.role ?? null,
        isOverride,
        overrideReason: isOverride ? overrideReason.slice(0, 500) : null,
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
      // The audit line names the exception explicitly. Someone reading the trail
      // must not have to notice that a role field differs from another role
      // field two columns away.
      entityDescription: isOverride
        ? `${step.roleLabel} signed AS AN OVERRIDE by ${user.name} (${user.role}), ${overrideReason}`
        : `${step.roleLabel} ${action === "reject" ? "rejected" : "signed"}`,
    });

    // After a signature, notify whoever must sign next. After a rejection,
    // notify the preparing role (step 1), a rejection means rework, and the
    // person who owns the document must hear about it, not silence. Best-effort.
    if (action === "sign") {
      try {
        const fresh = await getSignoffChain(step.entityType, step.entityId);
        await notifyNextSigner(step.entityType, step.entityId, fresh);
      } catch (err) {
        console.warn("signoff: notify next signer failed", err);
      }
    } else {
      try {
        const fresh = await getSignoffChain(step.entityType, step.entityId);
        const preparer = fresh.find((s) => s.stepOrder === 1);
        if (preparer) {
          await notify({
            event: "GENERAL",
            title: `${step.entityType.replace(/_/g, " ")} rejected at "${step.roleLabel}"`,
            body:
              `${user.name ?? "A signer"} rejected the sign-off${body.comments ? `: "${String(body.comments).slice(0, 200)}"` : "."} ` +
              `Revise the document and resubmit for approval.`,
            relatedEntityType: step.entityType,
            relatedEntityId: step.entityId,
            roles: [preparer.role],
          });
        }
      } catch (err) {
        console.warn("signoff: rejection notification failed", err);
      }
    }

    const [updated] = await db.select().from(signoffs).where(eq(signoffs.id, id)).limit(1);
    return NextResponse.json(updated);
  } catch (error) {
    console.error("Failed to sign:", error);
    return NextResponse.json({ error: "Failed to sign" }, { status: 500 });
  }
}
