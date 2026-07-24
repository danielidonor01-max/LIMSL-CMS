// src/app/api/notifications/test/route.ts
// Email delivery diagnostics for a Super Admin — all three without exposing
// secrets:
//   GET               → readiness status + masked config (is SMTP configured?)
//   POST {verifyOnly} → open the SMTP connection & auth, without sending
//   POST {to}         → send a real test message
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireRoles } from "@/lib/authz";
import { SETTINGS_WRITE_ROLES } from "@/lib/roles";
import { config, emailReady } from "@/lib/config";
import { sendEmail, verifyEmail } from "@/lib/notifications/email";

// Never returns passwords — only whether each field is present + safe metadata.
function status() {
  const ready = emailReady();
  return {
    ready: ready.ready,
    reason: ready.reason ?? null,
    enabled: config.emailEnabled,
    from: config.emailFrom,
    host: config.smtpHost || null,
    port: config.smtpPort,
    secure: config.smtpSecure,
    hasUser: !!config.smtpUser,
    hasPass: !!config.smtpPass,
    appUrlSet: !!config.appUrl,
  };
}

export async function GET() {
  const gate = await requireRoles(SETTINGS_WRITE_ROLES);
  if (gate.res) return gate.res;
  return NextResponse.json(status());
}

export async function POST(request: Request) {
  const gate = await requireRoles(SETTINGS_WRITE_ROLES);
  if (gate.res) return gate.res;

  const ready = emailReady();
  if (!ready.ready) {
    return NextResponse.json({ error: `Email is not configured — ${ready.reason}.` }, { status: 400 });
  }

  let body: { to?: string; verifyOnly?: boolean } = {};
  try {
    body = await request.json();
  } catch {
    // no body — treat as a send to the admin's own address
  }

  // Connection/credential check only — proves SMTP is reachable and auth works.
  if (body.verifyOnly) {
    const res = await verifyEmail();
    if (!res.ok) return NextResponse.json({ error: `Connection failed: ${res.error}` }, { status: 502 });
    return NextResponse.json({ ok: true, verified: true });
  }

  let to = String(body?.to || "").trim();
  if (!to && gate.actor?.id) {
    const [u] = await db.select().from(users).where(eq(users.id, gate.actor.id)).limit(1);
    to = u?.email || "";
  }
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return NextResponse.json({ error: "Enter a valid recipient email address." }, { status: 400 });
  }

  const res = await sendEmail(
    to,
    "Test notification",
    "This is a test email from LIMSL CMS.\n\nIf you received it, email delivery is working — maintenance reminders, overdue escalations and sign-off requests will reach your inbox.",
    "/notifications",
  );
  if (!res.ok) {
    return NextResponse.json({ error: `Send failed: ${res.error}` }, { status: 502 });
  }
  return NextResponse.json({ ok: true, to, messageId: res.messageId });
}
