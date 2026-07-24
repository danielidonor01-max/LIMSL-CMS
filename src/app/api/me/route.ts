// src/app/api/me/route.ts
// Self-service account endpoint — every authenticated user manages THEIR OWN
// profile and preferences here (distinct from /api/users/[id], which is the
// Super Admin's account administration). Never lets a user change their own role
// or active status.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { and, eq, ne } from "drizzle-orm";
import { requireRoles } from "@/lib/authz";
import { parsePrefs, sanitizePrefs } from "@/lib/user-prefs";
import { ROLE_LABELS, ROLE_DEPARTMENT } from "@/lib/roles";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function currentUser() {
  const gate = await requireRoles([]);
  if (gate.res) return { res: gate.res as NextResponse };
  const [u] = await db.select().from(users).where(eq(users.id, gate.actor!.id ?? "")).limit(1);
  if (!u) return { res: NextResponse.json({ error: "Account not found" }, { status: 404 }) };
  return { user: u };
}

export async function GET() {
  const r = await currentUser();
  if (r.res) return r.res;
  const u = r.user!;
  return NextResponse.json({
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone ?? "",
    whatsapp: u.whatsapp ?? "",
    role: u.role,
    roleLabel: ROLE_LABELS[u.role] ?? u.role,
    department: u.department ?? ROLE_DEPARTMENT[u.role] ?? null,
    jobTitle: u.jobTitle ?? null,
    preferences: parsePrefs(u.preferences),
  });
}

export async function PATCH(request: Request) {
  const r = await currentUser();
  if (r.res) return r.res;
  const u = r.user!;

  const body = await request.json().catch(() => ({}));
  const updates: Record<string, unknown> = {};

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (name.length < 2) return NextResponse.json({ error: "Enter your full name." }, { status: 400 });
    updates.name = name.slice(0, 120);
  }

  if (body.email !== undefined) {
    const email = String(body.email).trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    if (email !== u.email.toLowerCase()) {
      const [clash] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.email, email), ne(users.id, u.id)))
        .limit(1);
      if (clash) return NextResponse.json({ error: "That email is already in use." }, { status: 409 });
    }
    updates.email = email;
  }

  if (body.phone !== undefined) updates.phone = String(body.phone).trim().slice(0, 40) || null;
  if (body.whatsapp !== undefined) updates.whatsapp = String(body.whatsapp).trim().slice(0, 40) || null;

  if (body.preferences !== undefined) {
    updates.preferences = JSON.stringify(sanitizePrefs(body.preferences));
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const [saved] = await db.update(users).set(updates).where(eq(users.id, u.id)).returning();
  return NextResponse.json({
    id: saved.id,
    name: saved.name,
    email: saved.email,
    phone: saved.phone ?? "",
    whatsapp: saved.whatsapp ?? "",
    preferences: parsePrefs(saved.preferences),
    emailChanged: body.email !== undefined && String(body.email).trim().toLowerCase() !== u.email.toLowerCase(),
  });
}
