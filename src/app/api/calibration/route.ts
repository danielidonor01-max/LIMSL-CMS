// src/app/api/calibration/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { calibrationRecords, calibrationEvents, nonConformities, auditLog } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireRoles } from "@/lib/authz";
import { MAINTENANCE_WRITE_ROLES } from "@/lib/roles";
import { nextDocNumber } from "@/lib/doc-number";
import {
  AS_FOUND_VALUES,
  AS_LEFT_VALUES,
  VERDICT_VALUES,
  addDays,
  deriveInstrumentStatus,
  isSuspectCalibration,
  newestEvent,
  normalizeCalibrationEnum,
  outOfToleranceNcDescription,
  syncEquipmentCalibration,
  traceabilityError,
  type CalibrationEvent,
} from "@/lib/calibration";

const trimOrNull = (v: unknown): string | null => {
  const s = String(v ?? "").trim();
  return s ? s : null;
};

// Readings arrive either as a JSON string from an import or as a structured
// array from the form; the column stores JSON text either way.
function readingsToText(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "string") return v.trim() || null;
  try {
    return JSON.stringify(v);
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const rows = await db.select().from(calibrationRecords);
    rows.sort((a, b) => (a.nextCalibrationDate ?? "").localeCompare(b.nextCalibrationDate ?? ""));
    return NextResponse.json(rows);
  } catch (error) {
    console.error("Failed to load calibration data:", error);
    return NextResponse.json({ error: "Failed to load calibration data" }, { status: 500 });
  }
}

