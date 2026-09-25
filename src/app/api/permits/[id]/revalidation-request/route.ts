// src/app/api/permits/[id]/revalidation-request/route.ts
// A technician asking for today's revalidation.
//
// After the first day, work under a permit waits each morning for the day's
// renewal to be signed on the permit. The technician cannot sign it — that is
// the point — but they are the one standing at the machine knowing it is
// needed. This tells the Maintenance Manager, with a link straight to the
// permit, and records that it was asked for and when. It signs nothing.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { permits, notifications, auditLog } from "@/lib/db/schema";
import { and, eq, gte } from "drizzle-orm";
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
    if (parseRenewalMarks(permit.renewalDays)[today]?.status === "WORKED") {
      return NextResponse.json({ ok: true, alreadyRevalidated: true });
    }

    // Once a day is enough. A second press should not send a second message.
    const [already] = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.relatedEntityType, "permit_revalidation"),
          eq(notifications.relatedEntityId, permit.id),
          gte(notifications.createdAt, `${today}T00:00:00Z`),
        ),
      )
      .limit(1);
    if (already) return NextResponse.json({ ok: true, alreadyAsked: true });

    await notify({
      event: "PTW_SIGN_REQUEST",
      title: `Revalidate ${permit.permitNumber} for today`,
      body:
        `${gate.actor?.name ?? "A technician"} is ready to start work under ${permit.permitNumber} ` +
        `(${permit.workDescription}) and needs today's revalidation signed on the permit before ` +
        `work can begin.`,
      linkPath: `/permits/${permit.id}`,
      relatedEntityType: "permit_revalidation",
      relatedEntityId: permit.id,
      roles: ["MAINTENANCE_MANAGER"],
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
