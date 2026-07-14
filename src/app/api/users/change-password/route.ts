// src/app/api/users/change-password/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, auditLog } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireRoles } from "@/lib/authz";
import { verifyPassword, hashPassword } from "@/lib/password";
import { validatePassword } from "@/lib/password-policy";

export async function POST(request: Request) {
  try {
    // Gate the API: any authenticated user is allowed to change their password.
    const gate = await requireRoles([]);
    if (gate.res) return gate.res;
    const actor = gate.actor;

    if (!actor.id) {
      return NextResponse.json({ error: "Invalid session actor." }, { status: 400 });
    }

    const body = await request.json();
    const currentPassword = String(body.currentPassword || "");
    const newPassword = String(body.newPassword || "");

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: "Current password and new password are required." },
        { status: 400 },
      );
    }

    const policyError = validatePassword(newPassword);
    if (policyError) {
      return NextResponse.json({ error: policyError }, { status: 400 });
    }

    // Retrieve user record to verify current password
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, actor.id))
      .limit(1);

    if (!user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    const currentIsValid = verifyPassword(currentPassword, user.passwordHash);
    if (!currentIsValid) {
      return NextResponse.json(
        { error: "Current password is incorrect." },
        { status: 400 },
      );
    }

    // Prevent using the same password
    if (currentPassword === newPassword) {
      return NextResponse.json(
        { error: "New password must be different from your current password." },
        { status: 400 },
      );
    }

    const newHash = hashPassword(newPassword);

    // Update user password and clear mustChangePassword
    await db
      .update(users)
      .set({
        passwordHash: newHash,
        mustChangePassword: false,
      })
      .where(eq(users.id, actor.id));

    // Audit log the password change
    await db.insert(auditLog).values({
      id: nanoid(),
      userId: actor.id,
      userName: actor.name ?? "User",
      action: "UPDATE",
      entityType: "user",
      entityId: actor.id,
      entityDescription: "Changed password (self-service)",
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to change password:", error);
    return NextResponse.json(
      { error: "Failed to change password.", details: message },
      { status: 500 },
    );
  }
}
