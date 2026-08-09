// src/app/api/account/email/route.ts
// Changing the sign-in address, verified at the new one before it takes effect.
//
// Previously this was a plain field save. One typo and the account had an
// address nobody owns: password recovery emails whatever is on file, so a wrong
// address is not an inconvenience, it is a lockout that only another admin can
// undo. Verifying first means a mistyped address simply never activates.
//
// The old address is told what was requested. If someone else is trying to move
// the account, the person who still controls the mailbox finds out while the old
// address is still the live one.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, emailChangeRequests, auditLog } from "@/lib/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import { auth } from "@/auth";
import { emailReady } from "@/lib/config";
import { config } from "@/lib/config";
import { sendEmail } from "@/lib/notifications/email";
import { generateResetToken, hashResetToken, resetExpiry, resetIsUsable, RESET_TTL_MINUTES } from "@/lib/auth/password-reset";

// POST: request a change. Nothing on the account moves yet.
export async function POST(request: Request) {
  try {
    const session = await auth();
    const me = session?.user as { id?: string; name?: string } | undefined;
    if (!me?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const newEmail = String(body.email ?? "").trim().toLowerCase();
    if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }

    const [current] = await db.select().from(users).where(eq(users.id, me.id)).limit(1);
    if (!current) return NextResponse.json({ error: "Account not found." }, { status: 404 });
    if (current.email.toLowerCase() === newEmail) {
      return NextResponse.json({ error: "That is already your sign-in address." }, { status: 400 });
    }

    const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.email, newEmail)).limit(1);
    if (taken) {
      return NextResponse.json({ error: "Another account already uses that address." }, { status: 409 });
    }

    if (!emailReady().ready) {
      return NextResponse.json(
        { error: "Email is not configured on this deployment, so a new address cannot be verified. Ask a Super Admin." },
        { status: 503 },
      );
    }

    // Only one change can be in flight. Asking again cancels the previous.
    await db
      .update(emailChangeRequests)
      .set({ usedAt: new Date().toISOString() })
      .where(and(eq(emailChangeRequests.userId, me.id), isNull(emailChangeRequests.usedAt)));

    const { token, tokenHash } = generateResetToken();
    await db.insert(emailChangeRequests).values({
      id: nanoid(),
      userId: me.id,
      newEmail,
      tokenHash,
      expiresAt: resetExpiry(),
    });

    const base = config.appUrl.replace(/\/$/, "");
    const link = `${base}/account/confirm-email?token=${encodeURIComponent(token)}`;

    await sendEmail(
      newEmail,
      "Confirm your new LIMSL CMS sign-in address",
      `Open the link below to make this your sign-in address. It expires in ${RESET_TTL_MINUTES} minutes.\n\n${link}\n\n` +
        `Until you confirm, ${current.email} stays your sign-in address and nothing has changed.`,
    );

    // The address losing control is told, while it still has control.
    await sendEmail(
      current.email,
      "A new sign-in address was requested",
      `Someone asked to change the sign-in address on your LIMSL CMS account to ${newEmail}.\n\n` +
        `Nothing has changed yet. If this was not you, tell a Super Admin now and change your password.`,
    );

    await db.insert(auditLog).values({
      id: nanoid(),
      userId: me.id,
      userName: current.name,
      action: "UPDATE",
      entityType: "user",
      entityId: me.id,
      entityDescription: `Email change requested: ${current.email} to ${newEmail} (awaiting confirmation)`,
    });

    return NextResponse.json({ ok: true, pending: newEmail });
  } catch (error) {
    console.error("Email change request failed:", error);
    return NextResponse.json({ error: "Could not start the email change." }, { status: 500 });
  }
}

// PUT: confirm with the token from the new address.
export async function PUT(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const token = String(body.token ?? "");
    if (!token) return NextResponse.json({ error: "No confirmation token supplied." }, { status: 400 });

    const [row] = await db
      .select()
      .from(emailChangeRequests)
      .where(eq(emailChangeRequests.tokenHash, hashResetToken(token)))
      .limit(1);

    const usable = resetIsUsable(row);
    if (!usable.ok) return NextResponse.json({ error: usable.reason }, { status: 400 });

    // Re-check at confirmation time. The address may have been claimed by
    // someone else in the window between requesting and confirming.
    const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.email, row.newEmail)).limit(1);
    if (taken && taken.id !== row.userId) {
      return NextResponse.json({ error: "Another account has taken that address. Start again." }, { status: 409 });
    }

    const [user] = await db.select().from(users).where(eq(users.id, row.userId)).limit(1);
    if (!user) return NextResponse.json({ error: "Account not found." }, { status: 404 });

    await db.update(emailChangeRequests).set({ usedAt: new Date().toISOString() }).where(eq(emailChangeRequests.id, row.id));
    await db.update(users).set({ email: row.newEmail }).where(eq(users.id, row.userId));

    await db.insert(auditLog).values({
      id: nanoid(),
      userId: row.userId,
      userName: user.name,
      action: "UPDATE",
      entityType: "user",
      entityId: row.userId,
      entityDescription: `Email changed: ${user.email} to ${row.newEmail} (confirmed)`,
    });

    return NextResponse.json({ ok: true, email: row.newEmail });
  } catch (error) {
    console.error("Email change confirmation failed:", error);
    return NextResponse.json({ error: "Could not confirm the new address." }, { status: 500 });
  }
}
