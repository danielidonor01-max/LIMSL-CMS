// src/lib/diagnostics/ingestion/claude.ts
// Anthropic Claude schematic-understanding provider — SCAFFOLD ONLY.
//
// Not active yet (no Claude subscription). When enabled, this is where we:
//   1. install `@anthropic-ai/sdk`
//   2. send the schematic PDF as a `document` content block (Claude reads PDFs
//      natively — text layer + rendered images; high-res vision for dense sheets)
//   3. force structured JSON output (output_config.format) matching ExtractionResult
//   4. use page-level citations so each component cites its sheet
// Recommended model: claude-opus-4-8.
//
// Kept dependency-free on purpose: it throws until wired, so nothing ships a
// half-configured API call.

import type { SchematicProvider, ExtractionResult } from "./provider";

export class ClaudeProvider implements SchematicProvider {
  readonly name = "ANTHROPIC";
  constructor(private apiKey: string, private model: string) {}

  async extract(): Promise<ExtractionResult> {
    // Intentionally not implemented until the Anthropic subscription + SDK are in place.
    throw new Error(
      "ClaudeProvider is scaffolded but not implemented — install @anthropic-ai/sdk and wire the PDF→structured-JSON call. See docs/SCHEMATIC-ENGINE.md.",
    );
  }
}
