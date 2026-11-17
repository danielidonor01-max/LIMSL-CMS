// src/app/api/permits/[id]/revalidation-request/route.ts
// The permit holder asking for today's revalidation.
//
// After the first day, work under a permit waits each morning for the day's
// renewal to be signed on the permit. The permit holder cannot sign it, that
// is the point, but they are the one at the machine who knows it is needed.
//
// LIMSL, 17 Nov 2026: the request is the PERMIT HOLDER's to make (the person
// the permit names, not any technician) and it goes to the Factory Manager.
// It is written onto the permit's validity record as a REQUESTED day, so the
// grid shows who asked and when even before anybody signs. It signs nothing.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { permits, auditLog } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireRoles } from "@/lib/authz";
import { MAINTENANCE_WRITE_ROLES } from "@/lib/roles";
import { notify } from "@/lib/notifications";
import { parseRenewalMarks } from "@/lib/maintenance/work-readiness";
import { isWithinWindow } from "@/lib/hse/permit-validity";
import { permitToday } from "@/lib/maintenance/work-readiness-db";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const gate = await requireRoles(MAINTENANCE_WRITE_ROLES);
    if (gate.res) return gate.res;
    const { id } = await params;

    const [permit] = await db.select().from(permits).where(eq(permits.id, id)).limit(1);
    if (!permit) return NextResponse.json({ error: "Permit not found." }, { status: 404 });

    const actor = gate.actor;
    if (permit.permitHolderId && actor?.id !== permit.permitHolderId && actor?.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        {
          error: `Only the permit holder, ${permit.permitHolderName ?? "named on the permit"}, asks for ${permit.permitNumber} to be revalidated.`,
        },
        { status: 403 },
      );
    }

    const today = permitToday();
    if (permit.status !== "ACTIVE") {
      return NextResponse.json(
        { error: `${permit.permitNumber} is not in force, so it cannot be revalidated.` },
        { status: 409 },
      );
    }
    if (!permit.startDate || !isWithinWindow(permit.startDate, permit.validityDays ?? 7, today)) {
      return NextResponse.json(
        { error: `${permit.permitNumber} is outside its validity period. HSE raise a successor.` },
        { status: 409 },
      );
    }
    const marks = parseRenewalMarks(permit.renewalDays);
    const mark = marks[today];
    if (mark?.status === "WORKED") {
      return NextResponse.json({ ok: true, alreadyRevalidated: true });
    }
    if (mark?.status === "NOT_WORKED") {
      return NextResponse.json(
        { error: `${today} is already struck as not worked on ${permit.permitNumber}.` },
        { status: 409 },
      );
    }
    // Once a day is enough. A second press should not send a second message.
    if (mark?.status === "REQUESTED") return NextResponse.json({ ok: true, alreadyAsked: true });

    const now = new Date().toISOString();
    await db
      .update(permits)
      .set({
        renewalDays: JSON.stringify({
          ...marks,
          [today]: {
            date: today,
            status: "REQUESTED",
            requestedById: actor?.id ?? null,
            requestedByName: actor?.name ?? null,
            requestedAt: now,
          },
        }),
      })
      .where(eq(permits.id, permit.id));

    await notify({
      event: "PTW_SIGN_REQUEST",
      title: `Revalidate ${permit.permitNumber} for today`,
      body:
        `${actor?.name ?? "The permit holder"} is ready to start work under ${permit.permitNumber} ` +
        `(${permit.workDescription}) and needs today's revalidation signed on the permit before ` +
        `work can begin.`,
      linkPath: `/permits/${permit.id}`,
      relatedEntityType: "permit_revalidation",
      relatedEntityId: permit.id,
      roles: ["FACTORY_MANAGER"],
    });

    await db.insert(auditLog).values({
      id: nanoid(),
      userId: gate.actor?.id ?? null,
      userName: gate.actor?.name || "System",
      action: "UPDATE",
      entityType: "permit",
      entityId: permit.id,
      entityDescription: `${gate.actor?.name ?? "Someone"} asked for ${permit.permitNumber} to be revalidated for ${today}`,
    });

    return NextResponse.json({ ok: true, asked: true });
  } catch (error) {
    console.error("Failed to request revalidation:", error);
    return NextResponse.json({ error: "Failed to request the revalidation" }, { status: 500 });
  }
}
