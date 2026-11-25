// src/lib/auth/guess-limit.ts
// A limit on wrong passwords and wrong signing PINs.
//
// Without one, a password could be guessed as fast as requests can be sent, and
// the six-digit signing PIN, which exists for exactly the tablet somebody left
// signed in, could be run through in an afternoon.
//
// Failures are counted from the audit log rather than held in memory: on Vercel
// each request may land on a different server, so a counter in memory would
// reset under the person guessing. Every failure is an audit line anyway, which
// is the record of the attempt.
import { db } from "@/lib/db";
import { auditLog } from "@/lib/db/schema";
import { and, eq, gte, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

export const GUESS_LIMIT = 5;
export const LOCK_MINUTES = 15;

export type GuessKind = "LOGIN_FAILED" | "PIN_FAILED";

/** The audit log's own timestamp format, so the comparison is like for like. */
export function windowStart(now: Date, minutes = LOCK_MINUTES): string {
  return new Date(now.getTime() - minutes * 60_000).toISOString().slice(0, 19) + "Z";
}

export function isLockedOut(recentFailures: number): boolean {
  return recentFailures >= GUESS_LIMIT;
}

export async function recentFailures(userId: string, kind: GuessKind, now = new Date()): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(auditLog)
    .where(and(eq(auditLog.userId, userId), eq(auditLog.action, kind), gte(auditLog.timestamp, windowStart(now))));
  return Number(row?.n ?? 0);
}

export async function recordFailure(user: { id: string; name?: string | null }, kind: GuessKind, attempt: number) {
  await db.insert(auditLog).values({
    id: nanoid(),
    userId: user.id,
    userName: user.name ?? null,
    action: kind,
    entityType: "user",
    entityId: user.id,
    entityDescription:
      (kind === "LOGIN_FAILED" ? "Wrong password" : "Wrong signing PIN") +
      ` (${attempt} of ${GUESS_LIMIT} in ${LOCK_MINUTES} minutes)` +
      (isLockedOut(attempt) ? `; ${kind === "LOGIN_FAILED" ? "sign-in" : "signing"} locked for ${LOCK_MINUTES} minutes` : ""),
  });
}
