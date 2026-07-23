// src/lib/diagnostics/ai-assist.ts
// Guardrailed AI troubleshooting generation (docs/TROUBLESHOOTING-ENGINE.md §5,
// Gemini provider). The model only ever sees — and may only cite — a bounded
// EVIDENCE PACK assembled from real records; a code-side validation layer then
// strips anything it cannot prove before the UI renders it. The deterministic
// engine's results always render regardless — this is an assist, not a source
// of truth.
import { db } from "@/lib/db";
import {
  diagnosticGuides,
  correctiveMaintenance,
  componentRegistry,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { diagnose, type Guide, type HistoryCase, type Component } from "./engine";
import { searchPassages, type Passage } from "./retrieval";
import { generateJson, generateJsonChat, type GeminiUsage, type GeminiImage, type GeminiTurn } from "./gemini";

// ── Evidence pack ────────────────────────────────────────────────────────────

export type EvidenceItem = { id: string; kind: "GUIDE" | "HISTORY" | "DOC" | "COMPONENT"; label: string; text: string };
export type EvidencePack = { items: EvidenceItem[]; componentTags: Set<string> };

const trim = (s: string | null | undefined, n: number) => (s ?? "").replace(/\s+/g, " ").slice(0, n);

export async function buildEvidencePack(
  equipmentId: string,
  category: string,
  symptom: string,
): Promise<EvidencePack> {
  const guides = await db.select().from(diagnosticGuides).where(eq(diagnosticGuides.equipmentId, equipmentId));
  const components = await db.select().from(componentRegistry).where(eq(componentRegistry.equipmentId, equipmentId));
  // Whole-plant history — the engine's similarity scoring picks what's relevant,
  // and cross-machine learning is intentional (same guide as the GET route).
  const history = await db.select().from(correctiveMaintenance);

  // Rank with the deterministic engine, then keep the top slices.
  const ranked = diagnose(symptom, guides as Guide[], history as HistoryCase[], components as Component[]);
  const passages: Passage[] = await searchPassages(equipmentId, symptom, 5).catch(() => []);

  const items: EvidenceItem[] = [];

  const rankedGuideIds = new Set(ranked.filter((d) => d.guideId).map((d) => d.guideId));
  const topGuides = [
    ...guides.filter((g) => rankedGuideIds.has(g.id)),
    ...guides.filter((g) => !rankedGuideIds.has(g.id)),
  ].slice(0, 5);
  for (const g of topGuides) {
    items.push({
      id: `G:${g.id}`,
      kind: "GUIDE",
      label: `Guide — ${trim(g.symptom, 60)}`,
      text: `Symptom: ${trim(g.symptom, 150)}${g.errorCode ? ` [${g.errorCode}]` : ""}. Probable cause: ${trim(g.probableCause, 200)}. Resolution: ${trim(g.resolutionAction, 200)}. Confirmed ${g.successCount ?? 0}× before.`,
    });
  }

  const citedCmrfs = new Set(ranked.flatMap((d) => d.historyRefs.map((h) => h.cmrf)));
  const topHistory = [
    ...history.filter((h) => citedCmrfs.has(h.cmrfNumber)),
    ...history.filter((h) => h.status === "CLOSED" && h.verifiedRootCause && !citedCmrfs.has(h.cmrfNumber)),
  ].slice(0, 5);
  for (const h of topHistory) {
    items.push({
      id: `H:${h.cmrfNumber}`,
      kind: "HISTORY",
      label: `History — ${h.cmrfNumber}`,
      text: `Fault: ${trim(h.observedFault || h.faultDescription, 180)}${h.errorCodes ? ` [${trim(h.errorCodes, 40)}]` : ""}. Verified root cause: ${trim(h.verifiedRootCause, 200)}. Parts: ${trim(h.partsReplaced, 80) || "—"}.`,
    });
  }

  for (const p of passages) {
    items.push({
      id: `D:${p.id}`,
      kind: "DOC",
      label: `${p.sourceLabel}${p.heading ? ` · ${trim(p.heading, 50)}` : ""}`,
      text: trim(p.snippet.replace(/\*\*/g, ""), 500),
    });
  }

  for (const c of components.slice(0, 40)) {
    items.push({
      id: `C:${c.componentTag}`,
      kind: "COMPONENT",
      label: `${c.componentTag} — ${c.name}`,
      text: `${c.componentTag}: ${c.name} (${c.type})${c.schematicReference ? `, ${c.schematicReference}` : ""}${c.status && c.status !== "OPERATIONAL" ? `, status ${c.status}` : ""}`,
    });
  }

  return { items, componentTags: new Set(components.map((c) => c.componentTag.toUpperCase())) };
}

// ── Generation contract ──────────────────────────────────────────────────────

const SYSTEM_CONTRACT = `You are the AI troubleshooting assistant inside LIMSL's maintenance management system, supporting qualified industrial maintenance technicians in a fabrication workshop.

HARD RULES — violating any of these makes your output unusable:
1. GROUNDING: You may only base diagnoses on the EVIDENCE PACK provided. Cite evidence by its exact id (e.g. "G:abc", "H:CMRF-2026-0007", "D:chunk1", "C:CB-12"). Never invent evidence ids.
2. COMPONENTS: Only name component tags that appear in the evidence pack. Never invent a tag.
3. INSUFFICIENT EVIDENCE: If the evidence does not support a confident diagnosis, set insufficientEvidence=true, explain what is missing in notes, and give at most one low-confidence hypothesis.
4. SAFETY: Steps are for qualified personnel. Any step touching electrical, hydraulic, pneumatic or stored-energy systems MUST be preceded by isolation and verification of zero energy (LOTO) listed in safetyPrerequisites. Never instruct measurement on live equipment unless the step explicitly says it is a qualified live test with required PPE.
5. CONFIDENCE: 0 to 1. Verified-history matches justify higher confidence than guides; manual passages lower; pure inference lowest.
6. Output only the JSON — no prose outside it.`;

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    diagnoses: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          cause: { type: "STRING" },
          confidence: { type: "NUMBER" },
          evidenceIds: { type: "ARRAY", items: { type: "STRING" } },
          componentTags: { type: "ARRAY", items: { type: "STRING" } },
          safetyPrerequisites: { type: "ARRAY", items: { type: "STRING" } },
          steps: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                action: { type: "STRING" },
                expected: { type: "STRING" },
                ifNot: { type: "STRING" },
              },
              required: ["action"],
            },
          },
          escalateIf: { type: "STRING" },
        },
        required: ["cause", "confidence", "evidenceIds", "steps"],
      },
    },
    insufficientEvidence: { type: "BOOLEAN" },
    notes: { type: "STRING" },
  },
  required: ["diagnoses", "insufficientEvidence"],
};

