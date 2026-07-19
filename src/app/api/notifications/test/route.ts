// src/app/api/notifications/test/route.ts
// Sends a one-off test email so an admin can confirm SMTP delivery works before
// relying on it for reminders/escalations. Super-Admin only.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireRoles } from "@/lib/authz";
import { SETTINGS_WRITE_ROLES } from "@/lib/roles";
import { emailReady } from "@/lib/config";
import { sendEmail } from "@/lib/notifications/email";

export async function POST(request: Request) {
  const gate = await requireRoles(SETTINGS_WRITE_ROLES);
  if (gate.res) return gate.res;

  const ready = emailReady();
  if (!ready.ready) {
    return NextResponse.json({ error: `Email is not configured — ${ready.reason}.` }, { status: 400 });
  }

  let to = "";
  try {
    const body = await request.json();
    to = String(body?.to || "").trim();
  } catch {
    // no body — fall back to the admin's own address below
  }
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
