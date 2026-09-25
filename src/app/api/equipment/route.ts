// src/app/api/equipment/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { equipment, auditLog } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireRoles } from "@/lib/authz";
import { syncPlanForEquipment } from "@/lib/maintenance/plan-sync";
import { getCategory, listCategories } from "@/lib/maintenance/asset-categories";
import { MAINTENANCE_WRITE_ROLES } from "@/lib/roles";
import { suggestedPmFrequency } from "@/lib/maintenance/adherence";
import { normaliseAssetId } from "@/lib/asset-id";

// Which interval a machine in this category is serviced on.
//
// Once categories are managed — the table has rows — an unknown category is
// refused: a new category is proposed and signed off in Settings, not invented
// by typing it into an asset form. Before the table exists (a deployment that
// has not run apply-asset-categories yet) the old behaviour stands, so the
// register keeps working while the migration catches up.
async function resolveCategory(code: unknown): Promise<
  { ok: true; frequency: string | null } | { ok: false; error: string }
> {
  const c = String(code ?? "");
  if (!c) return { ok: false, error: "Choose the category this machine belongs to." };
  try {
    const cat = await getCategory(c);
    if (cat) return { ok: true, frequency: cat.maintenanceFrequency };
    const managed = (await listCategories()).length > 0;
    if (managed) {
      return {
        ok: false,
        error:
          "That category is not on the register. New categories are added in Settings, where " +
          "the Maintenance Manager and QA/QC Supervisor sign them off with their interval.",
      };
    }
  } catch {
    // The categories table does not exist here yet. Fall through.
  }
  return { ok: true, frequency: null };
}

export async function GET() {
  try {
    const list = await db.select().from(equipment);
    return NextResponse.json(list);
  } catch (error: any) {
    console.error("Failed to fetch equipment:", error);
    return NextResponse.json({ error: "Failed to fetch equipment" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const gate = await requireRoles(MAINTENANCE_WRITE_ROLES);
    if (gate.res) return gate.res;

    const body = await request.json();

    const name = String(body.name ?? "").trim();
    if (!name) return NextResponse.json({ error: "An equipment name is required." }, { status: 400 });

    // Canonicalise before the uniqueness check, so "lee/pe/7" and "LEE/PE/0007"
    // cannot enter the register as two different assets.
    const id = normaliseAssetId(String(body.assetId ?? ""));
    if (!id.ok) return NextResponse.json({ error: id.error }, { status: 400 });

    const [clash] = await db
      .select({ name: equipment.name })
      .from(equipment)
      .where(eq(equipment.assetId, id.assetId))
      .limit(1);
    if (clash) {
      return NextResponse.json(
        { error: `${id.assetId} is already the asset ID for "${clash.name}". Generate the next free code.` },
        { status: 409 },
      );
    }

    // The interval comes from the category, not from the form. Two identical
    // machines on different regimes is exactly what categories exist to stop.
    const resolved = await resolveCategory(body.category);
    if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: 400 });

    const newAsset = {
      id: nanoid(),
      assetId: id.assetId,
      name,
      category: body.category,
      location: body.location || "Workshop",
      bay: body.bay || null,
      oem: body.oem || "",
      model: body.model || "",
      serialNumber: body.serialNumber || "",
      commissioningDate: body.commissioningDate || "",
      status: body.status || "OPERATIONAL",
      // The old literal "Quarterly" matched none of the uppercase frequency
      // keys the adherence window and recurrence tables use.
      maintenanceFrequency: resolved.frequency ?? body.maintenanceFrequency ?? suggestedPmFrequency(body.criticality),
      criticality: body.criticality || "MEDIUM",
      notes: body.notes || null,
    };

    await db.insert(equipment).values(newAsset);

    await db.insert(auditLog).values({
      id: nanoid(),
      userId: gate.actor?.id ?? null,
      userName: gate.actor?.name || "System",
      action: "CREATE",
      entityType: "equipment",
      entityId: newAsset.id,
      entityDescription: `${newAsset.assetId} · ${newAsset.name} added to the asset register`,
    });

    // A machine on the register that is not on the plan is a machine nobody
    // is going to service. The register already records the interval, so the
    // plan follows from it — including for a category nothing has used before.
    // Best-effort: a plan that could not be written must not lose the asset.
    let planned = { added: 0, dates: [] as string[] };
    try {
      planned = await syncPlanForEquipment(newAsset, { actor: gate.actor });
    } catch (err) {
      console.warn("equipment create: could not seed the maintenance plan", err);
    }

    return NextResponse.json({ ...newAsset, planned }, { status: 201 });
  } catch (error: any) {
    console.error("Failed to create equipment:", error);
    return NextResponse.json({ error: "Failed to create equipment" }, { status: 500 });
  }
}
