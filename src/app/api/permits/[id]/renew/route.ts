// src/app/api/permits/[id]/renew/route.ts
// The Validity & Renewal grid on the permit face. The Asset Holder Supervisor
// signs each day of the validity period: a day worked carries a date, a time and
// a signature, a day not worked is struck through. Weekend days are ordinary
// days here, because the paper grid has a column for them.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { permits, auditLog } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireRoles } from "@/lib/authz";
import { validateRenewal, normaliseValidityDays, type RenewalMarks } from "@/lib/hse/permit-validity";
import { startDateOf, parseRenewals } from "@/lib/hse/permit-reconcile";

// The AHS block on the paper form is the Maintenance Manager. A foreman may
// renew a day he is supervising, and Super Admin covers an absence, but a
// technician cannot authorise another day of his own work.
const RENEWAL_ROLES = ["SUPER_ADMIN", "FACTORY_MANAGER", "MAINTENANCE_MANAGER", "FOREMAN", "HSE"];

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const gate = await requireRoles(RENEWAL_ROLES);
    if (gate.res) return gate.res;

    const { id } = await params;
    const body = await request.json();

    const [permit] = await db.select().from(permits).where(eq(permits.id, id)).limit(1);
    if (!permit) return NextResponse.json({ error: "Permit not found" }, { status: 404 });

    // Only a permit that is authorised and still running can have a day signed
    // against it. Renewing a closed permit would put a signature against work
    // nobody was authorised to do.
    if (permit.status !== "ACTIVE") {
      return NextResponse.json(
        {
          error:
            permit.status === "PENDING_APPROVAL"
              ? "This permit is not signed yet. Work cannot be renewed against a permit that has not authorised anything."
              : `This permit is ${String(permit.status).toLowerCase().replace(/_/g, " ")} and cannot be renewed.`,
        },
        { status: 409 },
      );
    }

    const existing: RenewalMarks = parseRenewals(permit.renewalDays);
    const date = typeof body.date === "string" ? body.date.slice(0, 10) : "";

    const check = validateRenewal({
      startDate: startDateOf(permit),
      validityDays: normaliseValidityDays(permit.validityDays),
      date,
      today: new Date().toISOString().slice(0, 10),
      status: body.status,
      time: body.time,
      signedById: gate.actor?.id ?? null,
      signedByName: gate.actor?.name ?? null,
      signatureData: body.signatureData ?? null,
      existing: existing[date] ?? null,
      amendReason: body.amendReason,
    });

    if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

    const next: RenewalMarks = {
      ...existing,
      [check.day.date]: { ...check.day, markedAt: new Date().toISOString() },
    };

    await db.update(permits).set({ renewalDays: JSON.stringify(next) }).where(eq(permits.id, id));

    await db.insert(auditLog).values({
      id: nanoid(),
      userId: gate.actor?.id ?? null,
      userName: gate.actor?.name || "System",
      action: "UPDATE",
      entityType: "permit",
      entityId: id,
      entityDescription: check.day.amendedFrom
        ? `${permit.permitNumber} renewal for ${check.day.date} amended to ${check.day.status}${check.day.time ? ` at ${check.day.time}` : ""}, was ${check.day.amendedFrom}`
        : `${permit.permitNumber} ${check.day.date} marked ${check.day.status === "WORKED" ? `worked from ${check.day.time}` : "not worked"}`,
    });

    return NextResponse.json({ renewalDays: next });
  } catch (error) {
    console.error("Failed to record permit renewal:", error);
    return NextResponse.json({ error: "Failed to record the renewal" }, { status: 500 });
  }
}
