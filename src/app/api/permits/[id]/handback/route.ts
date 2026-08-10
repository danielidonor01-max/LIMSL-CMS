// src/app/api/permits/[id]/handback/route.ts
// The two blocks at the foot of the paper permit.
//
// HANDBACK OF WORK: the work party states the job is complete and the worksite
// cleared, or that it is suspended and why. This is a statement, not a closure:
// the permit still closes on its signatures.
//
// WORK ACCEPTANCE CLOSURE: the asset holder accepts the job as stated. Together
// with the close-out chain this is what makes the permit the evidence that the
// work was done, was authorised, and was handed back.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { permits, auditLog } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireRoles } from "@/lib/authz";
import { MAINTENANCE_WRITE_ROLES } from "@/lib/roles";

const ACCEPT_ROLES = ["SUPER_ADMIN", "FACTORY_MANAGER", "MAINTENANCE_MANAGER", "HSE"];

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const body = await request.json();
    const action = body.action === "accept" ? "accept" : "handback";

    const gate = await requireRoles(action === "accept" ? ACCEPT_ROLES : MAINTENANCE_WRITE_ROLES);
    if (gate.res) return gate.res;

    const { id } = await params;
    const [permit] = await db.select().from(permits).where(eq(permits.id, id)).limit(1);
    if (!permit) return NextResponse.json({ error: "Permit not found" }, { status: 404 });

    if (permit.status === "PENDING_APPROVAL") {
      return NextResponse.json(
        { error: "This permit has not been signed. There is no authorised work to hand back." },
        { status: 409 },
      );
    }

    if (action === "handback") {
      const outcome = body.outcome === "COMPLETED" || body.outcome === "SUSPENDED" ? body.outcome : null;
      if (!outcome) {
        return NextResponse.json(
          { error: "State whether the job is complete and the worksite cleared, or suspended." },
          { status: 400 },
        );
      }
      // A suspended job leaves isolation, tools or an open machine behind, and
      // whoever picks it up next needs to know what state it was left in.
      const reason = String(body.reason ?? "").trim();
      if (outcome === "SUSPENDED" && reason.length < 10) {
        return NextResponse.json(
          { error: "Say why the job was suspended and what state the worksite was left in." },
          { status: 400 },
        );
      }

      await db
        .update(permits)
        .set({
          handbackOutcome: outcome,
          handbackReason: outcome === "SUSPENDED" ? reason.slice(0, 500) : null,
          handbackByName: gate.actor?.name ?? null,
          handbackAt: new Date().toISOString(),
        })
        .where(eq(permits.id, id));

      await db.insert(auditLog).values({
        id: nanoid(),
        userId: gate.actor?.id ?? null,
        userName: gate.actor?.name || "System",
        action: "UPDATE",
        entityType: "permit",
        entityId: id,
        entityDescription:
          outcome === "COMPLETED"
            ? `${permit.permitNumber} handed back, job complete and worksite cleared`
            : `${permit.permitNumber} handed back SUSPENDED, ${reason.slice(0, 200)}`,
      });

      const [updated] = await db.select().from(permits).where(eq(permits.id, id)).limit(1);
      return NextResponse.json(updated);
    }

    // Acceptance follows handback. Accepting a job nobody has handed back is
    // signing for work whose state was never stated.
    if (!permit.handbackOutcome) {
      return NextResponse.json(
        { error: "The work party has not handed the job back yet." },
        { status: 409 },
      );
    }

    await db
      .update(permits)
      .set({
        acceptedByName: gate.actor?.name ?? null,
        acceptedByDept: body.dept ? String(body.dept).slice(0, 60) : null,
        acceptedAt: new Date().toISOString(),
      })
      .where(eq(permits.id, id));

    await db.insert(auditLog).values({
      id: nanoid(),
      userId: gate.actor?.id ?? null,
      userName: gate.actor?.name || "System",
      action: "UPDATE",
      entityType: "permit",
      entityId: id,
      entityDescription: `${permit.permitNumber} job accepted as stated by ${gate.actor?.name ?? "an approver"}`,
    });

    const [updated] = await db.select().from(permits).where(eq(permits.id, id)).limit(1);
    return NextResponse.json(updated);
  } catch (error) {
    console.error("Failed to record handback:", error);
    return NextResponse.json({ error: "Failed to record the handback" }, { status: 500 });
  }
}

// HANDOVER OF WORK: the permit passing between two named people mid-job, the
// small table under the renewal grid.
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const gate = await requireRoles(MAINTENANCE_WRITE_ROLES);
    if (gate.res) return gate.res;

    const { id } = await params;
    const body = await request.json();

    const from = String(body.from ?? "").trim();
    const to = String(body.to ?? "").trim();
    if (!from || !to) {
      return NextResponse.json({ error: "Name who is handing over and who is taking it on." }, { status: 400 });
    }

    const [permit] = await db.select().from(permits).where(eq(permits.id, id)).limit(1);
    if (!permit) return NextResponse.json({ error: "Permit not found" }, { status: 404 });
    if (permit.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "Only an active permit can be handed over." },
        { status: 409 },
      );
    }

    let list: { from: string; to: string; at: string }[] = [];
    try {
      const parsed = JSON.parse(permit.handovers ?? "[]");
      if (Array.isArray(parsed)) list = parsed;
    } catch {
      list = [];
    }
    list.push({ from: from.slice(0, 80), to: to.slice(0, 80), at: new Date().toISOString() });

    await db.update(permits).set({ handovers: JSON.stringify(list) }).where(eq(permits.id, id));

    await db.insert(auditLog).values({
      id: nanoid(),
      userId: gate.actor?.id ?? null,
      userName: gate.actor?.name || "System",
      action: "UPDATE",
      entityType: "permit",
      entityId: id,
      entityDescription: `${permit.permitNumber} handed over from ${from} to ${to}`,
    });

    return NextResponse.json({ handovers: list });
  } catch (error) {
    console.error("Failed to record handover:", error);
    return NextResponse.json({ error: "Failed to record the handover" }, { status: 500 });
  }
}