type RawDiagnosis = {
  cause: string;
  confidence: number;
  evidenceIds: string[];
  componentTags?: string[];
  safetyPrerequisites?: string[];
  steps: { action: string; expected?: string; ifNot?: string }[];
  escalateIf?: string;
};
type RawResponse = { diagnoses: RawDiagnosis[]; insufficientEvidence: boolean; notes?: string };

export type AiDiagnosis = {
  cause: string;
  confidence: number; // 0–100 for UI parity with the deterministic engine
  evidence: { id: string; label: string; kind: string }[];
  componentTags: { tag: string; verified: boolean }[];
  safetyPrerequisites: string[];
  steps: { action: string; expected?: string; ifNot?: string }[];
  escalateIf: string | null;
};
export type AiAssistResult = {
  diagnoses: AiDiagnosis[];
  insufficientEvidence: boolean;
  notes: string | null;
  model: string;
  usage: GeminiUsage;
  evidenceCount: number;
};

const ENERGY_RE = /electric|voltage|power|breaker|contactor|panel|wire|hydraul|pneumat|pressure|motor|drive|energi[sz]e|terminal/i;
const LOTO_RE = /loto|lock[- ]?out|isolat|zero energy|de-?energi[sz]e/i;
const STANDARD_LOTO = "Isolate the machine and verify zero energy (LOTO) before starting";

