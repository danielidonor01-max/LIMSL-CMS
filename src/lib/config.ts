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

  // ── WhatsApp notifications ──────────────────────────────────────────────
  // Alerts are always recorded (outbox + in-app inbox); WhatsApp delivery
  // happens on top when configured. Email is a later phase.
  whatsappEnabled: process.env.WHATSAPP_ENABLED === "true",
  whatsappProvider: (process.env.WHATSAPP_PROVIDER || "META").toUpperCase(), // META | TWILIO
  // Meta WhatsApp Cloud API
  whatsappToken: process.env.WHATSAPP_TOKEN || "",
  whatsappPhoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || "",
  whatsappApiVersion: process.env.WHATSAPP_API_VERSION || "v21.0",
  // Meta requires a pre-approved template for proactive (business-initiated)
  // messages. This template must take exactly one body parameter {{1}} which we
  // fill with the alert text. Approve it in Meta Business Manager first.
  whatsappTemplate: process.env.WHATSAPP_TEMPLATE || "limsl_alert",
  whatsappTemplateLang: process.env.WHATSAPP_TEMPLATE_LANG || "en",
  // Twilio (alternative provider)
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || "",
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || "",
  twilioWhatsappFrom: process.env.TWILIO_WHATSAPP_FROM || "", // e.g. whatsapp:+14155238886
};

export function ingestionReady(): { ready: boolean; reason?: string } {
  if (!config.schematicIngestionEnabled) return { ready: false, reason: "SCHEMATIC_INGESTION_ENABLED is not set to true" };
  if (config.ingestionProvider === "NONE") return { ready: false, reason: "No SCHEMATIC_INGESTION_PROVIDER configured" };
  if (config.ingestionProvider === "ANTHROPIC" && !config.anthropicApiKey)
    return { ready: false, reason: "ANTHROPIC_API_KEY is not set" };
  return { ready: true };
}

// Whether WhatsApp delivery is actually wired up. When not ready, notifications
// are still recorded and shown in-app — they are just marked QUEUED, never faked
// as sent.
export function whatsappReady(): { ready: boolean; reason?: string } {
  if (!config.whatsappEnabled) return { ready: false, reason: "WHATSAPP_ENABLED is not set to true" };
  if (config.whatsappProvider === "META") {
    if (!config.whatsappToken) return { ready: false, reason: "WHATSAPP_TOKEN is not set" };
    if (!config.whatsappPhoneNumberId) return { ready: false, reason: "WHATSAPP_PHONE_NUMBER_ID is not set" };
    return { ready: true };
  }
  if (config.whatsappProvider === "TWILIO") {
    if (!config.twilioAccountSid || !config.twilioAuthToken || !config.twilioWhatsappFrom)
      return { ready: false, reason: "Twilio credentials are not fully set" };
    return { ready: true };
  }
  return { ready: false, reason: `Unknown WHATSAPP_PROVIDER "${config.whatsappProvider}"` };
}
