// src/app/api/equipment/[assetId]/removal/route.ts
// Taking an asset off the register (POST), and destroying one (DELETE).
//
// Two verbs because they are two different acts, not two settings of one.
// The reasoning lives in @/lib/equipment/removal and is tested there; this
// route establishes who is asking, counts what would be orphaned, and writes.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  equipment,
  workOrders,
  pmChecklists,
  correctiveMaintenance,
  permits,
  jhaDocuments,
  calibrationRecords,
  nonConformities,
  safetyIncidents,
  maintenanceSchedule,
  equipmentLog,
  equipmentDocuments,
  meterReadings,
  spareParts,
  auditLog,
} from "@/lib/db/schema";
import { and, eq, or, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireRoles } from "@/lib/authz";
import { MAINTENANCE_WRITE_ROLES, isSuperAdmin } from "@/lib/roles";
import { logEquipmentEvent } from "@/lib/equipment-log";
import {
  canRetire,
  canPurge,
  describeReferences,
  removalReasonLabel,
  type ReferenceCount,
} from "@/lib/equipment/removal";

async function findAsset(assetIdKey: string) {
  const slashForm = assetIdKey.replace(/-/g, "/");
  const [row] = await db
    .select()
    .from(equipment)
    .where(
      or(
        eq(equipment.assetId, slashForm),
        eq(equipment.assetId, assetIdKey),
        eq(equipment.id, assetIdKey),
      ),
    )
    .limit(1);
  return row ?? null;
}

// Every table that would be orphaned. The labels are what the refusal message
// reads out, so they are written the way somebody would say them rather than
// the way the table is named.
async function countReferences(equipmentId: string): Promise<ReferenceCount[]> {
  const tally = async (label: string, table: any, column: any): Promise<ReferenceCount> => {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(table)
      .where(eq(column, equipmentId));
    return { label, count: Number(row?.n ?? 0) };
  };

  return Promise.all([
    tally("work orders", workOrders, workOrders.equipmentId),
    tally("PM checklists", pmChecklists, pmChecklists.equipmentId),
    tally("corrective records", correctiveMaintenance, correctiveMaintenance.equipmentId),
    tally("permits", permits, permits.equipmentId),
    tally("hazard analyses", jhaDocuments, jhaDocuments.equipmentId),
    tally("calibration records", calibrationRecords, calibrationRecords.equipmentId),
    tally("non-conformities", nonConformities, nonConformities.equipmentId),
    tally("safety incidents", safetyIncidents, safetyIncidents.equipmentId),
    tally("scheduled activities", maintenanceSchedule, maintenanceSchedule.equipmentId),
    tally("log entries", equipmentLog, equipmentLog.equipmentId),
    tally("documents", equipmentDocuments, equipmentDocuments.equipmentId),
    tally("meter readings", meterReadings, meterReadings.equipmentId),
    tally("spare parts", spareParts, spareParts.equipmentId),
  ]);
}

/** Take the asset off the register. Keeps everything. */
export async function POST(request: Request, { params }: { params: Promise<{ assetId: string }> }) {
  try {
    const gate = await requireRoles(MAINTENANCE_WRITE_ROLES);
    if (gate.res) return gate.res;

    const { assetId } = await params;
    const body = await request.json();
    const asset = await findAsset(assetId);
    if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });

    const decision = canRetire({
      reason: body.reason,
      note: body.note,
      alreadyRemoved: !!asset.removedAt,
    });
    if (!decision.ok) return NextResponse.json({ error: decision.error }, { status: 400 });

    const now = new Date().toISOString();
    await db
      .update(equipment)
      .set({
        removedAt: now,
        removedReason: String(body.reason),
        removedNote: typeof body.note === "string" ? body.note.slice(0, 500) : null,
        removedById: gate.actor?.id ?? null,
        removedByName: gate.actor?.name ?? null,
        updatedAt: now,
      })
      .where(eq(equipment.id, asset.id));

    // On the machine's own history, because that is where somebody looking for
    // it will go, and in the audit log, because that is where a reviewer goes.
    await logEquipmentEvent({
      equipmentId: asset.id,
      category: "TRANSFER",
      title: `Removed from the register: ${removalReasonLabel(String(body.reason))}`,
      detail: typeof body.note === "string" && body.note.trim() ? body.note.trim() : undefined,
      source: "MANUAL",
      performedById: gate.actor?.id ?? null,
      performedByName: gate.actor?.name ?? null,
    }).catch((err) => console.warn("equipment log failed on removal", err));

    await db.insert(auditLog).values({
      id: nanoid(),
      userId: gate.actor?.id ?? null,
      userName: gate.actor?.name ?? null,
      action: "UPDATE",
      entityType: "equipment",
      entityId: asset.id,
      entityDescription: `${asset.assetId} ${asset.name} removed from the register (${removalReasonLabel(String(body.reason))})`,
    });

    return NextResponse.json({ ok: true, removedAt: now });
  } catch (error) {
    console.error("Failed to remove asset from register:", error);
    return NextResponse.json({ error: "Failed to remove the asset" }, { status: 500 });
  }
}

