// src/app/api/users/[id]/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, auditLog } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { auth } from "@/auth";
import { canManageUsers, ROLES } from "@/lib/roles";
import { hashPassword } from "@/lib/password";

// PATCH /api/users/[id] — update role, activation, or reset password. Super Admin only.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    const actor = session?.user as { id?: string; name?: string; role?: string } | undefined;
    if (!canManageUsers(actor?.role)) {
      return NextResponse.json({ error: "Only a Super Admin can manage users." }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const updates: Record<string, unknown> = {};

    if (body.role !== undefined) {
      if (!ROLES.includes(String(body.role) as (typeof ROLES)[number])) {
        return NextResponse.json({ error: "Invalid role." }, { status: 400 });
      }
      updates.role = body.role;
    }
    if (body.name !== undefined) updates.name = body.name;
    if (body.jobTitle !== undefined) updates.jobTitle = body.jobTitle;
    if (body.department !== undefined) updates.department = body.department;
    if (body.phone !== undefined) updates.phone = body.phone;
    if (body.isActive !== undefined) updates.isActive = !!body.isActive;

    let tempPassword: string | undefined;
    if (body.resetPassword) {
      tempPassword = `limsl-${nanoid(6).toLowerCase()}`;
      updates.passwordHash = hashPassword(tempPassword);
      updates.mustChangePassword = true;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No changes provided." }, { status: 400 });
    }

    await db.update(users).set(updates).where(eq(users.id, id));

    await db.insert(auditLog).values({
      id: nanoid(),
      userId: actor?.id ?? null,
      userName: actor?.name ?? "Super Admin",
      action: "UPDATE",
      entityType: "user",
      entityId: id,
      changes: JSON.stringify({ ...updates, passwordHash: updates.passwordHash ? "***" : undefined }),
    });

    return NextResponse.json({ id, tempPassword });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to update user:", error);
    return NextResponse.json({ error: "Failed to update user", details: message }, { status: 500 });
  }
}
