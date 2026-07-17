// src/lib/notifications/whatsapp.ts
// WhatsApp delivery adapters. Isolated so the dispatcher stays provider-agnostic.
// Callers should only reach here when whatsappReady() is true.
//
// IMPORTANT (Meta): the Cloud API only allows proactive, business-initiated
// messages via a PRE-APPROVED template. The template named by WHATSAPP_TEMPLATE
// must take exactly one body parameter {{1}}, which we fill with the alert text.
// Approve it in Meta Business Manager before enabling delivery.
import { config } from "@/lib/config";

export type SendResult = { ok: boolean; messageId?: string; error?: string };

// Normalise a stored number to E.164 digits (no +, no spaces) for the API.
function toMsisdn(raw: string): string {
  return raw.replace(/[^\d]/g, "");
}

export async function sendWhatsApp(to: string, text: string): Promise<SendResult> {
  if (config.whatsappProvider === "TWILIO") return sendViaTwilio(to, text);
  return sendViaMeta(to, text);
}

async function sendViaMeta(to: string, text: string): Promise<SendResult> {
  const url = `https://graph.facebook.com/${config.whatsappApiVersion}/${config.whatsappPhoneNumberId}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    to: toMsisdn(to),
    type: "template",
    template: {
      name: config.whatsappTemplate,
      language: { code: config.whatsappTemplateLang },
      components: [{ type: "body", parameters: [{ type: "text", text }] }],
    },
  };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.whatsappToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: data?.error?.message ?? `HTTP ${res.status}` };
    }
    return { ok: true, messageId: data?.messages?.[0]?.id };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

async function sendViaTwilio(to: string, text: string): Promise<SendResult> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${config.twilioAccountSid}/Messages.json`;
  const form = new URLSearchParams({
    From: config.twilioWhatsappFrom,
    To: `whatsapp:+${toMsisdn(to)}`,
    Body: text,
  });
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization:
          "Basic " + Buffer.from(`${config.twilioAccountSid}:${config.twilioAuthToken}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.message ?? `HTTP ${res.status}` };
    return { ok: true, messageId: data?.sid };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
