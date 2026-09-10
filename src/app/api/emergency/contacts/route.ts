// src/app/api/emergency/contacts/route.ts
// The numbers somebody rings when something has gone wrong.
//
// Reading is open to every authenticated user, deliberately. An emergency
// contact list that only HSE can see is a list that is unavailable at the exact
// moment it is needed, which is somebody standing in Bay 3 at 2am.
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { emergencyContacts, auditLog } from "@/lib/db/schema";
import { asc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireRoles } from "@/lib/authz";
import { COMPLIANCE_WRITE_ROLES } from "@/lib/roles";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const rows = await db
      .select()
      .from(emergencyContacts)
      .orderBy(asc(emergencyContacts.displayOrder), asc(emergencyContacts.name));
    return NextResponse.json(rows);
  } catch (error) {
    console.error("Failed to fetch emergency contacts:", error);
    return NextResponse.json({ error: "Failed to fetch contacts" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const gate = await requireRoles(COMPLIANCE_WRITE_ROLES);
  if (gate.res) return gate.res;

  try {
    const body = await request.json();
    const name = String(body.name ?? "").trim();
    const phone = String(body.phone ?? "").trim();

    if (!name) return NextResponse.json({ error: "Give the contact a name." }, { status: 400 });
    if (!phone) {
      return NextResponse.json(
        { error: "A contact with no number is not a contact." },
        { status: 400 },
      );
    }

    const id = nanoid();
    await db.insert(emergencyContacts).values({
      id,
      name,
      organisation: body.organisation || null,
      kind: body.kind || "OTHER",
      phone,
      altPhone: body.altPhone || null,
      notes: body.notes || null,
      displayOrder: Number.isFinite(body.displayOrder) ? Number(body.displayOrder) : 100,
    });

    await db.insert(auditLog).values({
      id: nanoid(),
      userId: gate.actor?.id ?? null,
      userName: gate.actor?.name ?? "Unknown",
      action: "CREATE",
      entityType: "emergency_contact",
      entityId: id,
      entityDescription: `Emergency contact added: ${name}`,
    });

    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    console.error("Failed to add emergency contact:", error);
    return NextResponse.json({ error: "Failed to add the contact" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const gate = await requireRoles(COMPLIANCE_WRITE_ROLES);
  if (gate.res) return gate.res;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Which contact?" }, { status: 400 });

    const [row] = await db.select().from(emergencyContacts).where(eq(emergencyContacts.id, id)).limit(1);
    if (!row) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

    await db.delete(emergencyContacts).where(eq(emergencyContacts.id, id));

    await db.insert(auditLog).values({
      id: nanoid(),
      userId: gate.actor?.id ?? null,
      userName: gate.actor?.name ?? "Unknown",
      action: "DELETE",
      entityType: "emergency_contact",
      entityId: id,
      entityDescription: `Emergency contact removed: ${row.name}`,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to remove emergency contact:", error);
    return NextResponse.json({ error: "Failed to remove the contact" }, { status: 500 });
  }
}
