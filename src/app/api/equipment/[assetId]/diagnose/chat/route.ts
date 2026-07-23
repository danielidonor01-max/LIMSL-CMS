// src/app/api/equipment/[assetId]/diagnose/chat/route.ts
// Chat-style, guardrailed AI diagnosis (Gemini). The technician works the fault
// turn by turn; each turn is grounded in the same evidence pack as the one-shot
// path. A session is only opened — and a DIAGNOSIS entry only written to the
// machine history log — when the technician explicitly starts the AI chat
// ("log this and proceed"); the deterministic search alone never logs.
//   GET  ?session=<id>  → load a session transcript (resume / deep-link)
//   POST { action: "start" | "message" | "resolve" | "abandon", ... }
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { equipment, diagnosisSessions, equipmentLog, auditLog } from "@/lib/db/schema";
import { and, eq, gte, or } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireRoles } from "@/lib/authz";
import { MAINTENANCE_WRITE_ROLES } from "@/lib/roles";
import { aiChatTurn, type ChatMessage } from "@/lib/diagnostics/ai-assist";
import { logEquipmentEvent } from "@/lib/equipment-log";
import { GeminiError, type GeminiImage } from "@/lib/diagnostics/gemini";

const HOURLY_LIMIT = Number(process.env.AI_CHAT_HOURLY_LIMIT || 40);
const MAX_IMAGES = 3;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // ~4MB per image (base64-decoded estimate)
const ALLOWED_MIME = /^image\/(png|jpe?g|webp|heic|heif)$/i;

async function resolveEquipment(assetId: string) {
  const slash = assetId.replace(/-/g, "/");
  const [e] = await db
    .select()
    .from(equipment)
    .where(or(eq(equipment.assetId, slash), eq(equipment.assetId, assetId)))
    .limit(1);
  return e;
}

function parseMessages(raw: string): ChatMessage[] {
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as ChatMessage[]) : [];
  } catch {
    return [];
  }
}

// Accept the client's image payload, rejecting anything oversized or non-image.
function sanitizeImages(input: unknown): GeminiImage[] {
  if (!Array.isArray(input)) return [];
  const out: GeminiImage[] = [];
  for (const img of input.slice(0, MAX_IMAGES)) {
    const mimeType = String(img?.mimeType || "");
    const dataBase64 = String(img?.dataBase64 || "");
    if (!ALLOWED_MIME.test(mimeType) || !dataBase64) continue;
    if (dataBase64.length * 0.75 > MAX_IMAGE_BYTES) continue;
    out.push({ mimeType, dataBase64 });
  }
  return out;
}

export async function GET(request: Request, { params }: { params: Promise<{ assetId: string }> }) {
  try {
    const gate = await requireRoles(MAINTENANCE_WRITE_ROLES);
    if (gate.res) return gate.res;
    const { assetId } = await params;
    const e = await resolveEquipment(assetId);
    if (!e) return NextResponse.json({ error: "Equipment not found" }, { status: 404 });

    const sessionId = new URL(request.url).searchParams.get("session");
    if (!sessionId) return NextResponse.json({ error: "session id required" }, { status: 400 });

    const [s] = await db.select().from(diagnosisSessions).where(eq(diagnosisSessions.id, sessionId)).limit(1);
    if (!s || s.equipmentId !== e.id) return NextResponse.json({ error: "Session not found" }, { status: 404 });

    return NextResponse.json({
      sessionId: s.id,
      symptom: s.symptom,
      status: s.status,
      resolvedCause: s.resolvedCause,
      messages: parseMessages(s.messages),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: "Failed to load session", details: message }, { status: 500 });
  }
}

async function underRateLimit(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return true;
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const recent = await db
    .select({ id: auditLog.id })
    .from(auditLog)
    .where(and(eq(auditLog.userId, userId), eq(auditLog.action, "AI_CHAT"), gte(auditLog.timestamp, hourAgo)));
  return recent.length < HOURLY_LIMIT;
}

