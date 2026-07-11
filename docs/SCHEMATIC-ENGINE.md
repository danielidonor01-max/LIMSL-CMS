# Schematic Ingestion & Diagnostic Engine — Enablement Guide

The in‑app **diagnostic engine** (`/equipment/[assetId]/troubleshoot`) is live today and
reasons over structured data: the component registry (BOM), diagnostic guides, and
RCA/corrective history. See `src/lib/diagnostics/engine.ts`.

The **schematic ingestion** layer — read a PDF schematic, extract components + wiring +
zones, and auto‑pair them to the machine's BOM — is **scaffolded but OFF**. This document
explains what's in place and how to turn it on when we're ready (no Claude subscription yet).

## What is already in place (disabled)

- **DB**
  - `equipment_documents.pdfKind` — `TEXT_SELECTABLE | IMAGE_ONLY | UNKNOWN`. Text‑selectable
    PDFs extract far more accurately than scanned images; mark each schematic accordingly.
  - `schematic_ingestion_jobs` — the queue (status `PENDING → QUEUED → PROCESSING →
    NEEDS_REVIEW → CONFIRMED / FAILED`), with `extractedData` JSON and a `provider` column.
- **Config / flags** — `src/lib/config.ts` reads:
  - `SCHEMATIC_INGESTION_ENABLED` (`true` to enable)
  - `SCHEMATIC_INGESTION_PROVIDER` (`NONE | ANTHROPIC | DOCUMENT_AI | MANUAL`)
  - `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` (default `claude-opus-4-8`)
- **Provider abstraction** — `src/lib/diagnostics/ingestion/`
  - `provider.ts` — `SchematicProvider` interface + `NullProvider` (throws "not configured")
  - `claude.ts` — `ClaudeProvider` **stub** (no SDK dependency yet)
  - `worker.ts` — `getProvider()` + `processPendingJobs()` (no‑op while disabled)
- **API** — `POST /api/equipment/[assetId]/schematics/ingest` enqueues jobs;
  `GET` returns engine status + jobs. While disabled it queues jobs and reports the reason.

## How to enable (future)

1. **Get a schematic in.** Prefer **text‑selectable** PDFs; native **CAD/EPLAN** exports
   (with a netlist) are best. Mark `pdfKind` on the document.
2. **Add the provider dependency:** `npm i @anthropic-ai/sdk`.
3. **Implement `ClaudeProvider.extract()`** in `src/lib/diagnostics/ingestion/claude.ts`:
   send the PDF as a `document` content block, force structured JSON output
   (`output_config.format`) matching `ExtractionResult`, and enable page‑level citations so
   each component cites its sheet. Recommended model: `claude-opus-4-8`.
4. **Set env** in `.env.local`:
   ```
   SCHEMATIC_INGESTION_ENABLED=true
   SCHEMATIC_INGESTION_PROVIDER=ANTHROPIC
   ANTHROPIC_API_KEY=sk-ant-...
   ```
5. **Process jobs** — call `processPendingJobs()` from a cron/queue (BullMQ + Redis) or an
   admin action. Extracted components land in `NEEDS_REVIEW`; a technician confirms them,
   which then populates `component_registry` (tag → sheet/zone) that the engine already uses.

## Accuracy levers (for later)

- Native CAD/EPLAN netlists > vector (text) PDFs > scanned images.
- Human‑in‑the‑loop confirmation (feeds the engine's existing learning loop).
- Document AI (Azure / AWS Textract / Google) for degraded scans & BOM tables.
- RAG grounding (Postgres + pgvector) across schematics + manuals + history.
- **Privacy:** OEM schematics are proprietary — use zero‑data‑retention options or
  self‑hosted OCR if governance requires it.
