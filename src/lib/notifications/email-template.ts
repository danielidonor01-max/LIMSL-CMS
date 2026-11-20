// src/lib/notifications/email-template.ts
// The one layout every email from the system is sent in (LIMSL, 20 Nov 2026).
//
// It was a bare heading, a paragraph and a button. This is a letter: the
// company mark at the head, what the message is about, what to do, and who
// sent it. Built the way mail clients need it, which is not the way a web page
// is built: tables for layout, every style inline, no web fonts, a fixed
// 600px column, and a bulletproof button that Outlook draws as a rectangle
// rather than dropping. Pure, so the layout is tested without a mail server.

export type EmailContent = {
  title: string;
  body: string;
  /** Absolute URL the button opens. */
  link?: string | null;
  /** Base URL of the app, for the logo. */
  appUrl?: string | null;
};

const BRAND = "#059669";
const INK = "#111410";
const TEXT = "#3b3f3a";
const MUTED = "#6f726e";
const LINE = "#e4e5e1";
const CANVAS = "#f4f5f2";
const FONT = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]])/g;

// Paragraphs from blank lines, line breaks from single ones, and a typed link
// made clickable. Escaped first: nothing in a message body is trusted as HTML.
function paragraphs(body: string): string {
  return body
    .trim()
    .split(/\n{2,}/)
    .map((p) => {
      const html = escapeHtml(p.trim())
        .replace(URL_RE, (u) => `<a href="${u}" style="color:${BRAND};text-decoration:underline;word-break:break-all">${u}</a>`)
        .replace(/\n/g, "<br>");
      return `<p style="margin:0 0 14px;font-family:${FONT};font-size:15px;line-height:1.6;color:${TEXT}">${html}</p>`;
    })
    .join("");
}

/** The first line of the body, shown by the inbox beside the subject. */
export function previewText(body: string): string {
  return body.replace(URL_RE, "").replace(/\s+/g, " ").trim().slice(0, 110);
}

export function renderEmailHtml({ title, body, link, appUrl }: EmailContent): string {
  const base = (appUrl ?? "").replace(/\/$/, "");
  const safeLink = link ? escapeHtml(link) : null;
  const logo = base
    ? `<img src="${escapeHtml(base)}/brand/logo-80.png" width="36" height="36" alt="" style="display:block;border:0;outline:none;width:36px;height:36px">`
    : "";
  const button = safeLink
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:10px 0 6px">
            <tr>
              <td align="center" bgcolor="${BRAND}" style="border-radius:8px">
                <a href="${safeLink}" target="_blank" style="display:inline-block;padding:12px 22px;font-family:${FONT};font-size:14px;font-weight:600;line-height:1;color:#ffffff;text-decoration:none;border-radius:8px">Open in LIMSL CMS</a>
              </td>
            </tr>
          </table>
          <p style="margin:14px 0 0;font-family:${FONT};font-size:12px;line-height:1.5;color:${MUTED}">If the button does not work, copy this address into your browser:<br><a href="${safeLink}" style="color:${MUTED};text-decoration:underline;word-break:break-all">${safeLink}</a></p>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:${CANVAS}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${CANVAS}">${escapeHtml(previewText(body))}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${CANVAS}" style="background:${CANVAS}">
  <tr>
    <td align="center" style="padding:28px 12px">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px">
        <tr>
          <td bgcolor="${INK}" style="background:${INK};padding:18px 28px;border-radius:12px 12px 0 0">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                ${logo ? `<td style="padding-right:12px;vertical-align:middle">${logo}</td>` : ""}
                <td style="vertical-align:middle">
                  <p style="margin:0;font-family:${FONT};font-size:15px;font-weight:700;line-height:1.2;color:#ffffff">LIMSL CMS</p>
                  <p style="margin:3px 0 0;font-family:${FONT};font-size:12px;line-height:1.3;color:#a9ada8">LEE International Machinery and Services Limited</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td bgcolor="${BRAND}" style="background:${BRAND};height:3px;line-height:3px;font-size:0">&nbsp;</td>
        </tr>
        <tr>
          <td bgcolor="#ffffff" style="background:#ffffff;padding:30px 28px 26px;border-left:1px solid ${LINE};border-right:1px solid ${LINE}">
            <h1 style="margin:0 0 16px;font-family:${FONT};font-size:20px;font-weight:700;line-height:1.3;color:${INK}">${escapeHtml(title)}</h1>
            ${paragraphs(body)}
            ${button}
          </td>
        </tr>
        <tr>
          <td bgcolor="#ffffff" style="background:#ffffff;padding:16px 28px 20px;border:1px solid ${LINE};border-top:1px solid ${LINE};border-radius:0 0 12px 12px">
            <p style="margin:0;font-family:${FONT};font-size:12px;line-height:1.6;color:${MUTED}">Sent by the LIMSL maintenance management system. This mailbox is not read, so please do not reply. To change which messages you receive, open Account settings in the system.</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

export function renderEmailText({ title, body, link }: EmailContent): string {
  return `${title}\n\n${body.trim()}${link ? `\n\nOpen in LIMSL CMS: ${link}` : ""}\n\nSent by the LIMSL maintenance management system. Please do not reply to this email.`;
}