/** Destroy the asset. Only ever allowed when nothing references it. */
export async function DELETE(request: Request, { params }: { params: Promise<{ assetId: string }> }) {
  try {
    // Gated twice over: the route needs a maintenance writer to reach it at
    // all, and canPurge then requires Super Admin on top.
    const gate = await requireRoles(MAINTENANCE_WRITE_ROLES);
    if (gate.res) return gate.res;

    const { assetId } = await params;
    const body = await request.json().catch(() => ({}));
    const asset = await findAsset(assetId);
    if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });

    // The phrase is an environment variable, not a constant in the source.
    // A destructive password committed to the repository is in its history for
    // good and is known to everybody who can read it, including anybody the
    // repository is ever shared with.
    const configured = process.env.ASSET_PURGE_PASSWORD ?? "";
    const references = await countReferences(asset.id);

    const decision = canPurge({
      isSuperAdmin: isSuperAdmin(gate.actor?.role),
      passwordConfigured: configured.length > 0,
      passwordOk: configured.length > 0 && String(body.password ?? "") === configured,
      references,
    });
    if (!decision.ok) {
      return NextResponse.json(
        { error: decision.error, references: references.filter((r) => r.count > 0) },
        { status: 409 },
      );
    }

    // Written BEFORE the delete. Afterwards there is no asset to describe, and
    // the one record that proves this happened must not depend on the row it is
    // about still existing.
    await db.insert(auditLog).values({
      id: nanoid(),
      userId: gate.actor?.id ?? null,
      userName: gate.actor?.name ?? null,
      action: "DELETE",
      entityType: "equipment",
      entityId: asset.id,
      entityDescription:
        `${asset.assetId} ${asset.name} permanently deleted. ` +
        `Held ${describeReferences(references)} at the time of deletion.`,
    });

    await db.delete(equipment).where(eq(equipment.id, asset.id));

    return NextResponse.json({ ok: true, deleted: asset.assetId });
  } catch (error) {
    console.error("Failed to delete asset:", error);
    return NextResponse.json(
      {
        error:
          "Could not delete the asset. Something still references it that this check did not count.",
      },
      { status: 500 },
    );
  }
}

/** Put an asset back on the register. */
export async function PATCH(request: Request, { params }: { params: Promise<{ assetId: string }> }) {
  try {
    const gate = await requireRoles(MAINTENANCE_WRITE_ROLES);
    if (gate.res) return gate.res;

    const { assetId } = await params;
    const asset = await findAsset(assetId);
    if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    if (!asset.removedAt) {
      return NextResponse.json({ error: "This asset is already on the register." }, { status: 400 });
    }

    const now = new Date().toISOString();
    await db
      .update(equipment)
      .set({
        removedAt: null,
        removedReason: null,
        removedNote: null,
        removedById: null,
        removedByName: null,
        updatedAt: now,
      })
      .where(eq(equipment.id, asset.id));

    await logEquipmentEvent({
      equipmentId: asset.id,
      category: "TRANSFER",
      title: "Put back on the register",
      source: "MANUAL",
      performedById: gate.actor?.id ?? null,
      performedByName: gate.actor?.name ?? null,
    }).catch((err) => console.warn("equipment log failed on restore", err));

    await db.insert(auditLog).values({
      id: nanoid(),
      userId: gate.actor?.id ?? null,
      userName: gate.actor?.name ?? null,
      action: "UPDATE",
      entityType: "equipment",
      entityId: asset.id,
      entityDescription: `${asset.assetId} ${asset.name} put back on the register`,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to restore asset:", error);
    return NextResponse.json({ error: "Failed to restore the asset" }, { status: 500 });
  }
}