// Record a calibration. The instrument master (calibration_records) is upserted
// and an immutable calibration_events row is ALWAYS written, the master's
// dates and status are only a cache of the newest event, never the history.
export async function POST(request: Request) {
  try {
    const gate = await requireRoles(MAINTENANCE_WRITE_ROLES);
    if (gate.res) return gate.res;

    const body = await request.json();
    const today = new Date().toISOString().slice(0, 10);
    const calibrationDate = trimOrNull(body.calibrationDate) ?? trimOrNull(body.lastCalibrationDate) ?? today;

    const interval = body.calibrationInterval ? Number(body.calibrationInterval) : 365;
    if (!Number.isFinite(interval) || interval < 1) {
      return NextResponse.json({ error: "Calibration interval must be a positive number of days." }, { status: 400 });
    }
    const nextCalibrationDate = trimOrNull(body.nextCalibrationDate) ?? addDays(calibrationDate, interval);

    const traceableTo = trimOrNull(body.traceableTo);
    const labName = trimOrNull(body.labName);
    const traceErr = traceabilityError({ traceableTo, labName });
    if (traceErr) return NextResponse.json({ error: traceErr }, { status: 400 });

    const asFound = normalizeCalibrationEnum(body.asFound, AS_FOUND_VALUES, "NOT_CHECKED");
    if (!asFound) {
      return NextResponse.json(
        { error: `As-found condition must be one of: ${AS_FOUND_VALUES.join(", ")}.` },
        { status: 400 },
      );
    }
    const asLeft = body.asLeft ? normalizeCalibrationEnum(body.asLeft, AS_LEFT_VALUES, "IN_TOLERANCE") : null;
    if (body.asLeft && !asLeft) {
      return NextResponse.json(
        { error: `As-left condition must be one of: ${AS_LEFT_VALUES.join(", ")}.` },
        { status: 400 },
      );
    }
    let verdict = normalizeCalibrationEnum(body.verdict, VERDICT_VALUES, "PASS");
    if (!verdict) {
      return NextResponse.json({ error: `Verdict must be one of: ${VERDICT_VALUES.join(", ")}.` }, { status: 400 });
    }
    // An instrument left rejected cannot be recorded as a pass, whatever the
    // form said, the verdict follows the instrument's actual condition.
    if (asLeft === "REJECTED") verdict = "FAIL";

    // ── Instrument master: upsert ────────────────────────────────────────────
    let master: typeof calibrationRecords.$inferSelect;
    let created = false;

    if (body.id) {
      const [existing] = await db
        .select()
        .from(calibrationRecords)
        .where(eq(calibrationRecords.id, String(body.id)))
        .limit(1);
      if (!existing) return NextResponse.json({ error: "Instrument not found" }, { status: 404 });
      master = existing;
    } else {
      if (!trimOrNull(body.instrumentName)) {
        return NextResponse.json({ error: "instrumentName is required" }, { status: 400 });
      }
      const row = {
        id: nanoid(),
        instrumentName: String(body.instrumentName).trim(),
        equipmentId: trimOrNull(body.equipmentId),
        serialNumber: trimOrNull(body.serialNumber),
        make: trimOrNull(body.make),
        model: trimOrNull(body.model),
        lastCalibrationDate: calibrationDate,
        nextCalibrationDate,
        calibrationInterval: interval,
        calibratedBy: trimOrNull(body.calibratedBy) ?? gate.actor?.name ?? null,
        certificateNumber: trimOrNull(body.certificateNumber),
        certificateUrl: trimOrNull(body.certificateUrl),
        status: deriveInstrumentStatus({ verdict, asFound, nextCalibrationDate }),
        traceableTo,
        referenceStandardId: trimOrNull(body.referenceStandardId),
        labName,
        labAccreditationNo: trimOrNull(body.labAccreditationNo),
        accreditationBody: trimOrNull(body.accreditationBody),
      };
      await db.insert(calibrationRecords).values(row);
      const [inserted] = await db
        .select()
        .from(calibrationRecords)
        .where(eq(calibrationRecords.id, row.id))
        .limit(1);
      master = inserted ?? (row as typeof calibrationRecords.$inferSelect);
      created = true;
    }

    // ── The event: append-only, never updated ────────────────────────────────
    const event = {
      id: nanoid(),
      instrumentId: master.id,
      calibrationDate,
      nextCalibrationDate,
      asFound,
      asLeft,
      verdict,
      readings: readingsToText(body.readings),
      calibratedBy: trimOrNull(body.calibratedBy) ?? gate.actor?.name ?? null,
      calibratedById: gate.actor?.id ?? null,
      certificateNumber: trimOrNull(body.certificateNumber),
      certificateFileKey: trimOrNull(body.certificateFileKey),
      traceableTo,
      labName,
      labAccreditationNo: trimOrNull(body.labAccreditationNo),
      notes: trimOrNull(body.notes),
    };
    await db.insert(calibrationEvents).values(event);

    const history = await db
      .select()
      .from(calibrationEvents)
      .where(eq(calibrationEvents.instrumentId, master.id));
    const newest = (newestEvent(history) ?? event) as CalibrationEvent;
    const suspect = isSuspectCalibration(event);

    // The cache follows the newest event, but a failure always parks the
    // instrument: an out-of-tolerance finding is cleared by a person deciding
    // it is fit to return to service, never by a date passing.
    const status = suspect ? "OUT_OF_SERVICE" : deriveInstrumentStatus(newest);

    await db
      .update(calibrationRecords)
      .set({
        instrumentName: trimOrNull(body.instrumentName) ?? master.instrumentName,
        equipmentId: trimOrNull(body.equipmentId) ?? master.equipmentId,
        serialNumber: trimOrNull(body.serialNumber) ?? master.serialNumber,
        make: trimOrNull(body.make) ?? master.make,
        model: trimOrNull(body.model) ?? master.model,
        lastCalibrationDate: newest.calibrationDate,
        nextCalibrationDate: newest.nextCalibrationDate,
        calibrationInterval: interval,
        calibratedBy: newest.calibratedBy,
        certificateNumber: newest.certificateNumber,
        certificateUrl: trimOrNull(body.certificateUrl) ?? master.certificateUrl,
        traceableTo: newest.traceableTo,
        referenceStandardId: trimOrNull(body.referenceStandardId) ?? master.referenceStandardId,
        labName: newest.labName,
        labAccreditationNo: newest.labAccreditationNo,
        accreditationBody: trimOrNull(body.accreditationBody) ?? master.accreditationBody,
        status,
      })
      .where(eq(calibrationRecords.id, master.id));

    // ── Out of tolerance → non-conformity (ISO 9001 7.1.5.2) ─────────────────
    let raisedNc: { id: string; ncNumber: string } | null = null;
    if (suspect) {
      const priorGood = newestEvent(
        history.filter(
          (e) =>
            e.id !== event.id &&
            (e.calibrationDate ?? "") <= calibrationDate &&
            e.verdict === "PASS" &&
            e.asFound !== "OUT_OF_TOLERANCE",
        ),
      );
      const lastGoodDate = priorGood?.calibrationDate ?? (master.createdAt ?? "").slice(0, 10);

      const ncNumber = await nextDocNumber("NC");
      const nc = {
        id: nanoid(),
        ncNumber,
        type: "CALIBRATION_FAILURE",
        severity: asLeft === "REJECTED" ? "CRITICAL" : "HIGH",
        detectedDate: today,
        detectedBy: gate.actor?.name ?? "Calibration Register",
        relatedEntityType: "calibration_event",
        relatedEntityId: event.id,
        equipmentId: master.equipmentId ?? null,
        description: outOfToleranceNcDescription({
          instrumentName: master.instrumentName,
          serialNumber: master.serialNumber,
          calibrationDate,
          verdict,
          asFound,
          asLeft,
          certificateNumber: event.certificateNumber,
          lastGoodDate: lastGoodDate || null,
          lastGoodIsRegistration: !priorGood,
        }),
        rootCause: "",
        correctiveAction: "",
        status: "OPEN",
        autoDetected: true,
      };
      await db.insert(nonConformities).values(nc);
      raisedNc = { id: nc.id, ncNumber };

      await db.insert(auditLog).values({
        id: nanoid(),
        userId: gate.actor?.id ?? null,
        userName: gate.actor?.name ?? "User",
        action: "CREATE",
        entityType: "non_conformity",
        entityId: nc.id,
        entityDescription: `NC ${ncNumber} raised (${nc.severity}), ${nc.description.slice(0, 80)}`,
      });
    }

    if (master.equipmentId) await syncEquipmentCalibration(master.equipmentId);

    await db.insert(auditLog).values({
      id: nanoid(),
      userId: gate.actor?.id ?? null,
      userName: gate.actor?.name ?? "User",
      action: created ? "CREATE" : "UPDATE",
      entityType: "calibration",
      entityId: master.id,
      entityDescription:
        `Calibration ${verdict} recorded, ${master.instrumentName} on ${calibrationDate} ` +
        `(as-found ${asFound}) · next due ${nextCalibrationDate}` +
        (raisedNc ? ` · NC ${raisedNc.ncNumber} raised` : ""),
    });

    const [refreshed] = await db
      .select()
      .from(calibrationRecords)
      .where(eq(calibrationRecords.id, master.id))
      .limit(1);

    return NextResponse.json(
      { ...(refreshed ?? master), event, nonConformity: raisedNc },
      { status: created ? 201 : 200 },
    );
  } catch (error) {
    console.error("Failed to record calibration:", error);
    return NextResponse.json({ error: "Failed to record calibration" }, { status: 500 });
  }
}
