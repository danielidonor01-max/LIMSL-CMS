// src/lib/config.ts
// Central feature flags / runtime config. The schematic-ingestion engine is
// scaffolded but OFF until an AI provider is configured (no Claude subscription
// yet) — see docs/SCHEMATIC-ENGINE.md.

function normalizeSmtpPass(raw: string): string {
  const v = raw.trim();
  return /^[a-z]{4} [a-z]{4} [a-z]{4} [a-z]{4}$/i.test(v) ? v.replace(/ /g, "") : v;
}

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

  // ── Email notifications (SMTP via nodemailer) ─────────────────────────────
  // Works with any mailbox that offers SMTP — Google Workspace, Microsoft 365,
  // cPanel/webmail on leemachinery.net, or a transactional relay (Resend/SendGrid).
  emailEnabled: process.env.EMAIL_ENABLED === "true",
  emailFrom: process.env.EMAIL_FROM || "LIMSL CMS <no-reply@leemachinery.net>",
  appUrl: process.env.APP_URL || "", // base URL for deep links in emails
  smtpHost: process.env.SMTP_HOST || "",
  smtpPort: Number(process.env.SMTP_PORT || 587),
  smtpSecure: process.env.SMTP_SECURE === "true", // true for port 465, false for 587/25 (STARTTLS)
  smtpUser: (process.env.SMTP_USER || "").trim(),
  // Google shows App Passwords as "xxxx xxxx xxxx xxxx"; pasted WITH the spaces
  // Gmail rejects the login (535 BadCredentials). Strip the spaces only when the
  // value matches that exact shape, so real passwords containing spaces on other
  // providers are never touched.
  smtpPass: normalizeSmtpPass(process.env.SMTP_PASS || ""),

  // ── File storage ────────────────────────────────────────────────────────
  // LOCAL (default) writes to a gitignored folder on the server — right for a
  // single self-hosted workshop machine. SUPABASE stores in cloud object
  // storage — right for a hosted/multi-site deploy. Same interface either way.
  storageProvider: (process.env.STORAGE_PROVIDER || "LOCAL").toUpperCase(), // LOCAL | SUPABASE
  storageLocalDir: process.env.STORAGE_LOCAL_DIR || "storage/uploads",
  storageMaxBytes: Number(process.env.STORAGE_MAX_BYTES || 26_214_400), // 25 MB
  // Supabase Storage (cloud) — REST, no SDK needed.
  supabaseUrl: process.env.SUPABASE_URL || "",
  supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY || "",
  supabaseBucket: process.env.SUPABASE_BUCKET || "limsl-documents",
};

// Whether the selected cloud storage provider is fully configured. LOCAL is
// always ready. When a cloud provider is selected but not configured, uploads
// fail loudly rather than silently dropping files.
export function storageReady(): { ready: boolean; reason?: string } {
  if (config.storageProvider === "LOCAL") return { ready: true };
  if (config.storageProvider === "SUPABASE") {
    if (!config.supabaseUrl || !config.supabaseServiceKey)
      return { ready: false, reason: "SUPABASE_URL / SUPABASE_SERVICE_KEY not set" };
    return { ready: true };
  }
  return { ready: false, reason: `Unknown STORAGE_PROVIDER "${config.storageProvider}"` };
}

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

// Whether SMTP email delivery is configured. When not ready, notifications are
// still recorded in-app (QUEUED), never faked as sent.
export function emailReady(): { ready: boolean; reason?: string } {
  if (!config.emailEnabled) return { ready: false, reason: "EMAIL_ENABLED is not set to true" };
  if (!config.smtpHost) return { ready: false, reason: "SMTP_HOST is not set" };
  if (!config.smtpUser || !config.smtpPass) return { ready: false, reason: "SMTP_USER / SMTP_PASS not set" };
  return { ready: true };
}
