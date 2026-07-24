// src/app/api/users/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, auditLog } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { auth } from "@/auth";
import { canManageUsers, ROLES, ROLE_DEPARTMENT } from "@/lib/roles";
import { hashPassword } from "@/lib/password";
import { validatePassword } from "@/lib/password-policy";

// Safe columns — never return the password hash.
const safeColumns = {
  id: users.id,
  name: users.name,
  email: users.email,
  role: users.role,
  jobTitle: users.jobTitle,
  department: users.department,
  phone: users.phone,
  whatsapp: users.whatsapp,
  isActive: users.isActive,
  mustChangePassword: users.mustChangePassword,
  createdAt: users.createdAt,
};

// Directory projection for non-admins: enough to populate people pickers
// (technician/holder dropdowns need id + name + role), without handing every
// authenticated session the full staff contact book (email/phone/WhatsApp).
const directoryColumns = {
  id: users.id,
  name: users.name,
  role: users.role,
  jobTitle: users.jobTitle,
  department: users.department,
  isActive: users.isActive,
};

export async function GET(request: Request) {
  try {
    const session = await auth();
    const actor = session?.user as { role?: string } | undefined;
    const admin = canManageUsers(actor?.role);

    const includeInactive = new URL(request.url).searchParams.get("includeInactive") === "1";
    const list = await db.select(admin ? safeColumns : directoryColumns).from(users);
    const filtered = includeInactive ? list : list.filter((u) => u.isActive !== false);
    filtered.sort((a, b) => a.name.localeCompare(b.name));
    return NextResponse.json(filtered);
  } catch (error) {
    console.error("Failed to fetch users:", error);
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }
}

// POST /api/users — create a user. Super Admin only.
export async function POST(request: Request) {
  try {
    const session = await auth();
    const actor = session?.user as { id?: string; name?: string; role?: string } | undefined;
    if (!canManageUsers(actor?.role)) {
      return NextResponse.json({ error: "Only a Super Admin can create users." }, { status: 403 });
    }

    const body = await request.json();
    const email = String(body.email || "").trim().toLowerCase();
    const name = String(body.name || "").trim();
    const role = String(body.role || "TECHNICIAN");

    if (!email || !name) {
      return NextResponse.json({ error: "Name and email are required." }, { status: 400 });
    }
    if (!ROLES.includes(role as (typeof ROLES)[number])) {
      return NextResponse.json({ error: "Invalid role." }, { status: 400 });
    }
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (existing) {
      return NextResponse.json({ error: "A user with that email already exists." }, { status: 409 });
    }

    // An admin-supplied password is a live credential until the user's first
    // login, so hold it to the same policy as a self-chosen one. The generated
    // fallback is built to satisfy the policy by construction.
    if (body.password) {
      const policyError = validatePassword(String(body.password));
      if (policyError) {
        return NextResponse.json({ error: policyError }, { status: 400 });
      }
    }
    const tempPassword = body.password
      ? String(body.password)
      : `Limsl-${nanoid(8)}9!`;

    const id = nanoid();
    await db.insert(users).values({
      id,
      name,
      email,
      role,
      jobTitle: body.jobTitle || null,
      department: body.department || ROLE_DEPARTMENT[role] || null,
      phone: body.phone || null,
      whatsapp: body.whatsapp || null,
      passwordHash: hashPassword(tempPassword),
      isActive: true,
      mustChangePassword: true,
      createdBy: actor?.id ?? null,
    });

    await db.insert(auditLog).values({
      id: nanoid(),
      userId: actor?.id ?? null,
      userName: actor?.name ?? "Super Admin",
      action: "CREATE",
      entityType: "user",
      entityId: id,
      entityDescription: `Created ${name} (${role})`,
    });

    // Return the temp password ONCE so the admin can hand it to the new user.
    return NextResponse.json({ id, name, email, role, tempPassword }, { status: 201 });
  } catch (error) {
    console.error("Failed to create user:", error);
    return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
  }
}
