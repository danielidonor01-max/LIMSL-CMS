// src/lib/config.ts
// Central feature flags / runtime config. The schematic-ingestion engine is
// scaffolded but OFF until an AI provider is configured (no Claude subscription
// yet) — see docs/SCHEMATIC-ENGINE.md.

export const config = {
  // Master switch for the AI schematic-ingestion engine.
  schematicIngestionEnabled: process.env.SCHEMATIC_INGESTION_ENABLED === "true",

  // Which extraction provider to use once enabled.
  //   NONE (default) | ANTHROPIC | DOCUMENT_AI | MANUAL
  ingestionProvider: (process.env.SCHEMATIC_INGESTION_PROVIDER || "NONE").toUpperCase(),

  // Credentials (unset for now; wired here so the future engine finds them).
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
  anthropicModel: process.env.ANTHROPIC_MODEL || "claude-opus-4-8",
};

export function ingestionReady(): { ready: boolean; reason?: string } {
  if (!config.schematicIngestionEnabled) return { ready: false, reason: "SCHEMATIC_INGESTION_ENABLED is not set to true" };
  if (config.ingestionProvider === "NONE") return { ready: false, reason: "No SCHEMATIC_INGESTION_PROVIDER configured" };
  if (config.ingestionProvider === "ANTHROPIC" && !config.anthropicApiKey)
    return { ready: false, reason: "ANTHROPIC_API_KEY is not set" };
  return { ready: true };
}