// The code-side guardrail: strip every claim the pack cannot back.
export function validateAiResponse(raw: RawResponse, pack: EvidencePack): Omit<AiAssistResult, "model" | "usage" | "evidenceCount"> {
  const byId = new Map(pack.items.map((i) => [i.id, i]));
  const diagnoses: AiDiagnosis[] = [];

  for (const d of raw.diagnoses ?? []) {
    if (!d?.cause || typeof d.cause !== "string") continue;

    const evidence = (d.evidenceIds ?? [])
      .filter((id) => byId.has(id))
      .map((id) => ({ id, label: byId.get(id)!.label, kind: byId.get(id)!.kind }));
    // A diagnosis with no verifiable evidence only survives as the explicit
    // low-confidence hypothesis of an insufficient-evidence response.
    if (evidence.length === 0 && !raw.insufficientEvidence) continue;

    const componentTags = (d.componentTags ?? [])
      .filter((t) => typeof t === "string" && t.trim())
      .map((t) => ({ tag: t.trim(), verified: pack.componentTags.has(t.trim().toUpperCase()) }));

    const steps = (d.steps ?? [])
      .filter((s) => s?.action)
      .slice(0, 8)
      .map((s) => ({ action: String(s.action), expected: s.expected || undefined, ifNot: s.ifNot || undefined }));

    let safety = (d.safetyPrerequisites ?? []).filter((s) => typeof s === "string" && s.trim());
    const touchesEnergy = ENERGY_RE.test(`${d.cause} ${steps.map((s) => s.action).join(" ")}`);
    if (touchesEnergy && !safety.some((s) => LOTO_RE.test(s))) {
      safety = [STANDARD_LOTO, ...safety];
    }

    diagnoses.push({
      cause: d.cause.slice(0, 300),
      confidence: Math.round(Math.min(1, Math.max(0, Number(d.confidence) || 0)) * 100),
      evidence,
      componentTags,
      safetyPrerequisites: safety,
      steps,
      escalateIf: d.escalateIf ? String(d.escalateIf).slice(0, 300) : null,
    });
  }

  diagnoses.sort((a, b) => b.confidence - a.confidence);
  return {
    diagnoses: diagnoses.slice(0, 4),
    insufficientEvidence: !!raw.insufficientEvidence,
    notes: raw.notes ? String(raw.notes).slice(0, 500) : null,
  };
}

export async function aiDiagnose(
  equipment: { id: string; name: string; assetId: string; category: string },
  symptom: string,
): Promise<AiAssistResult> {
  const pack = await buildEvidencePack(equipment.id, equipment.category, symptom);

  const user = [
    `MACHINE: ${equipment.assetId} — ${equipment.name} (category ${equipment.category})`,
    `REPORTED SYMPTOM: ${symptom.slice(0, 400)}`,
    ``,
    `EVIDENCE PACK (cite by id):`,
    ...pack.items.map((i) => `[${i.id}] (${i.kind}) ${i.text}`),
  ].join("\n");

  const result = await generateJson<RawResponse>({
    system: SYSTEM_CONTRACT,
    user,
    schema: RESPONSE_SCHEMA,
    maxOutputTokens: 3072,
  });

  const validated = validateAiResponse(result.data, pack);
  return { ...validated, model: result.model, usage: result.usage, evidenceCount: pack.items.length };
}

// ── Conversational diagnosis ─────────────────────────────────────────────────
// The chat-style path: the technician works the fault turn by turn, reporting
// what each suggested step actually produced, and the assistant narrows down.
// Same grounding guardrails as the one-shot path — the evidence pack rides in
// the system instruction every turn so the model can never drift off-record.

