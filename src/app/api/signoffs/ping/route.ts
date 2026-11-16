// src/app/api/signoffs/ping/route.ts
// Remind the next signer on a document. GET says whether the caller can ping
// and when; POST sends it. The 30-minute limit is read from the notifications
// already sent, the same record the escalation sweep uses to avoid repeating
// itself, so there is no second ledger to drift from what people received.
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { auditLog, notifications } from "@/lib/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getSignoffChain } from "@/lib/signoff/service";
import { stepAudience } from "@/lib/signoff/chains";
import { pingEligibility, pingWindow, PING_INTERVAL_MINUTES } from "@/lib/signoff/ping";
import { entityHref, entityLabel } from "@/lib/signoff/inbox";
import { notify } from "@/lib/notifications";
import { ROLE_LABELS } from "@/lib/roles";

type Actor = { id?: string; name?: string; role?: string };

async function state(entityType: string, entityId: string, actor: Actor) {
  const chain = await getSignoffChain(entityType, entityId);
  const elig = pingEligibility(actor, entityType, chain);
  const [last] = await db
    .select({ createdAt: notifications.createdAt, body: notifications.body })
    .from(notifications)
    .where(
      and(
        eq(notifications.event, "SIGN_PING"),
        eq(notifications.relatedEntityType, entityType),
        eq(notifications.relatedEntityId, entityId),
      ),
    )
    .orderBy(desc(notifications.createdAt))
    .limit(1);
  const window = pingWindow(last?.createdAt ?? null);
  const step = elig.step;
  return {
    elig,
    payload: {
      canPing: elig.ok,
      reason: elig.ok ? null : elig.reason,
      waitingOn: step
        ? {
            stepOrder: step.stepOrder,
            roleLabel: step.roleLabel,
            who: step.signerUserName ?? ROLE_LABELS[step.role] ?? step.role,
          }
        : null,
      lastPingAt: last?.createdAt ?? null,
      allowed: window.allowed,
      nextAt: window.nextAt,
      intervalMinutes: PING_INTERVAL_MINUTES,
    },
  };
}

function target(req: Request, body?: { entityType?: unknown; entityId?: unknown }) {
  const url = new URL(req.url);
  const entityType = String(body?.entityType ?? url.searchParams.get("entityType") ?? "");
  const entityId = String(body?.entityId ?? url.searchParams.get("entityId") ?? "");
  return entityType && entityId ? { entityType, entityId } : null;
}

export async function GET(req: Request) {
  const session = await auth();
  const actor = session?.user as Actor | undefined;
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const t = target(req);
  if (!t) return NextResponse.json({ error: "entityType and entityId are required" }, { status: 400 });
  try {
    return NextResponse.json((await state(t.entityType, t.entityId, actor)).payload);
  } catch (err) {
    console.error("ping state failed", err);
    return NextResponse.json({ error: "Could not load the ping state" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await auth();
  const actor = session?.user as Actor | undefined;
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const t = target(req, body);
  if (!t) return NextResponse.json({ error: "entityType and entityId are required" }, { status: 400 });

  try {
    const { elig, payload } = await state(t.entityType, t.entityId, actor);
    if (!elig.ok) return NextResponse.json({ ...payload, error: elig.reason }, { status: 403 });
    if (!payload.allowed) {
      const at = new Date(payload.nextAt!).toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Africa/Lagos",
      });
      return NextResponse.json(
        { ...payload, error: `The next signer was pinged in the last ${PING_INTERVAL_MINUTES} minutes. You can ping again at ${at}.` },
        { status: 429 },
      );
    }

    const step = elig.step;
    let ref = "";
    try {
      const { describeEntities } = await import("@/lib/signoff/describe");
      const d = (await describeEntities([t])).get(`${t.entityType}:${t.entityId}`);
      if (d?.code) ref = ` ${d.code}`;
    } catch {
      // The reminder still goes without the number.
    }
    const label = entityLabel(t.entityType);
    const sent = await notify({
      event: "SIGN_PING",
      title: `Reminder: ${label}${ref} is waiting on your signature`,
      body: `${actor.name ?? "Someone on the signing trail"} is asking you to sign the "${step.roleLabel}" step. The work cannot move until you do.`,
      linkPath: entityHref(t.entityType, t.entityId),
      relatedEntityType: t.entityType,
      relatedEntityId: t.entityId,
      ...stepAudience(t.entityType, step),
    });
    if (sent.length === 0) {
      return NextResponse.json(
        { ...payload, error: `Nobody active can be pinged for "${step.roleLabel}". Check that the account exists and is active.` },
        { status: 409 },
      );
    }

    await db.insert(auditLog).values({
      id: nanoid(),
      userId: actor.id ?? null,
      userName: actor.name ?? "User",
      action: "PING",
      entityType: t.entityType,
      entityId: t.entityId,
      entityDescription: `Pinged the next signer (${step.roleLabel})`,
    });

    return NextResponse.json({ ...(await state(t.entityType, t.entityId, actor)).payload, sent: sent.length });
  } catch (err) {
    console.error("ping failed", err);
    return NextResponse.json({ error: "Could not send the ping" }, { status: 500 });
  }
}
