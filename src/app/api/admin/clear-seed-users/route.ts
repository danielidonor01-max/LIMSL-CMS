// src/app/api/admin/clear-seed-users/route.ts
// Removes the seeded demo accounts before real staff are added.
//
// Two rules make this safe to expose at all:
//
//   1. THE CALLER IS NEVER DELETED. Removing every account — including the one
//      making the request — locks the organisation out of its own system with
//      no way back in. The caller is always kept, whatever else goes.
//
//   2. Nothing that is referenced is deleted. A user id appears on signatures,
//      audit rows, work orders and permits; deleting the row would either break
//      a foreign key or, worse, orphan a signature and destroy the evidence
//      trail the whole product exists to keep. Accounts that have DONE anything
//      are deactivated instead — they can no longer sign in, and their history
//      stays readable and attributable.
//
// This is a preview-then-confirm endpoint: GET reports what would happen, POST
// carries it out.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  users,
  auditLog,
  signoffs,
  workOrders,
  correctiveMaintenance,
  permits,
  maintenanceSchedule,
  notifications,
} from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireRoles } from "@/lib/authz";
import { SETTINGS_WRITE_ROLES } from "@/lib/roles";

export const dynamic = "force-dynamic";

type Plan = {
  keptSelf: { id: string; name: string; email: string } | null;
  toDelete: { id: string; name: string; email: string }[];
  toDeactivate: { id: string; name: string; email: string; reason: string }[];
  total: number;
};

async function buildPlan(actorId: string | null): Promise<Plan> {
  const all = await db.select().from(users);

  // Everything that pins a user id in place.
  const [sg, wo, cm, pm, sc, nt, al] = await Promise.all([
    db.select({ id: signoffs.signedById }).from(signoffs),
    db.select({ id: workOrders.technicianId }).from(workOrders),
    db.select({ id: correctiveMaintenance.reportedById }).from(correctiveMaintenance),
    db.select({ id: permits.permitHolderId }).from(permits),
    db.select({ id: maintenanceSchedule.responsiblePersonId }).from(maintenanceSchedule),
    db.select({ id: notifications.userId }).from(notifications),
    db.select({ id: auditLog.userId }).from(auditLog),
  ]);

  const referenced = new Set<string>();
  for (const rows of [sg, wo, cm, pm, sc, nt, al]) {
    for (const r of rows) if (r.id) referenced.add(r.id);
  }

  const plan: Plan = { keptSelf: null, toDelete: [], toDeactivate: [], total: all.length };

  for (const u of all) {
    const brief = { id: u.id, name: u.name, email: u.email };
    if (actorId && u.id === actorId) {
      plan.keptSelf = brief;
      continue;
    }
    if (referenced.has(u.id)) {
      plan.toDeactivate.push({
        ...brief,
        reason: "Has activity in the system — deactivated so their records stay attributable.",
      });
      continue;
    }
    plan.toDelete.push(brief);
  }
  return plan;
}

export async function GET() {
  const gate = await requireRoles(SETTINGS_WRITE_ROLES);
  if (gate.res) return gate.res;
  return NextResponse.json(await buildPlan(gate.actor?.id ?? null));
}

export async function POST() {
  const gate = await requireRoles(SETTINGS_WRITE_ROLES);
  if (gate.res) return gate.res;

  const actorId = gate.actor?.id ?? null;
  if (!actorId) {
    // Without knowing who is asking, "keep the caller" cannot be honoured, and
    // the safe answer is to do nothing at all.
    return NextResponse.json({ error: "Could not identify the signed-in account. Sign in again and retry." }, { status: 400 });
  }

  const plan = await buildPlan(actorId);

  if (plan.toDelete.length) {
    await db.delete(users).where(inArray(users.id, plan.toDelete.map((u) => u.id)));
  }
  if (plan.toDeactivate.length) {
    await db
      .update(users)
      .set({ isActive: false })
      .where(inArray(users.id, plan.toDeactivate.map((u) => u.id)));
  }

  await db.insert(auditLog).values({
    id: nanoid(),
    userId: actorId,
    userName: gate.actor?.name ?? "Admin",
    action: "DELETE",
    entityType: "user",
    entityId: "seed-users",
    entityDescription:
      `Seed accounts cleared — ${plan.toDelete.length} deleted, ${plan.toDeactivate.length} deactivated ` +
      `(had activity). ${plan.keptSelf?.email ?? "the signed-in account"} retained.`,
  });

  return NextResponse.json({
    ok: true,
    deleted: plan.toDelete.length,
    deactivated: plan.toDeactivate.length,
    kept: plan.keptSelf,
  });
}
