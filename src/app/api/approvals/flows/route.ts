// src/app/api/approvals/flows/route.ts
// Every approval flow in the system and where it has got to.
//
// The queue at /api/approvals answers "what is waiting on me". This answers the
// question a supervisor asks next: what else is moving, and who is it stuck
// with? A permit waiting on HSE, a method statement waiting on QA/QC, a
// category change the Factory Manager raised — each is a chain in the same
// sign-off engine, so each can be read the same way: how far along, waiting on
// whom, since when.
//
// Scoped to what the reader can open. A flow whose document sits in a module
// the reader's role cannot reach is left out rather than shown as a link that
// refuses them.
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { signoffs } from "@/lib/db/schema";
import { describeEntities } from "@/lib/signoff/describe";
import { entityLabel, pendingFor, type SignoffRow } from "@/lib/signoff/inbox";
import { canAccessPath, ROLE_LABELS } from "@/lib/roles";

type FlowStatus = "IN_PROGRESS" | "RETURNED" | "COMPLETE";

// Finished flows stay on the tracker for a month, long enough to answer "did
// that get signed" and short enough that the list stays about current work.
const FINISHED_WINDOW_DAYS = 30;

export async function GET() {
  const session = await auth();
  const actor = session?.user as { id?: string; role?: string } | undefined;
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const rows = (await db.select().from(signoffs)) as SignoffRow[];
    const byEntity = new Map<string, SignoffRow[]>();
    for (const r of rows) {
      const key = `${r.entityType}:${r.entityId}`;
      byEntity.set(key, [...(byEntity.get(key) ?? []), r]);
    }

    const mine = new Set(pendingFor(rows, { id: actor.id, role: actor.role }).map((m) => `${m.entityType}:${m.entityId}`));
    const cutoff = new Date(Date.now() - FINISHED_WINDOW_DAYS * 864e5).toISOString();

    const flows: Array<{
      entityType: string;
      entityId: string;
      kind: string;
      status: FlowStatus;
      signed: number;
      total: number;
      waitingOn: string | null;
      waitingOnPerson: string | null;
      returnedBy: string | null;
      lastActivity: string;
      yours: boolean;
    }> = [];

    for (const [key, chainRows] of byEntity) {
      const chain = [...chainRows].sort((a, b) => a.stepOrder - b.stepOrder);
      const required = chain.filter((s) => s.required !== false);
      const signed = required.filter((s) => s.status === "SIGNED").length;
      const rejected = chain.find((s) => s.status === "REJECTED");
      const status: FlowStatus = rejected ? "RETURNED" : signed === required.length ? "COMPLETE" : "IN_PROGRESS";

      const activity = chain
        .map((s) => (s as { signedAt?: string | null }).signedAt ?? (s as { createdAt?: string | null }).createdAt ?? "")
        .filter(Boolean)
        .sort();
      const lastActivity = activity[activity.length - 1] ?? "";
      if (status !== "IN_PROGRESS" && lastActivity < cutoff) continue;

      // Who it is waiting on: the first unsigned required step, by name when the
      // step is bound to a person, otherwise by role.
      const next = status === "IN_PROGRESS" ? required.find((s) => s.status !== "SIGNED") : undefined;
      const nextPerson =
        (next as { delegatedToName?: string | null } | undefined)?.delegatedToName ??
        (next as { signerUserName?: string | null } | undefined)?.signerUserName ??
        null;

      const [entityType, entityId] = [chain[0].entityType, chain[0].entityId];
      flows.push({
        entityType,
        entityId,
        kind: entityLabel(entityType),
        status,
        signed,
        total: required.length,
        waitingOn: next ? (ROLE_LABELS[next.role] ?? next.role) : null,
        waitingOnPerson: nextPerson,
        returnedBy: rejected ? ((rejected as { signedByName?: string | null }).signedByName ?? null) : null,
        lastActivity,
        yours: mine.has(key),
      });
    }

    const described = await describeEntities(flows);
    const visible = flows
      .map((f) => {
        const d = described.get(`${f.entityType}:${f.entityId}`);
        return d ? { ...f, title: d.title, code: d.code, href: d.href } : null;
      })
      // A chain whose document no longer exists is not a flow anybody can act on.
      .filter((f): f is NonNullable<typeof f> => !!f)
      .filter((f) => canAccessPath(actor.role, f.href.split("?")[0]))
      .sort((a, b) => b.lastActivity.localeCompare(a.lastActivity));

    return NextResponse.json({ flows: visible });
  } catch (error) {
    console.error("Failed to build the approval flows:", error);
    return NextResponse.json({ error: "Failed to load approval flows" }, { status: 500 });
  }
}
