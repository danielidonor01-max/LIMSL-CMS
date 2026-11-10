// src/app/api/oem/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { oemRegistry, oemInterventions, equipment, auditLog, equipmentLog } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireRoles } from "@/lib/authz";
import { MAINTENANCE_WRITE_ROLES } from "@/lib/roles";

const today = () => new Date().toISOString().slice(0, 10);

export async function GET() {
  try {
    const rows = await db
      .select({
        id: oemRegistry.id,
        equipmentId: oemRegistry.equipmentId,
        vendorName: oemRegistry.vendorName,
        contactPerson: oemRegistry.contactPerson,
        phone: oemRegistry.phone,
        email: oemRegistry.email,
        country: oemRegistry.country,
        warrantyStart: oemRegistry.warrantyStart,
        warrantyEnd: oemRegistry.warrantyEnd,
        warrantyScope: oemRegistry.warrantyScope,
        avgResponseTimeHrs: oemRegistry.avgResponseTimeHrs,
        avgSpareLeadTimeDays: oemRegistry.avgSpareLeadTimeDays,
        notes: oemRegistry.notes,
        equipmentName: equipment.name,
        assetId: equipment.assetId,
      })
      .from(oemRegistry)
      .leftJoin(equipment, eq(oemRegistry.equipmentId, equipment.id))
      .orderBy(oemRegistry.vendorName);

    // The stored warranty_active flag is set once, at registration, and nothing
    // ever turns it off, so a warranty that lapsed last year still read as
    // active. Cover is a fact about today's date, so it is worked out here.
    const t = today();
    const vendors = rows.map((v) => ({ ...v, warrantyActive: !!v.warrantyEnd && v.warrantyEnd >= t }));

    const interventions = await db
      .select({
        id: oemInterventions.id,
        oemId: oemInterventions.oemId,
        equipmentId: oemInterventions.equipmentId,
        interventionDate: oemInterventions.interventionDate,
        problemDescription: oemInterventions.problemDescription,
        warrantyStatus: oemInterventions.warrantyStatus,
        responseTimeHrs: oemInterventions.responseTimeHrs,
        resolutionSummary: oemInterventions.resolutionSummary,
        closed: oemInterventions.closed,
        vendorName: oemRegistry.vendorName,
        equipmentName: equipment.name,
        assetId: equipment.assetId,
      })
      .from(oemInterventions)
      .leftJoin(oemRegistry, eq(oemInterventions.oemId, oemRegistry.id))
      .leftJoin(equipment, eq(oemInterventions.equipmentId, equipment.id))
      .orderBy(desc(oemInterventions.interventionDate));

    return NextResponse.json({ vendors, interventions });
  } catch (error) {
    console.error("Failed to load OEM data:", error);
    return NextResponse.json({ error: "Failed to load OEM data" }, { status: 500 });
  }
}

