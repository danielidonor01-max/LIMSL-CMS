# Troubleshooting Module — Complete Engineering Guide

**Ingestion → Retrieval → Vision → Guardrailed Generation**

This is the master design for finishing the troubleshooting module properly. It
covers the four pillars end-to-end:

1. **Ingestion & preprocessing** of text documents (manuals, procedures) and
   schematic diagrams (PDFs) — including the **overlapping-tile strategy** that
   works around vision-resolution limits on dense schematic sheets.
2. **Query understanding & retrieval** — from a technician's words to a ranked
   evidence pack.
3. **Vision-assisted schematic analysis** — pointing the model (and the
   technician) at the exact crop of the sheet that matters.
4. **Guardrailed troubleshooting generation** — AI output that is grounded,
   safety-gated, auditable, and clearly labeled.

> **Status:** the engine remains **DISABLED** (`SCHEMATIC_INGESTION_ENABLED`
> unset; no Anthropic API key). Nothing in this guide changes that. It is the
> blueprint we implement against when the subscription exists. The deterministic
> in-app engine (`src/lib/diagnostics/engine.ts`) is live today and stays the
> spine of the module — AI **augments** it, never replaces it.

---

## 0. Design principles (read first)

1. **Deterministic spine, AI assist.** The transparent heuristic engine
   (guides + history + registry) always runs and always renders. AI results are
   an additional, clearly-labeled layer. A compliance system must never say
   "because the model said so."
2. **Provenance is deterministic, not model-claimed.** Every extracted
   component and every retrieved passage carries provenance (document → page →
   tile → bounding box) computed by *our* pipeline. We do not rely on the model
   citing itself. (This also sidesteps an API constraint: citations and
   structured outputs are mutually exclusive on the same request.)
3. **Human-in-the-loop before data goes live.** Extraction lands in
   `NEEDS_REVIEW`; a technician confirms before anything enters
   `component_registry` or influences diagnosis. Same pattern as sign-offs.
4. **Everything auditable.** Every AI call is logged (job, model, token usage,
   verbatim output). Extracted data is stored verbatim next to the reviewed
   version.
5. **Fail closed.** No key / quota exhausted / low confidence → the module
   degrades to the deterministic engine, visibly, never silently.

---

## 1. Why tiling — the resolution problem, quantified

The Claude vision API accepts images up to **2576 px on the long edge** (Opus
4.7+; older models cap at 1568 px). Anything larger is **downscaled server-side
before the model sees it.**

A real schematic sheet:

| Sheet | Physical | Rendered @250 DPI | Downscaled to 2576px | Effective loss |
|---|---|---|---|---|
| A3 | 420×297 mm | 4134×2923 px | 2576×1821 px | ~38% linear (readable-ish) |
| A1 | 841×594 mm | 8276×5846 px | 2576×1820 px | ~69% linear |
| A0 | 1189×841 mm | 11703×8276 px | 2576×1822 px | ~78% linear |

At A1/A0 scale, component tags like `CB-12`, terminal numbers, and wire labels
render at 2–4 px tall after downscaling — **unreadable**. Sending whole sheets
produces confident-looking, wrong extractions. This is the failure mode the
tiling strategy exists to prevent.

**Token cost per image:** roughly `width × height / 750` tokens, capped at
~4,800 tokens for a max-resolution image on current models. A 2048×2048 tile ≈
4.8–5.6K input tokens.

---

## 2. Pillar 1 — Ingestion & preprocessing

### 2.1 Intake & classification

Every uploaded document (`equipment_documents`) is classified on upload:

- **`pdfKind`** (already in schema): `TEXT_SELECTABLE | IMAGE_ONLY | UNKNOWN`.
  Detect programmatically: extract text from page 1–2 with `pdfjs-dist`; if the
  character yield per page is above a small threshold (~200 chars), it's
  `TEXT_SELECTABLE`; else `IMAGE_ONLY` (scanned).
- **Document class** (new field or infer from `type`): `MANUAL | PROCEDURE |
  SCHEMATIC | BOM | OTHER`. Manuals/procedures go down the **text path**;
  schematics go down the **vision path**; BOM tables can go down either.

### 2.2 Text-document path (manuals, procedures) — no vision needed

1. **Extract** text locally (`pdfjs-dist` — pure JS, works in the worker; no
   API cost). Preserve page numbers.
