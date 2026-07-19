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

// Verify the SMTP connection/credentials without sending — used by the test button.
export async function verifyEmail(): Promise<SendResult> {
  try {
    await getTransport().verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
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
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
