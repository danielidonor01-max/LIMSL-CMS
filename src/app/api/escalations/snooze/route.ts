// src/app/api/escalations/snooze/route.ts
// "I'm on it, stop telling me every morning."
//
// Distinct from DEFERRING a scheduled activity, and the difference matters:
//   • Deferring changes the activity's STATUS. It is a risk formally accepted,
//     and it leaves the overdue figure.
//   • Snoozing changes nothing about the record. The item is still overdue, it
//     still counts against PM compliance, it still appears on the schedule —
//     it just stops generating a daily reminder to someone already dealing with
//     it. Quieting a reminder is not the same as excusing the work, and a
//     system that offers only the second forces people to misuse it.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/db/schema";
import { nanoid } from "nanoid";
import { requireRoles } from "@/lib/authz";
import { MAINTENANCE_WRITE_ROLES } from "@/lib/roles";
import { validateSnooze } from "@/lib/maintenance/escalation-policy";
import { setSnooze, activeSnoozes } from "@/lib/maintenance/escalation-store";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireRoles(MAINTENANCE_WRITE_ROLES);
  if (gate.res) return gate.res;
  const map = await activeSnoozes();
  return NextResponse.json({
    snoozes: [...map.entries()].map(([key, s]) => ({ key, ...s })),
  });
}

export async function POST(request: Request) {
  try {
    const gate = await requireRoles(MAINTENANCE_WRITE_ROLES);
    if (gate.res) return gate.res;

    const body = await request.json();
    const entityType = String(body.entityType ?? "").toUpperCase();
    const entityId = String(body.entityId ?? "");
    if (!["SCHEDULE", "CORRECTIVE"].includes(entityType) || !entityId) {
      return NextResponse.json({ error: "Say which item is being snoozed." }, { status: 400 });
    }

    const check = validateSnooze(body.reason, body.until);
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

    await setSnooze({
      entityType,
      entityId,
      until: check.until,
      reason: check.reason,
      byId: gate.actor?.id ?? null,
      byName: gate.actor?.name ?? null,
    });

    // Recorded, because "why did this stop being chased" is a fair question and
    // a quiet reminder with no trace is how work goes missing.
    await db.insert(auditLog).values({
      id: nanoid(),
      userId: gate.actor?.id ?? null,
      userName: gate.actor?.name || "System",
      action: "UPDATE",
      entityType: entityType === "SCHEDULE" ? "maintenance_schedule" : "corrective_maintenance",
      entityId,
      entityDescription: `Reminders quietened until ${check.until} — ${check.reason}`,
    });

    return NextResponse.json({ ok: true, until: check.until });
  } catch (error) {
    console.error("Failed to snooze reminders:", error);
    return NextResponse.json({ error: "Could not snooze the reminders." }, { status: 500 });
  }
}
