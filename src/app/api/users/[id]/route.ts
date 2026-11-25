// src/app/api/users/[id]/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, auditLog } from "@/lib/db/schema";
import { and, eq, inArray, ne } from "drizzle-orm";
import { nanoid } from "nanoid";
import { auth } from "@/auth";
import { canManageUsers, ROLES } from "@/lib/roles";
import { isActiveSuperAdmin, leavesNoSuperAdmin } from "@/lib/super-admin-guard";
import { hashPassword } from "@/lib/password";

// PATCH /api/users/[id], update role, activation, or reset password. Super Admin only.
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

    const [target] = await db.select({ role: users.role, isActive: users.isActive }).from(users).where(eq(users.id, id)).limit(1);
    if (!target) return NextResponse.json({ error: "User not found." }, { status: 404 });
    if (updates.role !== undefined || updates.isActive !== undefined) {
      const others = (
        await db
          .select({ id: users.id, role: users.role, isActive: users.isActive })
          .from(users)
          .where(and(ne(users.id, id), inArray(users.role, ["SUPER_ADMIN", "ADMIN"])))
      ).filter(isActiveSuperAdmin).length;
      const edit = { role: updates.role as string | undefined, isActive: updates.isActive as boolean | undefined };
      if (leavesNoSuperAdmin(target, edit, others)) {
        return NextResponse.json(
          {
            error:
              "This is the only active Super Admin. Make another account a Super Admin first, " +
              "otherwise nobody could manage accounts or reset passwords.",
          },
          { status: 409 },
        );
      }
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
    console.error("Failed to update user:", error);
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }
}
