// src/lib/diagnostics/engine.ts
// In-app diagnostic engine. Given a machine and a symptom/error-code query, it
// ranks probable causes by combining THREE evidence sources:
//   1. Curated diagnostic guides (reinforced by successCount — usage learning)
//   2. Historical corrective cases / RCA (verified root causes seen before)
//   3. The component registry + schematics (points to the sheet/zone to check)
// It is a transparent heuristic (token-overlap similarity), not a black box —
// every diagnosis carries its evidence.

export type Guide = {
  id: string;
  symptom: string;
  errorCode: string | null;
  componentTag: string | null;
  probableCause: string;
  diagnosticSteps: string; // JSON string[]
  resolutionAction: string | null;
  successCount: number | null;
};

export type HistoryCase = {
  id: string;
  cmrfNumber: string;
  reportedDate: string;
  observedFault: string | null;
  faultDescription: string | null;
  errorCodes: string | null;
  rootCauseCategory: string | null;
  verifiedRootCause: string | null;
  correctiveActions: string | null; // JSON [{action,...}]
  partsReplaced: string | null;
  status: string;
};

export type Component = {
  componentTag: string;
  name: string;
  type: string;
  location: string | null;
  schematicReference: string | null;
  status: string | null;
};

export type Diagnosis = {
  rank: number;
  cause: string;
  confidence: number; // 0-100
  source: "GUIDE" | "HISTORY" | "GUIDE+HISTORY";
  guideId?: string | null; // set when a curated guide backs this diagnosis
  errorCode?: string | null;
  evidence: string[];
  steps: string[];
  resolution?: string | null;
  components: Component[];
  historyRefs: { cmrf: string; date: string; rootCause: string; parts?: string | null }[];
};

const STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "on", "of", "to", "no", "not", "and", "or",
  "with", "for", "in", "at", "it", "will", "was", "has", "have", "axis", "machine",
]);

function tokenize(text: string): Set<string> {
  return new Set(
    (text || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1 && !STOPWORDS.has(w)),
  );
}

// Weighted overlap: shared tokens / query tokens (recall-oriented), so a short
// query like "x axis no motion" still matches longer stored text.
function similarity(query: Set<string>, target: Set<string>): number {
  if (query.size === 0 || target.size === 0) return 0;
  let shared = 0;
  for (const t of query) if (target.has(t)) shared++;
  return shared / query.size;
}

function extractErrorCodes(text: string): string[] {
  const matches = (text || "").toUpperCase().match(/\b[A-Z]{1,4}-?\d{2,4}\b/g);
  return matches ?? [];
}

function parseSteps(json: string | null): string[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    if (Array.isArray(arr)) return arr.map((s) => (typeof s === "string" ? s : s.description ?? String(s)));
  } catch {}
  return [];
}

function parseActions(json: string | null): string[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    if (Array.isArray(arr)) return arr.map((a) => (typeof a === "string" ? a : a.action ?? String(a)));
  } catch {}
  return [];
}

// Find components implicated by a piece of text (symptom / cause / guide tag).
function matchComponents(text: string, tag: string | null, components: Component[]): Component[] {
  const toks = tokenize(text);
  const out: Component[] = [];
  for (const c of components) {
    const hit =
      (tag && c.componentTag.toLowerCase() === tag.toLowerCase()) ||
      c.status === "FAULTY" ||
      similarity(toks, tokenize(`${c.name} ${c.componentTag} ${c.type}`)) > 0.34;
    if (hit) out.push(c);
  }
  return out;
}

