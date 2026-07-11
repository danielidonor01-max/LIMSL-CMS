// src/app/api/calibration/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { calibrationRecords } from "@/lib/db/schema";

export async function GET() {
  try {
    const rows = await db.select().from(calibrationRecords);
    rows.sort((a, b) => (a.nextCalibrationDate ?? "").localeCompare(b.nextCalibrationDate ?? ""));
    return NextResponse.json(rows);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to load calibration data:", error);
    return NextResponse.json({ error: "Failed to load calibration data", details: message }, { status: 500 });
  }
}
