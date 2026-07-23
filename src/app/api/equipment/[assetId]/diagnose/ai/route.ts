// src/app/api/equipment/[assetId]/diagnose/ai/route.ts
// Guardrailed AI analysis (Gemini) on top of the deterministic engine.
// Role-gated (consumes provider quota), rate-limited per user, audit-logged.
// Fails closed: any provider/validation problem returns an error and the UI
// keeps showing deterministic results only.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { equipment, auditLog } from "@/lib/db/schema";
import { and, eq, gte, or } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireRoles } from "@/lib/authz";
import { MAINTENANCE_WRITE_ROLES } from "@/lib/roles";
import { aiDiagnose } from "@/lib/diagnostics/ai-assist";
import { GeminiError } from "@/lib/diagnostics/gemini";

const HOURLY_LIMIT = Number(process.env.AI_DIAGNOSE_HOURLY_LIMIT || 10);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ assetId: string }> },
) {
  try {
    const gate = await requireRoles(MAINTENANCE_WRITE_ROLES);
    if (gate.res) return gate.res;

    const { assetId } = await params;
    const slash = assetId.replace(/-/g, "/");
    const [e] = await db
      .select()
      .from(equipment)
      .where(or(eq(equipment.assetId, slash), eq(equipment.assetId, assetId)))
      .limit(1);
    if (!e) return NextResponse.json({ error: "Equipment not found" }, { status: 404 });

    const body = await request.json();
    const symptom = String(body.symptom || "").trim();
    if (symptom.length < 3) return NextResponse.json({ error: "Describe the symptom first." }, { status: 400 });

    // Per-user hourly rate limit, counted from the audit trail (serverless-safe).
    if (gate.actor?.id) {
      const hourAgo = new Date(Date.now() - 3600_000).toISOString();
      const recent = await db
        .select({ id: auditLog.id })
        .from(auditLog)
        .where(
          and(
            eq(auditLog.userId, gate.actor.id),
            eq(auditLog.action, "AI_DIAGNOSE"),
            gte(auditLog.timestamp, hourAgo),
          ),
        );
      if (recent.length >= HOURLY_LIMIT) {
        return NextResponse.json(
          { error: `AI analysis limit reached (${HOURLY_LIMIT}/hour). The deterministic engine remains available.` },
          { status: 429 },
        );
      }
    }

    const result = await aiDiagnose(
      { id: e.id, name: e.name, assetId: e.assetId, category: e.category },
      symptom,
    );

    await db.insert(auditLog).values({
      id: nanoid(),
      userId: gate.actor?.id ?? null,
      userName: gate.actor?.name || "Technician",
      action: "AI_DIAGNOSE",
      entityType: "equipment",
      entityId: e.id,
      entityDescription: `AI analysis (${result.model}) — "${symptom.slice(0, 80)}" · ${result.usage.inputTokens}in/${result.usage.outputTokens}out tokens · ${result.diagnoses.length} diagnoses from ${result.evidenceCount} evidence items`,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof GeminiError) {
      return NextResponse.json({ error: error.message }, { status: error.retryable ? 429 : 502 });
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("AI diagnose failed:", error);
    return NextResponse.json({ error: "AI analysis failed", details: message }, { status: 500 });
  }
}