// Register a new OEM / vendor against a piece of equipment, with warranty terms.
export async function POST(request: Request) {
  try {
    const gate = await requireRoles(MAINTENANCE_WRITE_ROLES);
    if (gate.res) return gate.res;

    const body = await request.json();
    if (!body.equipmentId || !body.vendorName) {
      return NextResponse.json(
        { error: "equipmentId and vendorName are required" },
        { status: 400 },
      );
    }

    const vendor = {
      id: nanoid(),
      equipmentId: body.equipmentId,
      vendorName: body.vendorName,
      contactPerson: body.contactPerson || null,
      phone: body.phone || null,
      email: body.email || null,
      country: body.country || null,
      warrantyStart: body.warrantyStart || null,
      warrantyEnd: body.warrantyEnd || null,
      warrantyScope: body.warrantyScope || null,
      warrantyActive: !!body.warrantyEnd && body.warrantyEnd >= today(),
      avgResponseTimeHrs: body.avgResponseTimeHrs ?? null,
      avgSpareLeadTimeDays: body.avgSpareLeadTimeDays ?? null,
      notes: body.notes || null,
    };

    await db.insert(oemRegistry).values(vendor);

    // Mirror the warranty expiry onto the equipment record.
    if (body.warrantyEnd) {
      await db
        .update(equipment)
        .set({ warrantyExpiry: body.warrantyEnd, updatedAt: new Date().toISOString() })
        .where(eq(equipment.id, body.equipmentId));
    }

    return NextResponse.json(vendor, { status: 201 });
  } catch (error) {
    console.error("Failed to register OEM vendor:", error);
    return NextResponse.json({ error: "Failed to register OEM vendor" }, { status: 500 });
  }
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

// Correct a vendor's details, or renew its warranty. Until this existed a
// vendor could only be registered, so a typo in a phone number stayed forever
// and an expired warranty could never be shown as renewed: the register went
// stale the day the first cover ran out.
export async function PATCH(request: Request) {
  try {
    const gate = await requireRoles(MAINTENANCE_WRITE_ROLES);
    if (gate.res) return gate.res;

    const body = await request.json();
    if (!body.id || (body.action !== "edit" && body.action !== "renew")) {
      return NextResponse.json({ error: "id and an action of edit or renew are required" }, { status: 400 });
    }

    const [vendor] = await db.select().from(oemRegistry).where(eq(oemRegistry.id, body.id)).limit(1);
    if (!vendor) return NextResponse.json({ error: "Vendor not found" }, { status: 404 });

    const set: Partial<typeof oemRegistry.$inferInsert> = {};

    if (body.action === "edit") {
      const vendorName = str(body.vendorName);
      if (!vendorName) return NextResponse.json({ error: "The vendor needs a name." }, { status: 400 });
      set.vendorName = vendorName;
      set.contactPerson = str(body.contactPerson);
      set.phone = str(body.phone);
      set.email = str(body.email);
      set.country = str(body.country);
      set.warrantyScope = str(body.warrantyScope);
      set.avgResponseTimeHrs = num(body.avgResponseTimeHrs);
      set.avgSpareLeadTimeDays = num(body.avgSpareLeadTimeDays);
      if (body.notes !== undefined) set.notes = str(body.notes);
      if (body.warrantyStart !== undefined) set.warrantyStart = isDate(body.warrantyStart) ? body.warrantyStart : null;
      if (body.warrantyEnd !== undefined) set.warrantyEnd = isDate(body.warrantyEnd) ? body.warrantyEnd : null;
      const start = set.warrantyStart ?? vendor.warrantyStart;
      const end = set.warrantyEnd ?? vendor.warrantyEnd;
      if (start && end && end <= start) {
        return NextResponse.json({ error: "The warranty must end after it starts." }, { status: 400 });
      }
    } else {
      if (!isDate(body.warrantyStart) || !isDate(body.warrantyEnd)) {
        return NextResponse.json({ error: "A renewal needs a start and an end date." }, { status: 400 });
      }
      if (body.warrantyEnd <= body.warrantyStart) {
        return NextResponse.json({ error: "The warranty must end after it starts." }, { status: 400 });
      }
      set.warrantyStart = body.warrantyStart;
      set.warrantyEnd = body.warrantyEnd;
      if (body.warrantyScope !== undefined) set.warrantyScope = str(body.warrantyScope);
    }

    const newEnd = set.warrantyEnd !== undefined ? set.warrantyEnd : vendor.warrantyEnd;
    set.warrantyActive = !!newEnd && newEnd >= today();

    await db.update(oemRegistry).set(set).where(eq(oemRegistry.id, vendor.id));

    // The machine record carries its own copy of the expiry (the equipment
    // page and the scan passport read it), so it has to move with the vendor
    // or the two pages disagree about whether the machine is covered.
    if (set.warrantyEnd !== undefined && set.warrantyEnd !== vendor.warrantyEnd) {
      await db
        .update(equipment)
        .set({ warrantyExpiry: set.warrantyEnd, updatedAt: new Date().toISOString() })
        .where(eq(equipment.id, vendor.equipmentId));
    }

    const name = set.vendorName ?? vendor.vendorName;
    const now = new Date().toISOString();
    await db.insert(auditLog).values({
      id: nanoid(),
      userId: gate.actor?.id ?? null,
      userName: gate.actor?.name || "System",
      action: "UPDATE",
      entityType: "oem_registry",
      entityId: vendor.id,
      entityDescription:
        body.action === "renew"
          ? `Warranty with ${name} renewed: ${set.warrantyStart} to ${set.warrantyEnd}${vendor.warrantyEnd ? ` (was to ${vendor.warrantyEnd})` : ""}`
          : `Vendor details updated: ${name}`,
      changes: JSON.stringify({ before: vendor, after: set }),
    });

    // A renewal is something that happened to the machine, so it belongs in
    // the machine's history beside its repairs and calibrations.
    if (body.action === "renew") {
      const note = str(body.note);
      await db.insert(equipmentLog).values({
        id: nanoid(),
        equipmentId: vendor.equipmentId,
        category: "DOCUMENT",
        title: `Warranty renewed with ${name} to ${set.warrantyEnd}`,
        detail: [set.warrantyScope ?? vendor.warrantyScope, note].filter(Boolean).join(" · ") || null,
        refType: "oem_registry",
        refId: vendor.id,
        href: "/oem",
        source: "MANUAL",
        performedById: gate.actor?.id ?? null,
        performedByName: gate.actor?.name ?? null,
        occurredAt: now,
      });
    }

    const [updated] = await db.select().from(oemRegistry).where(eq(oemRegistry.id, vendor.id)).limit(1);
    return NextResponse.json(updated);
  } catch (error) {
    console.error("Failed to update OEM vendor:", error);
    return NextResponse.json({ error: "Failed to update OEM vendor" }, { status: 500 });
  }
}
