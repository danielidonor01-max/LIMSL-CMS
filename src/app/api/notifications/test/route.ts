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
  const env = process.env;

  // Catch the most common "I set it but it's still not configured" causes:
  // a wrong value for the boolean, or a variable set under a name the app
  // doesn't read. Never surface secret VALUES — only names (and the non-secret
  // EMAIL_ENABLED value).
  const hints: string[] = [];
  if (env.EMAIL_ENABLED && env.EMAIL_ENABLED !== "true") {
    hints.push(`EMAIL_ENABLED is "${env.EMAIL_ENABLED}" — it must be exactly true (lowercase, no quotes/spaces).`);
  }
  const nearMiss = (canonical: string, aliases: string[]) => {
    if (!env[canonical]) for (const a of aliases) if (env[a]) hints.push(`Found ${a}, but the app reads ${canonical} — rename it to ${canonical}.`);
  };
  nearMiss("SMTP_HOST", ["SMTP_SERVER", "SMTP_HOSTNAME", "MAIL_HOST", "SMPT_HOST"]);
  nearMiss("SMTP_USER", ["SMTP_USERNAME", "SMTP_EMAIL", "SMTP_MAIL", "EMAIL_USER", "GMAIL_USER"]);
  nearMiss("SMTP_PASS", ["SMTP_PASSWORD", "SMTP_PWD", "EMAIL_PASS", "EMAIL_PASSWORD", "GMAIL_APP_PASSWORD", "APP_PASSWORD"]);

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
    hints,
  };
}

// Always reflect the running deployment's live env — never a cached snapshot,
// so a "Recheck" right after redeploying shows the real state.
export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireRoles(SETTINGS_WRITE_ROLES);
  if (gate.res) return gate.res;
  return NextResponse.json(status(), { headers: { "Cache-Control": "no-store" } });
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
