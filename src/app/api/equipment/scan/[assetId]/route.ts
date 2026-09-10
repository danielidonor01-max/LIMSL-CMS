// src/app/api/equipment/scan/[assetId]/route.ts
// The machine passport behind a QR sticker. Readable without an account.
//
// The point of the sticker is that somebody standing at a machine, who may not
// work here and almost certainly is not logged in on their own phone, can find
// out in one scan whether the thing is safe to touch. Putting a login wall in
// front of that answer defeats the sticker.
//
// So this route is deliberately public, and just as deliberately thin. Two
// separate questions decide what it returns:
//
//   Does somebody standing at the machine need this to stay safe?  -> public
//   Is it a fact about the business?                               -> signed in
//
// Asset IDs run in sequence, so anything public here can be walked from
// LEE/PE/0001 upward by anyone who scans one sticker. That rules out the serial
// number, the OEM and model, the commissioning date, the maintenance history
// and the criticality: an enumerable public register of every machine LIMSL
// owns, its make and its condition, is not a safety feature. The signed-in
// payload carries all of it, one fetch later.
//
// Live permit DESCRIPTIONS are withheld for the same reason. That a permit is
// active is a safety fact and is public; what the job is, and when it expires,
// is a map of the week's operations and is not.
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { equipment, permits, emergencyContacts } from "@/lib/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { EQUIPMENT_CATEGORY_LABELS, EQUIPMENT_STATUS_LABELS } from "@/lib/constants";
import { ppeForCategory } from "@/lib/hse/category-ppe";
// Which kinds a stranger at a machine may need, held with the labels rather
// than copied here. Ordered by the column that exists to order them, so the
// fire service cannot sort below a stationery supplier.
import { PUBLIC_CONTACT_KINDS } from "@/lib/hse/emergency-contact-kinds";



export async function GET(
  _request: Request,
  { params }: { params: Promise<{ assetId: string }> },
) {
  const { assetId } = await params;
  const assetIdOriginal = assetId.replace(/-/g, "/");

  try {
    const [eq_] = await db
      .select()
      .from(equipment)
      .where(eq(equipment.assetId, assetIdOriginal))
      .limit(1);

    if (!eq_) return NextResponse.json({ error: "Equipment not found" }, { status: 404 });

    const active = await db
      .select({ id: permits.id, lotoApplied: permits.lotoApplied })
      .from(permits)
      .where(and(eq(permits.equipmentId, eq_.id), eq(permits.status, "ACTIVE")));

    const hasLoto = active.some((p) => p.lotoApplied);
    const isSafeToOperate =
      eq_.status === "OPERATIONAL" && !hasLoto && active.length === 0;

    // Real contacts only. An emergency list that invents a number when the
    // table is empty is worse than an empty one, because the empty one is
    // obviously unfinished and the invented one is discovered by whoever dials
    // it, which on this page is somebody dealing with an emergency.
    const contacts = (
      await db
        .select({
          name: emergencyContacts.name,
          organisation: emergencyContacts.organisation,
          kind: emergencyContacts.kind,
          phone: emergencyContacts.phone,
        })
        .from(emergencyContacts)
        .orderBy(asc(emergencyContacts.displayOrder), asc(emergencyContacts.name))
    )
      .filter((c) => PUBLIC_CONTACT_KINDS.includes(c.kind))
      .slice(0, 4);

    // Signed in, the passport becomes the record. Same URL, more of it, which
    // is what makes "sign in for the full details" an honest offer rather than
    // a link to a login form.
    const session = await auth();
    const signedIn = !!session?.user;

    return NextResponse.json({
      signedIn,
      // ── Public: what keeps somebody standing here safe ──
      equipment: {
        id: eq_.id,
        assetId: eq_.assetId,
        name: eq_.name,
        category: eq_.category,
        categoryLabel: EQUIPMENT_CATEGORY_LABELS[eq_.category] ?? eq_.category,
        location: eq_.location,
        bay: eq_.bay,
        status: eq_.status,
        statusLabel: EQUIPMENT_STATUS_LABELS[eq_.status] ?? eq_.status,
      },
      safety: {
        isSafeToOperate,
        hasLoto,
        activePermitCount: active.length,
        recommendedPPE: ppeForCategory(eq_.category),
      },
      contacts,
      // ── Signed in only ──
      details: signedIn
        ? {
            oem: eq_.oem,
            model: eq_.model,
            serialNumber: eq_.serialNumber,
            subCategory: eq_.subCategory,
            criticality: eq_.criticality,
            commissioningDate: eq_.commissioningDate,
            lastMaintenanceDate: eq_.lastMaintenanceDate,
            nextMaintenanceDate: eq_.nextMaintenanceDate,
            maintenanceFrequency: eq_.maintenanceFrequency,
            requiresCalibration: eq_.requiresCalibration,
          }
        : null,
    });
  } catch (error) {
    console.error("Machine passport lookup failed:", error);
    return NextResponse.json({ error: "Could not load this machine" }, { status: 500 });
  }
}
