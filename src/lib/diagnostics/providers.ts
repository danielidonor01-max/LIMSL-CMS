// src/lib/diagnostics/providers.ts
// Multi-provider AI with automatic failover. One call — generateJsonFailover —
// walks every CONFIGURED provider in registry order (Gemini → Groq →
// OpenRouter → Mistral → Anthropic) and moves to the next on quota (429),
// auth (401/403), payment (402) or server errors, so an exhausted free tier
// hands over to the next key instead of failing the diagnosis. The guardrail
// validation layer in ai-assist.ts runs on whatever comes back, so grounding
// rules are provider-independent.
import { getApiKey, PROVIDERS, type Provider } from "@/lib/credentials";
import { GeminiError, generateJsonChat, type GeminiTurn, type GeminiUsage } from "./gemini";

export type AiTurn = GeminiTurn; // { role: "user" | "model", parts: [{text}|{inlineData}] }
export type FailoverResult<T> = { data: T; model: string; provider: Provider; usage: GeminiUsage };

// Default model per OpenAI-compatible provider — free-tier friendly choices.
const OPENAI_STYLE: Record<string, { base: string; model: string; extraHeaders?: Record<string, string> }> = {
  GROQ: { base: "https://api.groq.com/openai/v1", model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile" },
  OPENROUTER: {
    base: "https://openrouter.ai/api/v1",
    model: process.env.OPENROUTER_MODEL || "meta-llama/llama-3.3-70b-instruct:free",
    extraHeaders: { "X-Title": "LIMSL CMS" },
  },
  MISTRAL: { base: "https://api.mistral.ai/v1", model: process.env.MISTRAL_MODEL || "mistral-small-latest" },
};

class ProviderError extends Error {
  constructor(message: string, public readonly skippable: boolean) {
    super(message);
  }
}

// Gemini turns → OpenAI messages. Inline images ride as data: URLs (all three
// OpenAI-style providers accept image_url content parts on vision models; on
// text-only models the provider errors and we fail over).
function toOpenAiMessages(system: string, contents: AiTurn[]): Array<Record<string, unknown>> {
  const msgs: Array<Record<string, unknown>> = [{ role: "system", content: system }];
  for (const turn of contents) {
    const role = turn.role === "model" ? "assistant" : "user";
    const texts: string[] = [];
    const images: string[] = [];
    for (const part of turn.parts) {
      if (typeof part.text === "string") texts.push(part.text);
      const inline = part.inlineData as { mimeType?: string; data?: string } | undefined;
      if (inline?.data) images.push(`data:${inline.mimeType ?? "image/jpeg"};base64,${inline.data}`);
    }
    if (images.length && role === "user") {
      msgs.push({
        role,
        content: [
          { type: "text", text: texts.join("\n") },
          ...images.map((url) => ({ type: "image_url", image_url: { url } })),
        ],
      });
    } else {
      msgs.push({ role, content: texts.join("\n") });
    }
  }
  return msgs;
}

// Strip ```json fences some models wrap around their output.
function parseModelJson<T>(raw: string): T {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(cleaned) as T;
}

async function callOpenAiStyle<T>(
  provider: Provider,
  key: string,
  opts: { system: string; contents: AiTurn[]; schema: Record<string, unknown>; maxOutputTokens?: number },
): Promise<FailoverResult<T>> {
  const cfg = OPENAI_STYLE[provider];
  // These providers don't take Gemini's responseSchema — the schema rides in the
  // system prompt and response_format pins the output to JSON.
  const system =
    `${opts.system}\n\nOUTPUT FORMAT: respond with ONLY a single JSON object matching this JSON Schema ` +
    `(no prose, no markdown fences):\n${JSON.stringify(opts.schema)}`;

  const res = await fetch(`${cfg.base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      ...(cfg.extraHeaders ?? {}),
    },
    body: JSON.stringify({
      model: cfg.model,
      messages: toOpenAiMessages(system, opts.contents),
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: opts.maxOutputTokens ?? 2048,
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (res.status === 401 || res.status === 403 || res.status === 402 || res.status === 429 || res.status >= 500) {
    const body = await res.json().catch(() => null);
    throw new ProviderError(body?.error?.message ?? `${provider} HTTP ${res.status}`, true);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ProviderError(body?.error?.message ?? `${provider} request failed (HTTP ${res.status}).`, true);
  }

  const d = await res.json();
  const text: string | undefined = d.choices?.[0]?.message?.content;
  if (!text) throw new ProviderError(`${provider} returned no content.`, true);

  let data: T;
  try {
    data = parseModelJson<T>(text);
  } catch {
    throw new ProviderError(`${provider} returned unparseable JSON.`, true);
  }
  return {
    data,
    model: `${provider.toLowerCase()}:${cfg.model}`,
    provider,
    usage: { inputTokens: d.usage?.prompt_tokens ?? 0, outputTokens: d.usage?.completion_tokens ?? 0 },
  };
}

async function callAnthropic<T>(
  key: string,
  opts: { system: string; contents: AiTurn[]; schema: Record<string, unknown>; maxOutputTokens?: number },
): Promise<FailoverResult<T>> {
  const model = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5";
  const system =
    `${opts.system}\n\nOUTPUT FORMAT: respond with ONLY a single JSON object matching this JSON Schema ` +
    `(no prose, no markdown fences):\n${JSON.stringify(opts.schema)}`;
  const messages = opts.contents.map((turn) => ({
    role: turn.role === "model" ? "assistant" : "user",
    content: turn.parts
      .map((p) => {
        if (typeof p.text === "string") return { type: "text", text: p.text };
        const inline = p.inlineData as { mimeType?: string; data?: string } | undefined;
        if (inline?.data) {
          return {
            type: "image",
            source: { type: "base64", media_type: inline.mimeType ?? "image/jpeg", data: inline.data },
          };
        }
        return null;
      })
      .filter(Boolean),
  }));

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model, system, messages, max_tokens: opts.maxOutputTokens ?? 2048 }),
    signal: AbortSignal.timeout(60_000),
  });
  if (res.status === 401 || res.status === 403 || res.status === 402 || res.status === 429 || res.status >= 500) {
    const body = await res.json().catch(() => null);
    throw new ProviderError(body?.error?.message ?? `ANTHROPIC HTTP ${res.status}`, true);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ProviderError(body?.error?.message ?? `Anthropic request failed (HTTP ${res.status}).`, true);
  }
  const d = await res.json();
  const text = (d.content ?? []).map((b: { text?: string }) => b.text ?? "").join("");
  if (!text) throw new ProviderError("Anthropic returned no content.", true);
  let data: T;
  try {
    data = parseModelJson<T>(text);
  } catch {
    throw new ProviderError("Anthropic returned unparseable JSON.", true);
  }
  return {
    data,
    model: `anthropic:${model}`,
    provider: "ANTHROPIC",
    usage: { inputTokens: d.usage?.input_tokens ?? 0, outputTokens: d.usage?.output_tokens ?? 0 },
  };
}

// Which providers have a usable key right now, in failover order.
export async function configuredProviders(): Promise<Provider[]> {
  const out: Provider[] = [];
  for (const p of Object.keys(PROVIDERS) as Provider[]) {
    if (await getApiKey(p)) out.push(p);
  }
  return out;
}

export async function anyProviderConfigured(): Promise<boolean> {
  return (await configuredProviders()).length > 0;
}

export async function generateJsonFailover<T>(opts: {
  system: string;
  contents: AiTurn[];
  schema: Record<string, unknown>;
  maxOutputTokens?: number;
}): Promise<FailoverResult<T>> {
  const chain = await configuredProviders();
  if (chain.length === 0) {
    throw new GeminiError("No AI provider is configured — add an API key in App Settings.");
  }

  let lastErr: Error | null = null;
  for (const provider of chain) {
    const key = await getApiKey(provider);
    if (!key) continue;
    try {
      if (provider === "GEMINI") {
        const r = await generateJsonChat<T>(opts);
        return { data: r.data, model: `gemini:${r.model}`, provider, usage: r.usage };
      }
      if (provider === "ANTHROPIC") return await callAnthropic<T>(key, opts);
      return await callOpenAiStyle<T>(provider, key, opts);
    } catch (err) {
      // GeminiError with retryable=true (quota) and any skippable ProviderError
      // hand over to the next provider; a hard config error also moves on —
      // the whole point is that one dead provider never blocks the answer.
      lastErr = err instanceof Error ? err : new Error(String(err));
      console.warn(`ai failover: ${provider} failed (${lastErr.message}) — trying next provider`);
    }
  }
  throw new GeminiError(
    `All configured AI providers failed. Last error: ${lastErr?.message ?? "unknown"}`,
    true,
  );
}
