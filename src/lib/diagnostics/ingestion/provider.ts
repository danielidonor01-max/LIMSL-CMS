// src/lib/diagnostics/ingestion/provider.ts
// Provider abstraction for schematic understanding. Implementations turn a
// schematic PDF into structured components/nets/zones. Only the NullProvider is
// active today; a real provider (Anthropic Claude vision, Azure/AWS/Google
// Document AI, or a CAD/EPLAN parser) is plugged in later behind config flags.

export type ExtractedComponent = {
  componentTag: string;
  name?: string;
  type?: string; // ELECTRICAL | HYDRAULIC | PNEUMATIC | CONTROL | MECHANICAL
  sheet?: string;
  zone?: string;
  connectsTo?: string[]; // component tags or net labels
};

export type ExtractionResult = {
  components: ExtractedComponent[];
  nets?: { label: string; members: string[] }[];
  notes?: string;
  provider: string;
};

export interface SchematicProvider {
  readonly name: string;
  /** Extract structured data from a schematic PDF (base64 or URL). */
  extract(input: { fileUrl?: string; base64?: string; pdfKind?: string }): Promise<ExtractionResult>;
}

// Disabled provider — returned whenever the engine isn't configured.
export class NullProvider implements SchematicProvider {
  readonly name = "NONE";
  async extract(): Promise<ExtractionResult> {
    throw new Error(
      "Schematic ingestion is not configured. Enable it via SCHEMATIC_INGESTION_ENABLED + a provider (see docs/SCHEMATIC-ENGINE.md).",
    );
  }
}