2. **Chunk** into ~800-token chunks with 100-token overlap, split on headings
   first (regex for numbered headings `^\d+(\.\d+)*\s`), paragraphs second.
   Each chunk stores: `documentId, page range, heading path, text`.
3. **Store** in a new `document_chunks` table:

```
document_chunks:
  id, equipment_id, document_id, chunk_index,
  heading (text), page_start (int), page_end (int),
  content (text), token_estimate (int),
  tsv (tsvector, generated)          -- Postgres full-text index
```

4. **Index**: a Postgres `tsvector` column + GIN index gives us proper
   full-text retrieval today. (pgvector embeddings are a later upgrade — the
   schema is designed so adding an `embedding vector(1536)` column is additive.)

No AI call is needed for this whole path — it can ship **before** the
subscription exists and immediately improves retrieval quality.

### 2.3 Schematic path — render, overview, tile

#### Stage R — Render

Render each PDF page to PNG at a **target of 250 DPI** (200 for A3-and-smaller,
250–300 for A1/A0). Tooling: `pdftoppm` (poppler) where available, else
`pdfjs-dist` + `@napi-rs/canvas`. Store the full-page render in Supabase
Storage under `schematics/{documentId}/p{page}.png`.

#### Stage O — Overview pass (one cheap call per page)

Downscale the full page to ≤2576 px long edge and send **one** vision call
asking only for global structure (structured output):

```json
{
  "sheetNumber": "4", "sheetTitle": "Main Control Panel",
  "zoneGrid": { "cols": ["1","2","3","4","5","6","7","8"], "rows": ["A","B","C","D"] },
  "contentBBox": { "x": 120, "y": 80, "w": 7900, "h": 5500 },
  "denseRegions": [{ "x":..., "y":..., "w":..., "h":..., "reason": "terminal strip" }],
  "titleBlockText": "…"
}
```

The overview gives us: (a) the **zone grid** so extracted components can be
mapped to `Sheet 4, Zone C2` references (matching `schematicReference` in the
registry), (b) the **content bounding box** so we don't tile empty margins,
and (c) **dense regions** that need a finer second-level pass.

#### Stage T — Systematic overlapping tiling (the core)

Tile the content bounding box — not the whole page — into overlapping windows:

```
TILE       = 2048        # px, ≤ model max edge (2576), sweet spot for cost
OVERLAP    = 384         # px ≈ 19% — MUST exceed the largest symbol+label size
STRIDE     = TILE - OVERLAP   # 1664

tiles = []
for y in range(bbox.y, bbox.y + bbox.h, STRIDE):
    for x in range(bbox.x, bbox.x + bbox.w, STRIDE):
        w = min(TILE, bbox.right - x); h = min(TILE, bbox.bottom - y)
        if w < OVERLAP or h < OVERLAP: continue     # sliver — merged into neighbor
        tiles.append({x, y, w, h, row, col})
```

Rules that make this *systematic* rather than ad hoc:

- **Overlap ≥ largest annotated symbol.** 384 px at 250 DPI ≈ 39 mm of paper —
  bigger than any breaker symbol + its tag. Guarantees every component appears
  **fully inside at least one tile**, so nothing is ever only-seen-cut-in-half.
- **Dynamic second level.** Any `denseRegions` from the overview (terminal
  strips, PLC I/O tables) get re-tiled at 1024 px tiles from a 400-DPI render —
  the "dynamic crop" pass for the worst areas.
- **Deterministic addressing.** Tile ID = `p{page}_r{row}_c{col}[_z]`. Each
  tile stores its page-coordinate offset so any pixel coordinate the model
  returns inside a tile maps back to absolute page coordinates:
  `page_xy = tile_offset + tile_xy`.
- Crop with `sharp` from the full-resolution render (never re-render per tile).
  Store crops alongside the page render; they are reused at diagnosis time
  (Pillar 3) — this is why we keep them, not just for ingestion.

New table:

```
schematic_tiles:
  id, document_id, equipment_id, page (int),
  tile_key (text: p4_r2_c3), x, y, w, h (ints, page coords),
  file_key (storage), dpi (int), level (1|2),
  zone_hint (text, from overview grid math)
```

#### Stage X — Per-tile extraction (structured outputs)

