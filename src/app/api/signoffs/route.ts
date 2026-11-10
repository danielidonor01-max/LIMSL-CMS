// src/app/api/signoffs/route.ts
import { NextResponse } from "next/server";
import { ensureSignoffChain, getSignoffChain } from "@/lib/signoff/service";
import { db } from "@/lib/db";
import { signoffs, users } from "@/lib/db/schema";
import { and, asc, eq, inArray } from "drizzle-orm";

// GET /api/signoffs?entityType=PM_CHECKLIST&entityId=... → the sign-off chain
// (created on first access from the configured chain for that entity type).
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const entityType = url.searchParams.get("entityType");
    const entityId = url.searchParams.get("entityId");

    // Several documents at once, read-only: the revision history of a
    // controlled document lists the signatures on every revision. Ensuring a
    // chain here would create fresh PENDING steps on superseded revisions and
    // put dead documents in people's approval inboxes, so this path only reads.
    const many = url.searchParams.get("entityIds");
    if (entityType && many !== null) {
      const ids = [...new Set(many.split(",").map((s) => s.trim()).filter(Boolean))].slice(0, 50);
      const out: Record<string, unknown[]> = Object.fromEntries(ids.map((id) => [id, []]));
      if (ids.length) {
        const rows = await db
          .select({ step: signoffs, signedByJobTitle: users.jobTitle })
          .from(signoffs)
          .leftJoin(users, eq(signoffs.signedById, users.id))
          .where(and(eq(signoffs.entityType, entityType), inArray(signoffs.entityId, ids)))
          .orderBy(asc(signoffs.stepOrder));
        for (const r of rows) out[r.step.entityId]?.push({ ...r.step, signedByJobTitle: r.signedByJobTitle });
      }
      return NextResponse.json(out);
    }

    if (!entityType || !entityId) {
      return NextResponse.json({ error: "entityType and entityId are required" }, { status: 400 });
    }
    await ensureSignoffChain(entityType, entityId);
    const chain = await getSignoffChain(entityType, entityId);
    return NextResponse.json(chain);
  } catch (error) {
    console.error("Failed to load sign-offs:", error);
    return NextResponse.json({ error: "Failed to load sign-offs" }, { status: 500 });
  }
}
