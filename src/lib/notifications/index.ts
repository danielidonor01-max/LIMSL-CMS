// src/lib/notifications/index.ts
import nodemailer from "nodemailer";

// Simple Nodemailer Transporter Configuration (SMTP)
// In production, load these from environment variables
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.mailtrap.io",
  port: parseInt(process.env.SMTP_PORT || "2525"),
  auth: {
    user: process.env.SMTP_USER || "user",
    pass: process.env.SMTP_PASS || "pass",
  },
});

export async function sendEmailNotification(to: string, subject: string, text: string, html?: string) {
  console.log(`✉️ Mock Email Notification queued to: ${to}`);
  try {
    const info = await transporter.sendMail({
      from: '"LIMSL CMS" <no-reply@limsl.com>',
      to,
      subject,
      text,
      html: html || `<p>${text}</p>`,
    });
    console.log("✅ Email sent successfully:", info.messageId);
    return true;
  } catch (error) {
    console.warn("⚠️ Nodemailer failed (running in offline/mock mode):", error);
    return false;
  }
}

export async function sendWhatsAppNotification(to: string, text: string) {
  console.log(`💬 Mock WhatsApp Notification queued to: ${to}`);
  // In production:
  // fetch("https://graph.facebook.com/v17.0/YOUR_PHONE_NUMBER_ID/messages", {
  //   method: "POST",
  //   headers: { "Authorization": `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
  //   body: JSON.stringify({ ... })
  // });
  console.log(`[WhatsApp API Dispatch] Message: "${text}" successfully routed to target node: ${to}`);
  return true;
}

// Trigger Event: Critical Breakdown
export async function triggerBreakdownNotification(assetId: string, name: string, fault: string) {
  const subject = `⚠️ CRITICAL BREAKDOWN: ${name} (${assetId})`;
  const text = `A critical machinery breakdown was logged for ${name} (${assetId}). Fault details: ${fault}. Please review action logs immediately.`;
  
  // Notify Maintenance Supervisor (Kingsley Iworah)
  await sendEmailNotification("kingsley.iworah@limsl.com", subject, text);
  await sendWhatsAppNotification("+2348000000000", `*LIMSL CMS Alert*:\n\n${text}`);
}

// Trigger Event: WMS Approval Request
export async function triggerWmsApprovalNotification(wmsNumber: string, title: string, role: "REVIEWER" | "APPROVER") {
  const subject = `📋 WMS PENDING ${role}: ${wmsNumber}`;
  const text = `Work Method Statement "${title}" (${wmsNumber}) is pending your signature stamp as ${role.toLowerCase()}. Please log in to complete closeout.`;
  
  if (role === "REVIEWER") {
    await sendEmailNotification("kenneth.aloziem@limsl.com", subject, text);
    await sendWhatsAppNotification("+2348000000000", `*LIMSL CMS WMS Alert*:\n\n${text}`);
  } else {
    await sendEmailNotification("osaghale.ikpea@limsl.com", subject, text);
    await sendWhatsAppNotification("+2348000000000", `*LIMSL CMS WMS Alert*:\n\n${text}`);
  }
}
