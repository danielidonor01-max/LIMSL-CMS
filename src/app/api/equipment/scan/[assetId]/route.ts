// src/app/api/equipment/scan/[assetId]/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { equipment, permits, emergencyContacts } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ assetId: string }> }
) {
  try {
    const resolvedParams = await params;
    const assetIdKey = resolvedParams.assetId; // E.g., LEE-PE-1904
    const assetIdOriginal = assetIdKey.replace(/-/g, "/"); // Convert to LEE/PE/1904

    // 1. Fetch equipment record
    const [eqRecord] = await db
      .select({
        id: equipment.id,
        assetId: equipment.assetId,
        name: equipment.name,
        category: equipment.category,
        subCategory: equipment.subCategory,
        location: equipment.location,
        bay: equipment.bay,
        oem: equipment.oem,
        model: equipment.model,
        serialNumber: equipment.serialNumber,
        status: equipment.status,
        criticality: equipment.criticality,
        commissioningDate: equipment.commissioningDate,
        lastMaintenanceDate: equipment.lastMaintenanceDate,
        nextMaintenanceDate: equipment.nextMaintenanceDate,
        maintenanceFrequency: equipment.maintenanceFrequency,
        requiresCalibration: equipment.requiresCalibration,
        requiresPremob: equipment.requiresPremob,
      })
      .from(equipment)
      .where(eq(equipment.assetId, assetIdOriginal))
      .limit(1);

    if (!eqRecord) {
      return NextResponse.json({ error: "Equipment not found" }, { status: 404 });
    }

    // 2. Fetch active safety permits & LOTO status
    let activePermitsList: Array<{
      permitNumber: string;
      workDescription: string;
      lotoApplied: boolean | null;
      expiryDate: string | null;
    }> = [];

    try {
      const ptwRecords = await db
        .select({
          permitNumber: permits.permitNumber,
          workDescription: permits.workDescription,
          lotoApplied: permits.lotoApplied,
          expiryDate: permits.expiryDate,
        })
        .from(permits)
        .where(
          and(
            eq(permits.equipmentId, eqRecord.id),
            eq(permits.status, "ACTIVE")
          )
        );
      activePermitsList = ptwRecords;
    } catch (permitsErr) {
      console.warn("Could not query active permits for scan:", permitsErr);
    }

    // 3. Fetch workshop emergency contacts
    let contactsList: Array<{
      name: string;
      role: string;
      phone: string;
    }> = [];

    try {
      const contacts = await db
        .select({
          name: emergencyContacts.name,
          organisation: emergencyContacts.organisation,
          kind: emergencyContacts.kind,
          phone: emergencyContacts.phone,
        })
        .from(emergencyContacts)
        .limit(2);
      contactsList = contacts.map((c) => ({
        name: c.name,
        role: c.organisation ? `${c.kind} · ${c.organisation}` : `${c.kind} Emergency Contact`,
        phone: c.phone,
      }));
    } catch {
      // Fallback defaults if emergencyContacts table is empty
    }

    if (contactsList.length === 0) {
      contactsList = [
        { name: "LIMSL HSE Control Desk", role: "Safety & Emergency Response", phone: "+234 800 54675 473" },
        { name: "Maintenance Workshop Lead", role: "Engineering & Plant Operations", phone: "+234 803 123 4567" },
      ];
    }

    // Determine LOTO and operational safety
    const hasLoto = activePermitsList.some((p) => p.lotoApplied);
    const isUnderMaintenance =
      eqRecord.status === "UNDER_MAINTENANCE" ||
      eqRecord.status === "BROKEN_DOWN" ||
      activePermitsList.length > 0;

    const isSafeToOperate =
      eqRecord.status === "OPERATIONAL" && !hasLoto && activePermitsList.length === 0;

    // Standard PPE derived from machine category (ISO 45001 standard)
    const categoryPPE: Record<string, string[]> = {
      CNC_HEAVY: ["Safety Helmet", "Safety Glasses / Face Shield", "Steel-Toe Boots", "Hearing Protection"],
      CNC_LIGHT: ["Safety Glasses", "Steel-Toe Boots", "Hearing Protection"],
      WELDING: ["Welding Helmet / Visor", "Leather Welding Gauntlets", "Fire-Retardant Coverall", "Steel-Toe Boots", "Fume Mask"],
      CRANE: ["Safety Helmet", "Hi-Vis Vest", "Steel-Toe Boots", "Gloves"],
      PRESS_ROLL_SHEAR: ["Safety Helmet", "Cut-Resistant Gloves", "Steel-Toe Boots", "Eye Protection"],
      COMPRESSOR: ["Hearing Protection", "Safety Glasses", "Steel-Toe Boots"],
      ELECTRICAL_PANEL: ["Insulated Gloves (1000V)", "Arc-Flash Visor", "Safety Boots"],
    };

    const recommendedPPE =
      categoryPPE[eqRecord.category] || [
        "Safety Helmet",
        "Steel-Toe Safety Boots",
        "Eye Protection",
        "High-Visibility Vest",
      ];

    return NextResponse.json({
      equipment: eqRecord,
      safety: {
        isSafeToOperate,
        hasLoto,
        activePermitCount: activePermitsList.length,
        activePermits: activePermitsList,
        recommendedPPE,
      },
      emergencyContacts: contactsList,
      scannedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Public scan API error:", error);
    return NextResponse.json({ error: "Failed to fetch scan data" }, { status: 500 });
  }
}
