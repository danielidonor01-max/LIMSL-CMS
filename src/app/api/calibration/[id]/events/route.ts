// src/app/api/calibration/[id]/events/route.ts
// The calibration history of one instrument, the evidence an ISO 9001 7.1.5.2
// audit asks for. Append-only: this route reads, nothing writes over it.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { calibrationEvents } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const rows = await db
      .select()
      .from(calibrationEvents)
      .where(eq(calibrationEvents.instrumentId, id))
      .orderBy(desc(calibrationEvents.calibrationDate), desc(calibrationEvents.createdAt));
    return NextResponse.json(rows);
  } catch (error) {
    console.error("Failed to load calibration history:", error);
    return NextResponse.json({ error: "Failed to load calibration history" }, { status: 500 });
  }
}
