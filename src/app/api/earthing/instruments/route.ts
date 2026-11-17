// src/app/api/earthing/instruments/route.ts
// The earth testers in the calibration register. The instrument is not owned
// here: the Habotest is calibrated, certified and tracked in /calibration like
// every other measuring instrument, and this only reads it.
//
// ?all=1 returns every instrument, for the rare test taken with something else.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { calibrationRecords } from "@/lib/db/schema";
import { statusForNextDate } from "@/lib/calibration";
import { instrumentLabel, isEarthInstrument } from "@/lib/earthing/earthing";

// A failed calibration parks the instrument until a person returns it to
// service; a date passing never clears that, so the stored state wins there.
function derivedCalStatus(rec: { status?: string | null; nextCalibrationDate?: string | null }, now = Date.now()) {
  return rec.status === "OUT_OF_SERVICE" ? "OUT_OF_SERVICE" : statusForNextDate(rec.nextCalibrationDate, now);
}

export async function GET(request: Request) {
  try {
    const all = new URL(request.url).searchParams.get("all") === "1";
    const rows = await db.select().from(calibrationRecords);
    const instruments = rows
      .filter((r) => all || isEarthInstrument(r))
      .map((r) => ({
        id: r.id,
        instrumentName: r.instrumentName,
        make: r.make,
        model: r.model,
        serialNumber: r.serialNumber,
        lastCalibrationDate: r.lastCalibrationDate,
        nextCalibrationDate: r.nextCalibrationDate,
        certificateUrl: r.certificateUrl,
        label: instrumentLabel(r),
        earthTester: isEarthInstrument(r),
        calStatus: derivedCalStatus(r),
      }))
      .sort((a, b) => Number(b.earthTester) - Number(a.earthTester) || a.label.localeCompare(b.label));
    return NextResponse.json(instruments);
  } catch (err) {
    console.error("Failed to load earth testers:", err);
    return NextResponse.json({ error: "Failed to load instruments" }, { status: 500 });
  }
}
