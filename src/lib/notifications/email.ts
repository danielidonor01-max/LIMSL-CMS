// src/lib/notifications/email.ts
// SMTP email delivery via nodemailer. Provider-agnostic — the same code sends
// through Google Workspace, Microsoft 365, cPanel/webmail, or a transactional
// relay (Resend/SendGrid SMTP). Credentials come from env (see config.ts).
import nodemailer, { type Transporter } from "nodemailer";
import { config } from "@/lib/config";

export type SendResult = { ok: boolean; messageId?: string; error?: string };

let transporter: Transporter | null = null;
function getTransport(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure, // 465 → true; 587/25 → false (STARTTLS)
      auth: { user: config.smtpUser, pass: config.smtpPass },
    });
  }
  return transporter;
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

// Providers answer auth failures with cryptic codes; translate the common ones
// into what the admin should actually check. The raw message is kept after the
// hint so nothing is hidden.
function explainSmtpError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (/535|BadCredentials|Username and Password not accepted/i.test(raw)) {
    return (
      "Gmail rejected the username/password. Check: (1) SMTP_PASS must be a 16-character App Password " +
      "(Google Account → Security → 2-Step Verification → App passwords), NOT your normal Gmail password; " +
      "(2) paste it without quotes; (3) SMTP_USER must be the exact address that created the App Password; " +
      "(4) after changing a Vercel env var you must redeploy. Raw: " + raw
    );
  }
  if (/534|application-specific password|InvalidSecondFactor/i.test(raw)) {
    return (
      "Gmail requires an App Password for SMTP (2-Step Verification must be ON, then Google Account → " +
      "Security → App passwords). Your normal password will never work here. Raw: " + raw
    );
  }
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(raw)) {
    return `SMTP_HOST could not be resolved — check the hostname (smtp.gmail.com for Gmail). Raw: ${raw}`;
  }
  if (/ETIMEDOUT|ECONNREFUSED|ESOCKET/i.test(raw)) {
    return `Could not reach the SMTP server — check SMTP_PORT (587 with SMTP_SECURE=false, or 465 with true). Raw: ${raw}`;
  }
  return raw;
}

// Verify the SMTP connection/credentials without sending — used by the test button.
export async function verifyEmail(): Promise<SendResult> {
  try {
    await getTransport().verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: explainSmtpError(err) };
  }
}

export async function sendEmail(to: string, title: string, body: string, linkPath?: string | null): Promise<SendResult> {
  try {
    const base = config.appUrl.replace(/\/$/, "");
    const link = linkPath && base ? `${base}${linkPath}` : null;
    const text = `${body}${link ? `\n\nOpen: ${link}` : ""}\n\n— LIMSL CMS`;
    const html = `<div style="font-family:system-ui,-apple-system,Arial,sans-serif;color:#0f172a;max-width:560px">
      <h2 style="margin:0 0 10px;font-size:16px">${escapeHtml(title)}</h2>
      <p style="white-space:pre-line;font-size:14px;line-height:1.5;color:#334155;margin:0 0 16px">${escapeHtml(body)}</p>
      ${link ? `<p style="margin:0 0 16px"><a href="${link}" style="display:inline-block;background:#059669;color:#fff;padding:9px 16px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600">Open in LIMSL CMS</a></p>` : ""}
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0"/>
      <p style="font-size:11px;color:#94a3b8;margin:0">LIMSL CMS — automated maintenance notification. Please do not reply to this email.</p>
    </div>`;
    const info = await getTransport().sendMail({
      from: config.emailFrom,
      to,
      subject: `[LIMSL CMS] ${title}`,
      text,
      html,
    });
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    return { ok: false, error: explainSmtpError(err) };
  }
}