export function diagnose(
  symptom: string,
  guides: Guide[],
  history: HistoryCase[],
  components: Component[],
): Diagnosis[] {
  const q = tokenize(symptom);
  const qCodes = extractErrorCodes(symptom);
  const results: Diagnosis[] = [];

  // ── 1. Score curated guides ───────────────────────────────────────────────
  for (const g of guides) {
    let score = similarity(q, tokenize(`${g.symptom} ${g.probableCause}`));
    const codeHit = g.errorCode && qCodes.includes(g.errorCode.toUpperCase());
    if (codeHit) score += 0.6;
    if (score < 0.15 && !codeHit) continue;

    const success = g.successCount ?? 0;
    // base 45, similarity up to +35, each past success +4 (capped)
    const confidence = Math.min(97, Math.round(45 + score * 35 + Math.min(success, 6) * 4));
    const evidence: string[] = [];
    if (success > 0) evidence.push(`Resolved ${success}× before via this guide`);
    if (codeHit) evidence.push(`Error code ${g.errorCode} matches`);
    evidence.push("Curated diagnostic guide");

    results.push({
      rank: 0,
      cause: g.probableCause,
      confidence,
      source: "GUIDE",
      guideId: g.id,
      errorCode: g.errorCode,
      evidence,
      steps: parseSteps(g.diagnosticSteps),
      resolution: g.resolutionAction,
      components: matchComponents(`${g.symptom} ${g.probableCause}`, g.componentTag, components),
      historyRefs: [],
    });
  }

  // ── 2. Aggregate historical / RCA evidence by verified root cause ─────────
  const byCause = new Map<string, { cases: HistoryCase[]; score: number }>();
  for (const h of history) {
    if (h.status !== "CLOSED" || !h.verifiedRootCause) continue;
    const text = `${h.observedFault ?? ""} ${h.faultDescription ?? ""} ${h.errorCodes ?? ""}`;
    let score = similarity(q, tokenize(text));
    if (h.errorCodes && qCodes.some((c) => h.errorCodes!.toUpperCase().includes(c))) score += 0.6;
    if (score < 0.2) continue;
    const key = h.verifiedRootCause;
    if (!byCause.has(key)) byCause.set(key, { cases: [], score: 0 });
    const entry = byCause.get(key)!;
    entry.cases.push(h);
    entry.score = Math.max(entry.score, score);
  }

  for (const [cause, { cases, score }] of byCause) {
    const freq = cases.length;
    // base 40, similarity +30, each recurrence +8 (frequency = confidence)
    const confidence = Math.min(96, Math.round(40 + score * 30 + Math.min(freq - 1, 5) * 8));
    const parts = cases.map((c) => c.partsReplaced).filter(Boolean);
    const actions = cases.flatMap((c) => parseActions(c.correctiveActions));
    const evidence = [
      `Seen ${freq}× in maintenance history`,
      ...cases.slice(0, 3).map((c) => `${c.cmrfNumber} (${c.reportedDate})`),
    ];
    results.push({
      rank: 0,
      cause,
      confidence,
      source: "HISTORY",
      evidence,
      steps: [],
      resolution: actions[0] ?? null,
      components: matchComponents(cause, null, components),
      historyRefs: cases.map((c) => ({
        cmrf: c.cmrfNumber,
        date: c.reportedDate,
        rootCause: c.rootCauseCategory ?? "—",
        parts: c.partsReplaced,
      })),
    });
    void parts;
  }

  // ── 3. Merge guide + history diagnoses that describe the same cause ────────
  const merged: Diagnosis[] = [];
  for (const d of results) {
    const twin = merged.find(
      (m) => m.source !== d.source && similarity(tokenize(m.cause), tokenize(d.cause)) > 0.4,
    );
    if (twin) {
      twin.source = "GUIDE+HISTORY";
      twin.confidence = Math.min(99, Math.max(twin.confidence, d.confidence) + 6);
      twin.evidence = [...new Set([...twin.evidence, ...d.evidence])];
      twin.steps = twin.steps.length ? twin.steps : d.steps;
      twin.resolution = twin.resolution ?? d.resolution;
      twin.historyRefs = twin.historyRefs.length ? twin.historyRefs : d.historyRefs;
      const tags = new Set(twin.components.map((c) => c.componentTag));
      for (const c of d.components) if (!tags.has(c.componentTag)) twin.components.push(c);
    } else {
      merged.push({ ...d });
    }
  }

  merged.sort((a, b) => b.confidence - a.confidence);
  merged.forEach((d, i) => (d.rank = i + 1));
  return merged;
}
