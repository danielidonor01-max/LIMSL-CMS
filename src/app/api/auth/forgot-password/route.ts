// src/app/api/auth/forgot-password/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, passwordResets, auditLog } from "@/lib/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import { config, emailReady } from "@/lib/config";
import { sendEmail } from "@/lib/notifications/email";
import { generateResetToken, resetExpiry, RESET_TTL_MINUTES } from "@/lib/auth/password-reset";

// Deliberately identical for every input. Telling the caller whether an address
// exists turns this form into a staff directory oracle.
const SAME_ANSWER = {
  ok: true,
  message: "If that email belongs to an account, a reset link is on its way. It expires in an hour.",
};

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = String(body.email ?? "").trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }

    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

    // Unknown address, or a disabled account: answer the same and stop. No row
    // is written, so this cannot be used to fill the table either.
    if (!user || user.isActive === false) return NextResponse.json(SAME_ANSWER);

    if (!emailReady().ready) {
      // Nothing can be delivered, so issuing a token would strand it. Say so —
      // this is an admin misconfiguration, not a secret.
      return NextResponse.json(
        { error: "Email is not configured on this deployment, so a reset link cannot be sent. Ask a Super Admin to reset your password directly." },
        { status: 503 },
      );
    }

    // Asking again invalidates anything outstanding: an old link forwarded in a
    // mail thread must not still work after the owner has re-requested.
    await db
      .update(passwordResets)
      .set({ usedAt: new Date().toISOString() })
      .where(and(eq(passwordResets.userId, user.id), isNull(passwordResets.usedAt)));

    const { token, tokenHash } = generateResetToken();
    await db.insert(passwordResets).values({
      id: nanoid(),
      userId: user.id,
      tokenHash,
      expiresAt: resetExpiry(),
      requestedIp: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    });

    const base = config.appUrl.replace(/\/$/, "");
    const link = `${base}/reset-password?token=${encodeURIComponent(token)}`;

    await sendEmail(
      user.email,
      "Reset your LIMSL CMS password",
      `A password reset was requested for your account.\n\n` +
        `Open the link below to choose a new password. It expires in ${RESET_TTL_MINUTES} minutes and can only be used once.\n\n` +
        `${link}\n\n` +
        `If you did not request this, you can ignore this email — your password has not changed.`,
    );

    // The request is logged; the token is not. An audit trail holding live
    // reset tokens would be the same mistake as storing them unhashed.
    await db.insert(auditLog).values({
      id: nanoid(),
      userId: user.id,
      userName: user.name,
      action: "UPDATE",
      entityType: "user",
      entityId: user.id,
      entityDescription: `Password reset requested for ${user.email}`,
    });

    return NextResponse.json(SAME_ANSWER);
  } catch (error) {
    console.error("Password reset request failed:", error);
    // Even the failure path stays uniform where it can.
    return NextResponse.json(SAME_ANSWER);
  }
}