One vision call per tile. The image is the tile crop; the prompt includes the
sheet context from the overview (sheet number/title, zone grid geometry, the
tile's page offset) so the model can compute zones. Force JSON with
`output_config.format` (structured outputs) — schema mirrors
`ExtractedComponent` in `src/lib/diagnostics/ingestion/provider.ts`, extended:

```json
{
  "components": [{
    "componentTag": "CB-12",
    "name": "Circuit Breaker 12",
    "type": "ELECTRICAL",
    "bbox": { "x": 512, "y": 940, "w": 84, "h": 60 },   // tile coords
    "labelText": "CB-12 16A C-curve",
    "connectsTo": ["L1", "TB2-14"],
    "confidence": 0.93,
    "cutOff": false          // true if the symbol touches a tile edge
  }],
  "nets": [{ "label": "24VDC", "members": ["PSU1:+", "TB2-1", "PLC-IN-0"] }],
  "unreadableRegions": [{ "x":..., "y":..., "w":..., "h":... }]
}
```

Prompt-contract lines that matter (they are guardrails, not niceties):

- *"Report ONLY what is legible. If a tag is partially cut by the tile edge,
  set `cutOff: true` and do not guess the missing characters."*
- *"`confidence` reflects legibility, not plausibility."*
- *"If the tile contains no components, return an empty array — never invent."*

API notes (verified against the current API): model `claude-opus-4-8`
(config default), adaptive thinking on, one image block + text block per
request, **prompt caching** on the static system contract (it repeats for every
tile — cache_control on the system block cuts the repeated cost ~90%), and the
**Batches API for bulk ingestion runs (50% price cut)** since ingestion is not
latency-sensitive.

#### Stage M — Merge & deduplicate (pure code, no AI)

Overlap means most components are seen 2–4×. Merge deterministically:

1. Map every `bbox` to absolute page coordinates (tile offset + tile coords).
2. Group by normalized `componentTag` (uppercase, strip spaces).
3. Same tag, overlapping page-bboxes (IoU > 0.3) → one component; keep the
   observation with highest `confidence` and `cutOff == false`.
4. Same tag, **disjoint** locations → genuine duplicates on the sheet (e.g.
   a tag reused) → keep both, flag for review.
5. Different tags, same bbox (IoU > 0.8) → OCR disagreement between tiles →
   flag `conflict: [tags…]` for review; never auto-pick.
6. Compute `zone` from page coords + the overview's zone grid (pure math).
7. Union `connectsTo` across observations; resolve net membership.

The merged result is written to `schematic_ingestion_jobs.extractedData`
(verbatim, plus the per-tile raw outputs for audit) and the job moves to
`NEEDS_REVIEW`.

#### Stage V — Human review → registry

The existing review flow: a technician sees the merged component list next to
the tile crops (click a row → the crop that observed it, with bbox highlight),
fixes tags, resolves conflicts, confirms. On confirm the rows upsert into
`component_registry` with `schematicReference = "Sheet {n}, Zone {z}"` — which
the live diagnostic engine already consumes. **No AI output reaches the
registry without this step.**

### 2.4 Job orchestration (Vercel-safe)

Ingesting one A1 sheet = 1 overview + ~20 tile calls. That cannot run inside
one serverless request. The job state machine (extends the existing
`schematicIngestionJobs.status`):

```
PENDING → RENDERING → TILING → EXTRACTING(cursor: nextTile) → MERGING → NEEDS_REVIEW → CONFIRMED
                                     ↑ resumable — each worker invocation processes ≤ N tiles
```

- Add `progress` JSON to the job row (`{stage, nextTile, totalTiles}`).
- `processPendingJobs(limit)` (already exists) advances **bounded work per
  invocation** — e.g. 5 tiles — then returns; safe under any function timeout.
- Drive it from: the admin's machine (`npx tsx` — same pattern as seeds), a
  Vercel cron hitting a `CRON_SECRET`-gated endpoint (same pattern as
  escalations), **or** submit all tile calls as one **Message Batch** and poll
  it — the recommended path for bulk go-live ingestion (cheapest + one
  submission).

### 2.5 Cost planning (order-of-magnitude, Opus 4.8 @ $5/$25 per MTok)

| Item | Tokens | Cost |
|---|---|---|
| Overview call | ~3K in / 1K out | ~$0.04 |
| Tile call (2048²) | ~5K in / ~1.5K out | ~$0.06 |
| **A1 sheet (~20 tiles)** | ~110K in / 30K out | **~$1.30 · ~$0.65 batched** |
| 33 machines × ~5 sheets | — | **~$110–215 one-off, batched** |

With prompt caching on the shared system contract the real number lands lower.
Text-document ingestion costs ~$0 (local extraction).

---

## 3. Pillar 2 — Query understanding & retrieval

### 3.1 The flow, technician → module

```
technician types: "spindle stops, smells burnt, code E-041 on the HMI"
        │
        ▼
[1] Normalize (pure code)
    · extract error codes  → ["E-041"]        (regex exists in engine.ts)
    · extract component tags → ["…"]           (regex \b[A-Z]{1,4}-?\d{1,4}\b ∩ registry tags)
    · canonicalize symptom text (lowercase, stopwords — exists)
        │
        ▼
[2] Retrieve, in parallel (all deterministic)
    a. diagnostic_guides        — engine.ts scoring (exists) + FTS boost
    b. corrective history/RCA   — engine.ts scoring (exists) + FTS boost
    c. component_registry       — tag/name match (exists)
    d. document_chunks (NEW)    — Postgres FTS: manuals + procedure passages
    e. schematic refs           — components hit in (c) → their sheet/zone/tile
        │
        ▼
[3] Rank & assemble the EVIDENCE PACK (bounded, ~8K tokens max)
    top guides + top history cases + matched components + top doc chunks,
    each item carrying its provenance (guideId / cmrfNumber / chunk page / tile key)
        │
        ├────────► render deterministic results NOW (engine.ts — unchanged, instant)
        ▼
[4] AI layer (only if enabled + evidence pack non-trivial)
    guarded generation over the evidence pack (Pillar 4)
```

Key decisions:

- **Postgres FTS is the retrieval upgrade**, not a rewrite: `tsvector` columns
  on `diagnostic_guides(symptom, probable_cause)`, `corrective_maintenance
  (observed_fault, fault_description, verified_root_cause)`, and
  `document_chunks(content)`. `websearch_to_tsquery('english', query)` +
  `ts_rank` blends with the existing token-overlap scores (weighted sum). The
  in-memory engine stays as-is for small tables; FTS matters most for chunks.
- **No LLM in the query path by default.** Normalization is regex + dictionary.
  An optional LLM "query rewrite" (misspelled part names → canonical) can be
  added later; it must degrade to pass-through.
- **The evidence pack is the *only* thing generation may use.** Bounded size,
  every item has an ID. This is what makes grounding checkable (Pillar 4).

### 3.2 Later upgrade: embeddings

When justified: add `embedding vector(1536)` to `document_chunks` (pgvector is
native on Supabase), populate via an embeddings provider, retrieve hybrid
(FTS ∪ vector, reciprocal-rank fusion). Additive migration; nothing above
changes shape. Not required for v1 — the corpus (~33 machines) is small.

---

## 4. Pillar 3 — Vision-assisted schematic analysis (at diagnosis time)

Ingestion stored every tile crop with its address. That turns the schematic
from a dead PDF into an *addressable* asset:

### 4.1 Show the technician the right crop (no AI call)

Diagnosis says *"check CB-12 — Sheet 4, Zone C2"*. The registry row's merged
bbox → look up the level-1 tile containing it → serve that crop (auth-gated via
`/api/files`, storage keys already exist) with the component's bbox highlighted
client-side. **This is pure UX value with zero AI cost** and works the moment
ingestion has run.

### 4.2 Focused vision Q&A (AI, interactive)

For questions the registry can't answer — *"what feeds CB-12?"*, *"trace this
24VDC net"* — send a **small, targeted** vision call:

- Image(s): the component's tile + its immediate neighbors when the question
  implies following a wire across a tile edge (the overlap usually makes one
  tile enough). Never the whole sheet — same resolution rule as ingestion.
- Context: the component row, its known `connectsTo`, the sheet/zone metadata.
- Output: structured — `{"answer", "pathTags": [...], "confidence",
  "needsAdjacentTile": bool}`. If `needsAdjacentTile`, the server fetches the
  neighbor and re-asks once (bounded loop, max 3 tiles per question).
- Same guardrail contract as ingestion: legibility-honest, no guessing, tags
  cross-checked against the registry before display (unknown tags rendered as
  "unverified ⚠" — see Pillar 4).

### 4.3 UI placement

In `/equipment/[assetId]/troubleshoot`, each diagnosis card that has matched
components gains a "View on schematic" expander (crop + highlight). A separate
"Ask about this schematic" input appears only when the engine is enabled —
gated by `ingestionReady()`, mirroring how the module reports engine status
today.

---

## 5. Pillar 4 — Guardrailed troubleshooting generation

The AI's job: synthesize the evidence pack into a ranked, *actionable* guide —
not to free-associate about machinery.

### 5.1 The generation contract (system prompt, cached)

The system block is static (cacheable) and encodes the rules:

1. **Grounding:** *"You may only reference guides, history cases, components,
   and document passages provided in the evidence pack, by their IDs. If the
   evidence does not support a diagnosis, say so and recommend escalation —
   do not invent causes."*
2. **Component honesty:** *"Only name component tags present in the evidence
   pack. Never invent a tag."*
3. **Safety framing:** *"Diagnostic steps are for qualified maintenance
   personnel. Any step touching electrical, hydraulic, pneumatic or stored-
   energy systems MUST begin with isolation and verification of zero energy
   (LOTO). Never instruct measurement on live equipment unless the step is
   explicitly a qualified live-test, and then say so with the required PPE."*
4. **Uncertainty:** *"Every cause carries `confidence` (0–1) reflecting
   evidence strength: verified-history matches > curated guides > manual
   passages > schematic inference."*
5. **Output shape:** structured outputs schema (below). No prose outside it.

### 5.2 Output schema (structured outputs — guarantees parseability)

```json
{
  "diagnoses": [{
    "cause": "Spindle drive overcurrent — worn spindle bearing loading the motor",
    "confidence": 0.78,
    "evidence": [ {"kind":"HISTORY","id":"CMRF-2026-0007"},
                  {"kind":"GUIDE","id":"dg_…"},
                  {"kind":"DOC","id":"chunk_…","page":41} ],
    "componentTags": ["SD-1","CB-12"],
    "safetyPrerequisites": ["PTW required","LOTO spindle drive","Verify zero energy"],
    "steps": [{"order":1,"action":"…","expected":"…","ifNot":"…"}],
    "escalateIf": "…"
  }],
  "insufficientEvidence": false,
  "notes": "…"
}
```

### 5.3 The validation layer (code between model and screen)

Every response passes through `validateDiagnosis()` before rendering:

| Check | Action on failure |
|---|---|
| Schema parse (guaranteed by structured outputs, belt-and-braces anyway) | discard, show deterministic results only |
| Every `evidence.id` exists in the evidence pack we sent | strip the claim; if a diagnosis loses all evidence → drop it |
| Every `componentTag` exists in `component_registry` for this machine | tag rendered with "unverified ⚠" badge; never silently trusted |
| `safetyPrerequisites` non-empty when steps touch E/H/P systems (keyword lint) | inject the standard LOTO prerequisite ourselves |
| `confidence` < 0.4 | render in a collapsed "low confidence" section |
| `stop_reason` check (`refusal`, `max_tokens`) before reading content | degrade to deterministic results |

### 5.4 Safety gating is enforced by the CMS, not the prose

The words in `safetyPrerequisites` are informational. The *enforcement* already
exists in the system and stays authoritative: work orders link permits, and PM
completion is **blocked server-side (409)** unless the linked PTW is ACTIVE.
The troubleshoot UI links "Raise Work Order" / "Raise PTW" next to any
diagnosis with safety prerequisites — funneling the technician into the
enforced flow instead of treating chat output as authorization.

### 5.5 Labeling, audit, and feedback

- **Labeling:** AI cards are visually distinct and titled "AI-assisted analysis
  — verify before acting", separate from the deterministic engine's cards.
  ISO auditors must be able to tell which is which; so must technicians.
- **Audit:** every generation writes an `audit_log` row (`action: "AI_DIAGNOSE"`,
  entity = equipment, description = query) plus a stored record of {model,
  input token count, output token count, evidence-pack IDs, raw response} —
  same verbatim-storage principle as `extractedData`.
- **Feedback:** the existing learning loop (`POST /diagnose` → `successCount`
  reinforcement / new guide creation) applies to AI-assisted resolutions too —
  when a technician marks an AI diagnosis as the fix, it graduates into a
  curated `diagnostic_guide` (with the human as author), which the
  *deterministic* engine then serves forever after. **The AI's wins get
  captured as deterministic knowledge** — flywheel, and progressively less AI
  dependence for repeat faults.

### 5.6 Abuse/cost guardrails

- Role-gated: interactive AI endpoints require an authenticated maintenance
  role (same `requireRoles` pattern as every mutating route).
- Rate limit per user (e.g. 10 AI questions/hour) + per-day org token budget in
  `app_settings`; exceeded → deterministic-only with a visible notice.
- `max_tokens` bounded per call class (overview 2K, tile 3K, generation 4K,
  vision-QA 1.5K).
- All bulk work through the Batches API; interactive calls stream.

---

## 6. Data & privacy

- OEM schematics are proprietary. They leave our infrastructure only as API
  request payloads. Anthropic API data-retention policies apply (standard
  30-day operational retention; not used for training). If LIMSL governance
  requires stricter handling later, the provider abstraction
  (`SchematicProvider`) lets us swap self-hosted OCR for the extraction stage
  without touching the pipeline.
- `ANTHROPIC_API_KEY` lives only in env (`.env.local` / Vercel env), never in
  the repo — existing hard rule.
- Tile crops and renders live in the private Supabase bucket, served only
  through the auth-gated `/api/files` route.

---

## 7. Phased implementation plan

| Phase | Scope | Needs API key? |
|---|---|---|
| **P0** | Text-document path: `document_chunks` + local extraction + Postgres FTS; retrieval upgrade in `/diagnose` (evidence pack incl. manual passages, deterministic only) | **No** |
| **P1** | Schematic preprocessing: render + overview-less geometric tiling + `schematic_tiles` + crop storage + "View on schematic" UX (registry entries entered manually still get crops via zone math) | **No** |
| **P2** | AI extraction: overview pass + per-tile extraction + merge + review UI → registry. Batch-driven bulk ingestion of all 33 machines' schematics | Yes |
| **P3** | Guardrailed generation: evidence pack → structured diagnosis card + validation layer + audit + feedback graduation | Yes |
| **P4** | Interactive vision Q&A on tiles; optional pgvector hybrid retrieval; optional query-rewrite | Yes |

P0 and P1 are pure-code phases that make the module substantially better
**now** and make P2 a drop-in. Each phase is additive (new tables via
`drizzle-kit`, no destructive changes) and independently shippable.

---

## 8. API quick reference (for implementation)

- Model: `claude-opus-4-8` (already the config default). Adaptive thinking:
  `thinking: { type: "adaptive" }`. No `temperature` (rejected on 4.8).
- Vision: `{ type:"image", source:{ type:"base64", media_type:"image/png", data } }`
  content blocks; max edge 2576 px; tokens ≈ `w×h/750`.
- Structured outputs: `output_config: { format: { type:"json_schema", schema } }`
  (TS helper: `client.messages.parse` + `zodOutputFormat`). Schemas need
  `additionalProperties: false`; no recursion; SDK strips unsupported
  constraints and validates client-side.
- Do **not** combine `citations: {enabled}` with structured outputs (400) —
  we don't need citations; provenance is pipeline-computed (§0.2).
- Batches: `client.messages.batches.create({ requests:[{custom_id, params}…] })`,
  poll `processing_status === "ended"`, stream results, key by `custom_id`
  (results arrive unordered). 50% price. Perfect fit: tile extraction.
- Prompt caching: `cache_control: { type:"ephemeral" }` on the static system
  contract block; verify hits via `usage.cache_read_input_tokens`.
- Always check `stop_reason` before reading content; handle `refusal` and
  `max_tokens` by degrading to deterministic results.
- SDK: `npm i @anthropic-ai/sdk` — added only when P2 begins (hard rule: the
  engine stays disabled until then; `ClaudeProvider` stub throws today by
  design).

---

## 9. What already exists → what gets built

| Exists today (keep) | Built per this guide |
|---|---|
| `diagnose()` heuristic engine + learning loop | Evidence-pack assembly around it |
| `schematic_ingestion_jobs` + status flow | `progress` cursor, RENDERING/TILING/EXTRACTING stages |
| `SchematicProvider` abstraction + `ClaudeProvider` stub | Real `extract()` = overview + tiles + merge |
| `pdfKind` on documents | Auto-detection on upload |
| `component_registry`, `schematicReference` | Populated via review flow; + merged bbox fields |
| Storage abstraction + auth-gated `/api/files` | Tile/render storage keys |
| `requireRoles`, audit log, app_settings | AI gating, AI audit rows, token budgets |
| — | `document_chunks`, `schematic_tiles` tables (additive) |
