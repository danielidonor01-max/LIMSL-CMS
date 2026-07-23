// src/lib/diagnostics/gemini.ts
// Server-side Google Gemini client (REST — no SDK dependency) for the
// troubleshooting module's AI layer. The key comes from CMS Settings
// (src/lib/credentials.ts: env var override → encrypted DB). Structured JSON
// output is enforced via responseSchema, so responses parse or fail loudly —
// never free prose into the UI. Supports inline images (panel photos, scanned
// schematic tiles) for the vision path.
import { getApiKey } from "@/lib/credentials";

// Probed against a fresh AI Studio key (2026-07): the pinned 2.x models return
// 404 "no longer available to new users" / 429 zero-quota — the `-latest`
// aliases are the free-tier path. Walk the fallbacks on 404 AND 429, since a
// 429 can mean "this model has no quota for this key" rather than a rate spike.
const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";
const FALLBACK_MODELS = [...new Set([DEFAULT_MODEL, "gemini-flash-latest", "gemini-flash-lite-latest", "gemini-2.5-flash", "gemini-2.0-flash"])];

export type GeminiImage = { mimeType: string; dataBase64: string };
export type GeminiUsage = { inputTokens: number; outputTokens: number };
export type GeminiResult<T> = { data: T; model: string; usage: GeminiUsage };
// One conversational turn in Gemini's wire shape ("model" is Gemini's word for
// the assistant role). parts may carry text and/or inlineData images.
export type GeminiTurn = { role: "user" | "model"; parts: Array<Record<string, unknown>> };

export class GeminiError extends Error {
  constructor(message: string, public readonly retryable = false) {
    super(message);
  }
}

// Post one already-assembled payload, walking the model fallbacks on 404/429,
// and parse the JSON candidate. Shared by the single-shot and chat entry points.
async function runGenerate<T>(payload: Record<string, unknown>): Promise<GeminiResult<T>> {
  const key = await getApiKey("GEMINI");
  if (!key) throw new GeminiError("Gemini is not configured — add the API key in App Settings.");
  const body = JSON.stringify(payload);

  let lastErr: GeminiError | null = null;
  for (const model of FALLBACK_MODELS) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout(60_000),
      },
    );

    if (res.status === 404) {
      lastErr = new GeminiError(`Model ${model} not available for this key.`);
      continue; // try next fallback
    }
    if (res.status === 429) {
      // Either a rate spike or zero quota for this model on this key — try the
      // next model; only surface the 429 if every fallback is exhausted.
      lastErr = new GeminiError("Gemini quota/rate limit reached — try again in a minute.", true);
      continue;
    }
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new GeminiError(err?.error?.message ?? `Gemini request failed (HTTP ${res.status}).`);
    }

    const d = await res.json();
    if (d.promptFeedback?.blockReason) {
      throw new GeminiError(`Request blocked by Gemini safety filters (${d.promptFeedback.blockReason}).`);
    }
    const candidate = d.candidates?.[0];
    const text = candidate?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("");
    if (!text) {
      throw new GeminiError(
        candidate?.finishReason ? `Gemini returned no content (${candidate.finishReason}).` : "Gemini returned no content.",
      );
    }

    let data: T;
    try {
      data = JSON.parse(text) as T;
    } catch {
      throw new GeminiError("Gemini returned unparseable JSON — response discarded.");
    }

    return {
      data,
      model,
      usage: {
        inputTokens: d.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: d.usageMetadata?.candidatesTokenCount ?? 0,
      },
    };
  }
  throw lastErr ?? new GeminiError("No Gemini model available.");
}

// One JSON-schema-constrained generation call. `schema` is Gemini's OpenAPI-ish
// subset (type OBJECT/ARRAY/STRING/NUMBER/BOOLEAN/INTEGER, properties, items,
// required, enum).
export async function generateJson<T>(opts: {
  system: string;
  user: string;
  images?: GeminiImage[];
  schema: Record<string, unknown>;
  maxOutputTokens?: number;
}): Promise<GeminiResult<T>> {
  const parts: Array<Record<string, unknown>> = [{ text: opts.user }];
  for (const img of opts.images ?? []) {
    parts.push({ inlineData: { mimeType: img.mimeType, data: img.dataBase64 } });
  }
  return runGenerate<T>({
    system_instruction: { parts: [{ text: opts.system }] },
    contents: [{ role: "user", parts }],
    generationConfig: {
      response_mime_type: "application/json",
      response_schema: opts.schema,
      temperature: 0.2,
      maxOutputTokens: opts.maxOutputTokens ?? 3072,
    },
  });
}

// Multi-turn variant: caller supplies the full conversation (must end on a
// `user` turn). Used by the chat-style diagnosis so the model keeps context
// across the technician's step-by-step feedback.
export async function generateJsonChat<T>(opts: {
  system: string;
  contents: GeminiTurn[];
  schema: Record<string, unknown>;
  maxOutputTokens?: number;
}): Promise<GeminiResult<T>> {
  return runGenerate<T>({
    system_instruction: { parts: [{ text: opts.system }] },
    contents: opts.contents,
    generationConfig: {
      response_mime_type: "application/json",
      response_schema: opts.schema,
      temperature: 0.3,
      maxOutputTokens: opts.maxOutputTokens ?? 2048,
    },
  });
}
