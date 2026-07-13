// src/app/api/procedure/[id]/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { procedureRevisions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// GET a specific procedure revision (for viewing/printing historical revisions).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const [rev] = await db.select().from(procedureRevisions).where(eq(procedureRevisions.id, id)).limit(1);
    if (!rev) return NextResponse.json({ error: "Revision not found" }, { status: 404 });
    return NextResponse.json(rev);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: "Failed to load revision", details: message }, { status: 500 });
  }
}
