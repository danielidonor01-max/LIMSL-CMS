// src/app/api/admin/facility-assets/route.ts
// Loads the 19 office AC units and 4 calibrated instruments into the register,
// run by a Super Admin from Settings.
//
// Sits beside db-maintenance rather than inside it on purpose. That route's
// contract is that it only ever creates missing schema and never touches data,
// which is what makes it safe to press after every deployment. This one writes
// 23 asset records, so it is a separate, separately-labelled action.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { nanoid } from "nanoid";
import { auditLog } from "@/lib/db/schema";
import { requireRoles } from "@/lib/authz";
import { SETTINGS_WRITE_ROLES } from "@/lib/roles";
import { loadFacilityAssets } from "@/lib/facility-assets-load";

export async function POST() {
  const gate = await requireRoles(SETTINGS_WRITE_ROLES);
  if (gate.res) return gate.res;

  try {
    const result = await loadFacilityAssets();

    await db.insert(auditLog).values({
      id: nanoid(),
      userId: gate.actor?.id ?? null,
      userName: gate.actor?.name ?? "Admin",
      action: "IMPORT",
      entityType: "equipment",
      entityId: "facility-assets",
      entityDescription: `Office AC units and calibrated instruments loaded: ${result.created} created, ${result.updated} updated`,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("Facility asset load failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Load failed" },
      { status: 500 },
    );
  }
}