const CHAT_SYSTEM_CONTRACT = `You are the AI troubleshooting assistant inside LIMSL's maintenance management system, working a fault CONVERSATIONALLY with a qualified industrial maintenance technician on the shop floor.

You are having a back-and-forth: you suggest a few concrete checks, the technician performs them and reports what they observed (and may attach photos of the panel/component), and you use that to narrow down. Keep each reply focused — a short natural-language message plus at most 3 recommended next steps. Do not dump an exhaustive plan up front; converge with the technician.

HARD RULES — violating any of these makes your output unusable:
1. GROUNDING: Base your reasoning only on the EVIDENCE PACK provided below and on what the technician tells you. Cite evidence by its exact id (e.g. "G:abc", "H:CMRF-2026-0007", "D:chunk1", "C:CB-12") in evidenceIds. Never invent evidence ids.
2. COMPONENTS: Only name component tags that appear in the evidence pack. Never invent a tag.
3. INSUFFICIENT EVIDENCE: If you cannot yet form a confident hypothesis, set insufficientEvidence=true, ask ONE focused question in "question", and keep confidence low.
4. SAFETY: These are qualified personnel. Any step touching electrical, hydraulic, pneumatic or stored-energy systems MUST be preceded by isolation and verification of zero energy (LOTO) in safetyPrerequisites. Never instruct a measurement on live equipment unless the step explicitly states it is a qualified live test with the required PPE.
5. RESOLUTION: When the technician's feedback indicates the fault is fixed, set resolved=true and put the confirmed root cause in likelyCause.
6. Output only the JSON — no prose outside it.`;

const CHAT_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    reply: { type: "STRING" },
    likelyCause: { type: "STRING" },
    confidence: { type: "NUMBER" },
    question: { type: "STRING" },
    recommendedSteps: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          action: { type: "STRING" },
          expected: { type: "STRING" },
          ifNot: { type: "STRING" },
        },
        required: ["action"],
      },
    },
    componentTags: { type: "ARRAY", items: { type: "STRING" } },
    safetyPrerequisites: { type: "ARRAY", items: { type: "STRING" } },
    evidenceIds: { type: "ARRAY", items: { type: "STRING" } },
    insufficientEvidence: { type: "BOOLEAN" },
    resolved: { type: "BOOLEAN" },
  },
  required: ["reply", "insufficientEvidence"],
};

type RawChatTurn = {
  reply: string;
  likelyCause?: string;
  confidence?: number;
  question?: string;
  recommendedSteps?: { action: string; expected?: string; ifNot?: string }[];
  componentTags?: string[];
  safetyPrerequisites?: string[];
  evidenceIds?: string[];
  insufficientEvidence?: boolean;
  resolved?: boolean;
};

// One stored transcript message. Base64 image data is never persisted — only a
// count — to keep the session row small; images are passed to the model on the
// turn they arrive.
export type ChatMessage = {
  role: "user" | "assistant";
  ts: string;
  text: string;
  imageCount?: number;
  likelyCause?: string | null;
  confidence?: number | null;
  question?: string | null;
  steps?: { action: string; expected?: string; ifNot?: string }[];
  safety?: string[];
  components?: { tag: string; verified: boolean }[];
  evidence?: { id: string; label: string; kind: string }[];
  insufficientEvidence?: boolean;
  resolved?: boolean;
};

