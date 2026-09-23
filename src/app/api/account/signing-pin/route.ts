// src/app/api/account/signing-pin/route.ts
// Setting, changing and removing your own signing PIN.
//
// The PIN is OPTIONAL. Having none is a supported state, not an unfinished
// one: the signature still records who signed, as what, and when, and the
// audit row still names them. What the PIN adds is proof that the account
// holder was at the keyboard, which matters on a shared workshop tablet and
// much less on somebody's own laptop. That judgement is theirs.
//
// Yours alone. There is no route that sets somebody else's PIN, including for a
// Super Admin: a PIN an administrator can set is a PIN an administrator can
// sign with, and the whole point of it is that a signature is attributable to
// one person. An administrator who needs to help someone locked out clears the
// PIN, which forces the owner to set a new one themselves.
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { users, auditLog } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { hashPassword, verifyPassword } from "@/lib/password";
import { validatePin, hasSigningPin } from "@/lib/signing-pin";

export async function GET() {
  const session = await auth();
  const actor = session?.user as { id?: string } | undefined;
  if (!actor?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [row] = await db.select().from(users).where(eq(users.id, actor.id)).limit(1);
  // A boolean derived from the hash, never the hash.
  return NextResponse.json({ hasPin: hasSigningPin(row?.signingPinHash) });
}

export async function POST(request: Request) {
  const session = await auth();
  const actor = session?.user as { id?: string; name?: string } | undefined;
  if (!actor?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const [row] = await db.select().from(users).where(eq(users.id, actor.id)).limit(1);
    if (!row) return NextResponse.json({ error: "Account not found" }, { status: 404 });

    const first = !hasSigningPin(row.signingPinHash);

    // Changing an existing PIN proves you know the old one. Without this,
    // anyone who found a tablet left logged in could quietly take ownership of
    // that person's signature.
    if (!first) {
      const current = body.currentPin;
      if (typeof current !== "string" || !verifyPassword(current, row.signingPinHash)) {
        return NextResponse.json({ error: "That is not your current signing PIN." }, { status: 403 });
      }
    }

    const check = validatePin(body.pin);
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

    await db
      .update(users)
      .set({ signingPinHash: hashPassword(body.pin) })
      .where(eq(users.id, actor.id));

    // The event is recorded; the PIN is not, and cannot be recovered from what
    // is stored.
    await db.insert(auditLog).values({
      id: nanoid(),
      userId: actor.id,
      userName: actor.name ?? "Unknown",
      action: "UPDATE",
      entityType: "user",
      entityId: actor.id,
      entityDescription: first ? "Signing PIN set" : "Signing PIN changed",
    });

    return NextResponse.json({ ok: true, first });
  } catch (error) {
    console.error("Failed to set signing PIN:", error);
    return NextResponse.json({ error: "Could not set the signing PIN" }, { status: 500 });
  }
}

// Turning it off again.
//
// Proves knowledge of the current PIN, for the same reason changing it does:
// otherwise a tablet left logged in is a way to strip the protection off
// somebody's signature and then sign as them. Signatures already given keep
// their authMethod — what was true when they were made stays true.
export async function DELETE(request: Request) {
  const session = await auth();
  const actor = session?.user as { id?: string; name?: string } | undefined;
  if (!actor?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json().catch(() => ({}));
    const [row] = await db.select().from(users).where(eq(users.id, actor.id)).limit(1);
    if (!row) return NextResponse.json({ error: "Account not found" }, { status: 404 });

    if (!hasSigningPin(row.signingPinHash)) {
      return NextResponse.json({ ok: true, alreadyOff: true });
    }
    const current = (body as { currentPin?: unknown }).currentPin;
    if (typeof current !== "string" || !verifyPassword(current, row.signingPinHash)) {
      return NextResponse.json({ error: "That is not your current signing PIN." }, { status: 403 });
    }

    await db.update(users).set({ signingPinHash: null }).where(eq(users.id, actor.id));

    await db.insert(auditLog).values({
      id: nanoid(),
      userId: actor.id,
      userName: actor.name ?? "Unknown",
      action: "UPDATE",
      entityType: "user",
      entityId: actor.id,
      entityDescription: "Signing PIN removed, signatures now rest on the session alone",
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to remove signing PIN:", error);
    return NextResponse.json({ error: "Could not remove the signing PIN" }, { status: 500 });
  }
}
