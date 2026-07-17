// src/app/api/equipment/[assetId]/diagnose/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  equipment,
  diagnosticGuides,
  componentRegistry,
  schematicDiagrams,
  equipmentDocuments,
  correctiveMaintenance,
} from "@/lib/db/schema";
import { eq, or, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { diagnose } from "@/lib/diagnostics/engine";
import { requireRoles } from "@/lib/authz";
import { MAINTENANCE_WRITE_ROLES } from "@/lib/roles";

async function resolveEquipment(assetId: string) {
  const slash = assetId.replace(/-/g, "/");
  const [e] = await db
    .select()
    .from(equipment)
    .where(or(eq(equipment.assetId, slash), eq(equipment.assetId, assetId)))
    .limit(1);
  return e;
}

// GET /api/equipment/[assetId]/diagnose?symptom=...
// Returns the ranked diagnosis plus the schematics/components to consult.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ assetId: string }> },
) {
  try {
    const { assetId } = await params;
    const symptom = new URL(request.url).searchParams.get("symptom") || "";
    const e = await resolveEquipment(assetId);
    if (!e) return NextResponse.json({ error: "Equipment not found" }, { status: 404 });

    const guides = await db.select().from(diagnosticGuides).where(eq(diagnosticGuides.equipmentId, e.id));
    const components = await db.select().from(componentRegistry).where(eq(componentRegistry.equipmentId, e.id));

    // Schematics: dedicated diagrams + electrical-schematic documents
    const diagrams = await db.select().from(schematicDiagrams).where(eq(schematicDiagrams.equipmentId, e.id));
    const schematicDocs = (
      await db.select().from(equipmentDocuments).where(eq(equipmentDocuments.equipmentId, e.id))
    ).filter((d) => d.docType === "ELECTRICAL_SCHEMATIC" || d.docType === "OPERATIONAL_MANUAL");
    const schematics = [
      ...diagrams.map((s) => ({ id: s.id, title: s.title, type: s.type, sheet: s.sheetNumber, fileUrl: s.fileUrl })),
      ...schematicDocs.map((d) => ({ id: d.id, title: d.title, type: d.docType, sheet: d.revision, fileUrl: d.fileUrl })),
    ];

    // History: this machine + same-category machines (cross-machine learning)
    const sameCategory = await db
      .select({ id: equipment.id })
      .from(equipment)
      .where(eq(equipment.category, e.category));
    const ids = sameCategory.map((r) => r.id);
    const history = ids.length
      ? await db.select().from(correctiveMaintenance).where(inArray(correctiveMaintenance.equipmentId, ids))
      : [];

    const diagnoses = symptom.trim().length >= 2 ? diagnose(symptom, guides, history, components) : [];

    return NextResponse.json({
      equipment: { id: e.id, name: e.name, assetId: e.assetId, category: e.category, status: e.status },
      symptom,
      diagnoses,
      schematics,
      components,
      knownSymptoms: guides.map((g) => ({ id: g.id, symptom: g.symptom, errorCode: g.errorCode })),
      historyCount: history.filter((h) => h.status === "CLOSED").length,
      guideCount: guides.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Diagnose failed:", error);
    return NextResponse.json({ error: "Diagnose failed", details: message }, { status: 500 });
  }
}

// POST /api/equipment/[assetId]/diagnose  → record outcome / learn
// body: { symptom, resolved, matchedGuideId?, probableCause?, resolutionAction?,
//         componentTag?, errorCode?, diagnosticSteps? }
export async function POST(
  request: Request,
  { params }: { params: Promise<{ assetId: string }> },
) {
  try {
    const gate = await requireRoles(MAINTENANCE_WRITE_ROLES);
    if (gate.res) return gate.res;

    const { assetId } = await params;
    const e = await resolveEquipment(assetId);
    if (!e) return NextResponse.json({ error: "Equipment not found" }, { status: 404 });
    const body = await request.json();

    // Reinforce an existing guide
    if (body.matchedGuideId) {
      const [g] = await db
        .select()
        .from(diagnosticGuides)
        .where(eq(diagnosticGuides.id, body.matchedGuideId))
        .limit(1);
      if (g) {
        await db
          .update(diagnosticGuides)
          .set({ successCount: (g.successCount ?? 0) + (body.resolved ? 1 : 0) })
          .where(eq(diagnosticGuides.id, g.id));
        return NextResponse.json({ learned: "reinforced", guideId: g.id, successCount: (g.successCount ?? 0) + 1 });
      }
    }

    // Learn a new guide from a resolved, previously-unknown fault
    if (body.resolved && body.probableCause && body.symptom) {
      const newGuide = {
        id: nanoid(),
        equipmentId: e.id,
        symptom: String(body.symptom).slice(0, 200),
        errorCode: body.errorCode || "",
        componentTag: body.componentTag || "",
        probableCause: body.probableCause,
        diagnosticSteps: JSON.stringify(body.diagnosticSteps || []),
        resolutionAction: body.resolutionAction || "",
        successCount: 1,
      };
      await db.insert(diagnosticGuides).values(newGuide);
      return NextResponse.json({ learned: "created", guideId: newGuide.id }, { status: 201 });
    }

    return NextResponse.json({ learned: "none" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Learning failed:", error);
    return NextResponse.json({ error: "Learning failed", details: message }, { status: 500 });
  }
}
