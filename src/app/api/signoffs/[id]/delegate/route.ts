// src/app/api/signoffs/[id]/delegate/route.ts
// Moving a pending signature to somebody who is actually here.
//
// The alternative, when the person a step names is away, is a Super Admin
// signing in their place. That is allowed once on a document and no more,
// because a document carrying five stand-in signatures from one account has
// stopped recording who agreed to the work.
//
// Delegation is the honest version. It does not sign anything. It changes WHO
// may sign this step, and then that person signs it themselves, under their
// own name. So it can happen as often as people are away — every hand-over
// carries a reason and lands in the audit log, and the signature at the end is
// somebody's real signature rather than somebody else's proxy.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { signoffs, auditLog, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireRoles } from "@/lib/authz";
import { canSignStep } from "@/lib/roles";
import { notify } from "@/lib/notifications";

// Who may hand a signature to somebody else. Deliberately the same authority
// that could otherwise sign in their place: delegation is the better-behaved
// version of the same power, not a wider one.
const DELEGATE_ROLES = ["SUPER_ADMIN"];

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const gate = await requireRoles(DELEGATE_ROLES);
    if (gate.res) return gate.res;

    const { id } = await params;
    const body = await request.json();

    const [step] = await db.select().from(signoffs).where(eq(signoffs.id, id)).limit(1);
    if (!step) return NextResponse.json({ error: "Sign-off step not found." }, { status: 404 });

    // A signature already given cannot be handed to anybody. Delegation decides
    // who signs, and that question is settled the moment somebody signs.
    if (step.status !== "PENDING") {
      return NextResponse.json(
        {
          error:
            `${step.roleLabel} has already been ${String(step.status).toLowerCase()}. ` +
            `A step can only be delegated while it is still waiting.`,
        },
        { status: 409 },
      );
    }

    const reason = String(body.reason ?? "").trim();
    if (reason.length < 10) {
      return NextResponse.json(
        {
          error:
            "Say why this signature is being moved — who is away, and why this person is taking it. " +
            "A hand-over with no reason is indistinguishable from picking whoever was nearest.",
          requiresReason: true,
        },
        { status: 400 },
      );
    }

    const toId = String(body.delegateToId ?? "");
    const [person] = await db
      .select({ id: users.id, name: users.name, role: users.role, isActive: users.isActive })
      .from(users)
      .where(eq(users.id, toId))
      .limit(1);
    if (!person) return NextResponse.json({ error: "That person was not found." }, { status: 400 });
    if (person.isActive === false) {
      return NextResponse.json(
        { error: `${person.name} is not an active account, so they cannot sign anything.` },
        { status: 409 },
      );
    }

    // The point of delegating is that the person can actually sign it. Handing
    // a Maintenance Manager's step to a technician would produce a step nobody
    // can complete, and the refusal would arrive later, to somebody else.
    if (!canSignStep(person.role, step.role)) {
      return NextResponse.json(
        {
          error:
            `${person.name} is ${person.role.replace(/_/g, " ").toLowerCase()} and cannot sign ` +
            `${step.roleLabel}. Delegate it to somebody whose role covers that step.`,
        },
        { status: 409 },
      );
    }

    const previousName = step.delegatedToName ?? step.signerUserName ?? null;
    const now = new Date().toISOString();

    await db
      .update(signoffs)
      .set({
        // Binding the step to the delegate is what makes their signature their
        // own rather than an override: when they sign, they are exactly who the
        // step now names.
        signerUserId: person.id,
        signerUserName: person.name,
        delegatedToId: person.id,
        delegatedToName: person.name,
        delegatedById: gate.actor?.id ?? null,
        delegatedByName: gate.actor?.name ?? null,
        delegatedAt: now,
        delegationReason: reason.slice(0, 500),
      })
      .where(eq(signoffs.id, id));

    // Every hand-over is recorded, so a step delegated three times reads as
    // three decisions with three reasons rather than one name that changed.
    await db.insert(auditLog).values({
      id: nanoid(),
      userId: gate.actor?.id ?? null,
      userName: gate.actor?.name || "System",
      action: "UPDATE",
      entityType: step.entityType.toLowerCase(),
      entityId: step.entityId,
      entityDescription:
        `${step.roleLabel} delegated ${previousName ? `from ${previousName} ` : ""}to ${person.name} ` +
        `by ${gate.actor?.name}, ${reason.slice(0, 200)}`,
    });

    try {
      await notify({
        event: "GENERAL",
        title: `A signature has been delegated to you`,
        body:
          `${step.roleLabel} on ${step.entityType.replace(/_/g, " ").toLowerCase()} ${step.entityId}. ` +
          `Delegated by ${gate.actor?.name}. Reason: ${reason.slice(0, 200)}`,
        relatedEntityType: step.entityType.toLowerCase(),
        relatedEntityId: step.entityId,
        userIds: [person.id],
      });
    } catch (err) {
      console.warn("delegate: notify failed", err);
    }

    return NextResponse.json({
      ok: true,
      delegatedTo: { id: person.id, name: person.name, role: person.role },
      delegatedBy: gate.actor?.name ?? null,
      delegatedAt: now,
      reason: reason.slice(0, 500),
    });
  } catch (error) {
    console.error("Failed to delegate sign-off step:", error);
    return NextResponse.json({ error: "Failed to delegate the signature" }, { status: 500 });
  }
}