export function validateChatTurn(raw: RawChatTurn, pack: EvidencePack): ChatMessage {
  const byId = new Map(pack.items.map((i) => [i.id, i]));

  const evidence = (raw.evidenceIds ?? [])
    .filter((id) => byId.has(id))
    .map((id) => ({ id, label: byId.get(id)!.label, kind: byId.get(id)!.kind }));

  const components = (raw.componentTags ?? [])
    .filter((t) => typeof t === "string" && t.trim())
    .map((t) => ({ tag: t.trim(), verified: pack.componentTags.has(t.trim().toUpperCase()) }));

  const steps = (raw.recommendedSteps ?? [])
    .filter((s) => s?.action)
    .slice(0, 3)
    .map((s) => ({ action: String(s.action), expected: s.expected || undefined, ifNot: s.ifNot || undefined }));

  let safety = (raw.safetyPrerequisites ?? []).filter((s) => typeof s === "string" && s.trim());
  const touchesEnergy = ENERGY_RE.test(`${raw.likelyCause ?? ""} ${steps.map((s) => s.action).join(" ")}`);
  if (touchesEnergy && !safety.some((s) => LOTO_RE.test(s))) {
    safety = [STANDARD_LOTO, ...safety];
  }

  return {
    role: "assistant",
    ts: new Date().toISOString(),
    text: String(raw.reply || "").slice(0, 2000),
    likelyCause: raw.likelyCause ? String(raw.likelyCause).slice(0, 300) : null,
    confidence: raw.confidence != null ? Math.round(Math.min(1, Math.max(0, Number(raw.confidence) || 0)) * 100) : null,
    question: raw.question ? String(raw.question).slice(0, 300) : null,
    steps,
    safety,
    components,
    evidence,
    insufficientEvidence: !!raw.insufficientEvidence,
    resolved: !!raw.resolved,
  };
}

// Re-serialize prior transcript turns into Gemini's contents shape so the model
// keeps the thread. Assistant turns fold their structured recap back into text.
function historyToContents(history: ChatMessage[]): GeminiTurn[] {
  return history.map((m): GeminiTurn => {
    if (m.role === "assistant") {
      const bits = [m.text];
      if (m.likelyCause) bits.push(`(working hypothesis: ${m.likelyCause})`);
      if (m.steps?.length) bits.push(`Suggested checks: ${m.steps.map((s, i) => `${i + 1}. ${s.action}`).join("; ")}`);
      return { role: "model", parts: [{ text: bits.join("\n") }] };
    }
    const text = m.imageCount ? `${m.text} [${m.imageCount} photo(s) attached]` : m.text;
    return { role: "user", parts: [{ text }] };
  });
}

export type AiChatResult = { turn: ChatMessage; model: string; usage: GeminiUsage; evidenceCount: number };

export async function aiChatTurn(opts: {
  equipment: { id: string; name: string; assetId: string; category: string };
  symptom: string;
  history: ChatMessage[];
  userText: string;
  images?: GeminiImage[];
}): Promise<AiChatResult> {
  const { equipment, symptom, history, userText, images } = opts;
  const pack = await buildEvidencePack(equipment.id, equipment.category, `${symptom} ${userText}`.trim());

  const system = [
    CHAT_SYSTEM_CONTRACT,
    ``,
    `MACHINE: ${equipment.assetId} — ${equipment.name} (category ${equipment.category})`,
    `ORIGINAL REPORTED SYMPTOM: ${symptom.slice(0, 400)}`,
    ``,
    `EVIDENCE PACK (cite by id):`,
    ...pack.items.map((i) => `[${i.id}] (${i.kind}) ${i.text}`),
  ].join("\n");

  const newParts: Array<Record<string, unknown>> = [{ text: userText || "Please begin." }];
  for (const img of images ?? []) {
    newParts.push({ inlineData: { mimeType: img.mimeType, data: img.dataBase64 } });
  }

  const contents: GeminiTurn[] = [...historyToContents(history), { role: "user", parts: newParts }];

  const result = await generateJsonChat<RawChatTurn>({ system, contents, schema: CHAT_RESPONSE_SCHEMA, maxOutputTokens: 2048 });
  const turn = validateChatTurn(result.data, pack);
  return { turn, model: result.model, usage: result.usage, evidenceCount: pack.items.length };
}