export async function POST(request: Request, { params }: { params: Promise<{ assetId: string }> }) {
  try {
    const gate = await requireRoles(MAINTENANCE_WRITE_ROLES);
    if (gate.res) return gate.res;

    const { assetId } = await params;
    const e = await resolveEquipment(assetId);
    if (!e) return NextResponse.json({ error: "Equipment not found" }, { status: 404 });

    const body = await request.json();
    const action = String(body.action || "message");

    // ── Resolve / abandon: close the session, annotate the history entry ──────
    if (action === "resolve" || action === "abandon") {
      const [s] = await db.select().from(diagnosisSessions).where(eq(diagnosisSessions.id, String(body.sessionId))).limit(1);
      if (!s || s.equipmentId !== e.id) return NextResponse.json({ error: "Session not found" }, { status: 404 });

      const resolvedCause = action === "resolve" ? String(body.resolvedCause || "").trim() : null;
      const resolutionNote = body.resolutionNote ? String(body.resolutionNote).trim() : null;
      await db
        .update(diagnosisSessions)
        .set({
          status: action === "resolve" ? "RESOLVED" : "ABANDONED",
          resolvedCause,
          resolutionNote,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(diagnosisSessions.id, s.id));

      if (s.logId) {
        await db
          .update(equipmentLog)
          .set({
            title:
              action === "resolve"
                ? `AI diagnosis — resolved · "${s.symptom.slice(0, 100)}"`
                : `AI diagnosis — closed · "${s.symptom.slice(0, 100)}"`,
            detail:
              action === "resolve"
                ? `Root cause: ${resolvedCause}${resolutionNote ? ` — ${resolutionNote}` : ""}`
                : "Diagnosis session closed without a confirmed cause.",
          })
          .where(eq(equipmentLog.id, s.logId));
      }
      return NextResponse.json({ ok: true, status: action === "resolve" ? "RESOLVED" : "ABANDONED" });
    }

    if (!(await underRateLimit(gate.actor?.id))) {
      return NextResponse.json(
        { error: `AI chat limit reached (${HOURLY_LIMIT}/hour). The deterministic engine remains available.` },
        { status: 429 },
      );
    }

    const images = sanitizeImages(body.images);
    const now = new Date().toISOString();

    // ── Start: open the session and write the DIAGNOSIS log entry (the gate) ──
    if (action === "start") {
      const symptom = String(body.symptom || "").trim();
      if (symptom.length < 3) return NextResponse.json({ error: "Describe the symptom first." }, { status: 400 });

      const sessionId = nanoid();
      const logId = await logEquipmentEvent({
        equipmentId: e.id,
        category: "DIAGNOSIS",
        title: `AI diagnosis started · "${symptom.slice(0, 100)}"`,
        refType: "diagnosis_session",
        refId: sessionId,
        href: `/equipment/${assetId}/troubleshoot?session=${sessionId}`,
        source: "AUTO",
        performedById: gate.actor?.id ?? null,
        performedByName: gate.actor?.name ?? null,
        occurredAt: now,
      });

      const userTurn: ChatMessage = {
        role: "user",
        ts: now,
        text: symptom,
        imageCount: images.length || undefined,
      };
      const { turn, model, usage, evidenceCount } = await aiChatTurn({
        equipment: { id: e.id, name: e.name, assetId: e.assetId, category: e.category },
        symptom,
        history: [],
        userText: symptom,
        images,
      });

      const messages = [userTurn, turn];
      await db.insert(diagnosisSessions).values({
        id: sessionId,
        equipmentId: e.id,
        logId,
        symptom,
        status: "OPEN",
        messages: JSON.stringify(messages),
        startedById: gate.actor?.id ?? null,
        startedByName: gate.actor?.name ?? null,
      });

      await db.insert(auditLog).values({
        id: nanoid(),
        userId: gate.actor?.id ?? null,
        userName: gate.actor?.name || "Technician",
        action: "AI_CHAT",
        entityType: "diagnosis_session",
        entityId: sessionId,
        entityDescription: `AI diagnosis started (${model}) — "${symptom.slice(0, 80)}" · ${usage.inputTokens}in/${usage.outputTokens}out · ${evidenceCount} evidence items`,
      });

      return NextResponse.json({ sessionId, status: "OPEN", messages, model });
    }

    // ── Message: continue an open session ─────────────────────────────────────
    const sessionId = String(body.sessionId || "");
    const [s] = await db.select().from(diagnosisSessions).where(eq(diagnosisSessions.id, sessionId)).limit(1);
    if (!s || s.equipmentId !== e.id) return NextResponse.json({ error: "Session not found" }, { status: 404 });
    if (s.status !== "OPEN") return NextResponse.json({ error: "This diagnosis session is closed." }, { status: 409 });

    const text = String(body.message || "").trim();
    if (!text && images.length === 0) return NextResponse.json({ error: "Enter a message." }, { status: 400 });

    const history = parseMessages(s.messages);
    const userTurn: ChatMessage = { role: "user", ts: now, text: text || "(see attached photo)", imageCount: images.length || undefined };

    const { turn, model, usage, evidenceCount } = await aiChatTurn({
      equipment: { id: e.id, name: e.name, assetId: e.assetId, category: e.category },
      symptom: s.symptom,
      history,
      userText: userTurn.text,
      images,
    });

    const messages = [...history, userTurn, turn];
    await db
      .update(diagnosisSessions)
      .set({ messages: JSON.stringify(messages), updatedAt: now })
      .where(eq(diagnosisSessions.id, sessionId));

    await db.insert(auditLog).values({
      id: nanoid(),
      userId: gate.actor?.id ?? null,
      userName: gate.actor?.name || "Technician",
      action: "AI_CHAT",
      entityType: "diagnosis_session",
      entityId: sessionId,
      entityDescription: `AI chat turn (${model}) · ${usage.inputTokens}in/${usage.outputTokens}out · ${evidenceCount} evidence items`,
    });

    return NextResponse.json({ sessionId, status: "OPEN", messages, model });
  } catch (error) {
    if (error instanceof GeminiError) {
      return NextResponse.json({ error: error.message }, { status: error.retryable ? 429 : 502 });
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("AI chat failed:", error);
    return NextResponse.json({ error: "AI chat failed", details: message }, { status: 500 });
  }
}
