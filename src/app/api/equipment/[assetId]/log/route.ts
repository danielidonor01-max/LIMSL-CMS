// src/app/api/equipment/[assetId]/log/route.ts
//   GET  → unified machine timeline (explicit log entries + derived events)
//   POST → add a manual log entry (accident, transfer, note, …)
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { equipment } from "@/lib/db/schema";
import { eq, or } from "drizzle-orm";
import { requireRoles } from "@/lib/authz";
import { MAINTENANCE_WRITE_ROLES } from "@/lib/roles";
import { buildTimeline, logEquipmentEvent, type LogCategory } from "@/lib/equipment-log";

const MANUAL_CATEGORIES = new Set<LogCategory>(["ACCIDENT", "TRANSFER", "NOTE", "INSPECTION", "STATUS", "CALIBRATION", "OTHER"]);

async function resolveEquipment(assetId: string) {
  const slash = assetId.replace(/-/g, "/");
  const [e] = await db
    .select()
    .from(equipment)
    .where(or(eq(equipment.assetId, slash), eq(equipment.assetId, assetId)))
    .limit(1);
  return e;
}

export async function GET(_request: Request, { params }: { params: Promise<{ assetId: string }> }) {
  try {
    const { assetId } = await params;
    const e = await resolveEquipment(assetId);
    if (!e) return NextResponse.json({ error: "Equipment not found" }, { status: 404 });
    return NextResponse.json({ events: await buildTimeline(e.id) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to build timeline:", error);
    return NextResponse.json({ error: "Failed to load history", details: message }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ assetId: string }> }) {
  try {
    const gate = await requireRoles(MAINTENANCE_WRITE_ROLES);
    if (gate.res) return gate.res;

    const { assetId } = await params;
    const e = await resolveEquipment(assetId);
    if (!e) return NextResponse.json({ error: "Equipment not found" }, { status: 404 });

    const body = await request.json();
    const category = String(body.category || "") as LogCategory;
    if (!MANUAL_CATEGORIES.has(category)) {
      return NextResponse.json({ error: "Invalid log category for a manual entry." }, { status: 400 });
    }
    const title = String(body.title || "").trim();
    if (!title) return NextResponse.json({ error: "A title is required." }, { status: 400 });

    // A TRANSFER records the new location on the asset too (single source of truth).
    if (category === "TRANSFER" && body.newLocation) {
      await db
        .update(equipment)
        .set({ location: String(body.newLocation).slice(0, 120), updatedAt: new Date().toISOString() })
        .where(eq(equipment.id, e.id));
    }

    const id = await logEquipmentEvent({
      equipmentId: e.id,
      category,
      title,
      detail: body.detail ? String(body.detail) : null,
      source: "MANUAL",
      performedById: gate.actor?.id ?? null,
      performedByName: gate.actor?.name ?? null,
      occurredAt: body.occurredAt ? String(body.occurredAt) : new Date().toISOString(),
      metadata: category === "TRANSFER" && body.newLocation ? { newLocation: body.newLocation } : undefined,
    });

    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to add log entry:", error);
    return NextResponse.json({ error: "Failed to add log entry", details: message }, { status: 500 });
  }
}
