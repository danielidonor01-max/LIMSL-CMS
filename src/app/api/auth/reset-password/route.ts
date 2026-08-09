// src/app/api/auth/reset-password/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, passwordResets, auditLog } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { hashPassword } from "@/lib/password";
import {
  hashResetToken,
  resetIsUsable,
  validateNewPassword,
} from "@/lib/auth/password-reset";

// GET → is this link still good? Lets the page show "expired, request another"
// before the user types a new password twice for nothing.
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (!token) return NextResponse.json({ valid: false, reason: "No reset token supplied." });

  const [row] = await db
    .select()
    .from(passwordResets)
    .where(eq(passwordResets.tokenHash, hashResetToken(token)))
    .limit(1);

  const usable = resetIsUsable(row);
  return NextResponse.json(usable.ok ? { valid: true } : { valid: false, reason: usable.reason });
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const token = String(body.token ?? "");
    if (!token) return NextResponse.json({ error: "No reset token supplied." }, { status: 400 });

    // Looked up BY HASH — the plaintext token exists only in the email.
    const [row] = await db
      .select()
      .from(passwordResets)
      .where(eq(passwordResets.tokenHash, hashResetToken(token)))
      .limit(1);

    const usable = resetIsUsable(row);
    if (!usable.ok) return NextResponse.json({ error: usable.reason }, { status: 400 });

    const [user] = await db.select().from(users).where(eq(users.id, row.userId)).limit(1);
    if (!user || user.isActive === false) {
      return NextResponse.json({ error: "This account is no longer active." }, { status: 400 });
    }

    const check = validateNewPassword(body.password, user.email);
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

    // Consume the token FIRST. If the password update then fails, the worst
    // outcome is a spent link and a retry — not a token that stays live after a
    // partial success.
    await db
      .update(passwordResets)
      .set({ usedAt: new Date().toISOString() })
      .where(eq(passwordResets.id, row.id));

    await db
      .update(users)
      .set({
        passwordHash: hashPassword(String(body.password)),
        // They have just chosen this one themselves; forcing another change at
        // next sign-in would be nonsense.
        mustChangePassword: false,
      })
      .where(eq(users.id, user.id));

    await db.insert(auditLog).values({
      id: nanoid(),
      userId: user.id,
      userName: user.name,
      action: "UPDATE",
      entityType: "user",
      entityId: user.id,
      entityDescription: `Password reset completed for ${user.email}`,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Password reset failed:", error);
    return NextResponse.json({ error: "Could not reset the password. Request a new link." }, { status: 500 });
  }
}
