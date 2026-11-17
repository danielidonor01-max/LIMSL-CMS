// src/app/api/earthing/tests/route.ts
// Earth resistance tests, newest first (GET, ?pitId= for one pit), and a new
// test (POST). The arithmetic is in lib/earthing/earthing.ts; this route checks
// who is asking, snapshots the instrument and its calibration state on the test
// date, and writes.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { earthPits, earthTests, calibrationRecords, nonConformities, auditLog } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireRoles } from "@/lib/authz";
import { MAINTENANCE_WRITE_ROLES } from "@/lib/roles";
import { nextDocNumber } from "@/lib/doc-number";
import { statusForNextDate } from "@/lib/calibration";
import { isMissingTable } from "@/lib/db/missing-table";
import {
  EARTHING_SETUP_MESSAGE,
  METHOD_FALL_OF_POTENTIAL,
  SOIL_CONDITIONS,
  calibrationWarning,
  evaluateFallOfPotential,
  instrumentLabel,
  isHhMm,
  isIsoDate,
  newestFirst,
} from "@/lib/earthing/earthing";

const trimOrNull = (v: unknown, max = 1000): string | null => {
  const s = String(v ?? "").trim();
  return s ? s.slice(0, max) : null;
};

const today = () => new Date().toISOString().slice(0, 10);

// The instrument's state ON THE TEST DATE, not today: a back-dated test taken
// while the instrument was in date was a good reading on the day. A failed
// calibration parks the instrument until a person returns it to service, so the
// stored OUT_OF_SERVICE wins over any date.
function calStatusOn(rec: { status?: string | null; nextCalibrationDate?: string | null }, testDate: string) {
  if (rec.status === "OUT_OF_SERVICE") return "OUT_OF_SERVICE";
  return statusForNextDate(rec.nextCalibrationDate, Date.parse(`${testDate}T12:00:00Z`));
}

export async function GET(request: Request) {
  try {
    const pitId = new URL(request.url).searchParams.get("pitId");
    const rows = await db
      .select({
        test: earthTests,
        pitCode: earthPits.code,
        pitName: earthPits.name,
      })
      .from(earthTests)
      .leftJoin(earthPits, eq(earthTests.pitId, earthPits.id))
      .where(pitId ? eq(earthTests.pitId, pitId) : undefined)
      .orderBy(desc(earthTests.testDate));
    const tests = newestFirst(rows.map((r) => ({ ...r.test, pitCode: r.pitCode, pitName: r.pitName })));
    return NextResponse.json({ tests, setupRequired: false });
  } catch (err) {
    if (isMissingTable(err)) {
      return NextResponse.json({ tests: [], setupRequired: true, error: EARTHING_SETUP_MESSAGE });
    }
    console.error("Failed to load earth tests:", err);
    return NextResponse.json({ error: "Failed to load earth tests" }, { status: 500 });
  }
}

// Recording a test is the maintenance team's act (MAINTENANCE_WRITE_ROLES).
// HSE reads the record and the trend but does not write tests: they take part
// in the electrical-safety picture through permits and incidents, the same
// split the calibration register keeps. Widen it in roles.ts, not here, if
// LIMSL decide HSE should record tests too.
export async function POST(request: Request) {
  try {
    const gate = await requireRoles(MAINTENANCE_WRITE_ROLES);
    if (gate.res) return gate.res;

    const body = await request.json().catch(() => ({}));

    const testDate = String(body.testDate ?? "").trim() || today();
    if (!isIsoDate(testDate)) return NextResponse.json({ error: "The test date must be a date (YYYY-MM-DD)." }, { status: 400 });
    if (testDate > today()) return NextResponse.json({ error: "A test cannot be dated in the future." }, { status: 400 });
    const testTime = trimOrNull(body.testTime);
    if (testTime && !isHhMm(testTime)) return NextResponse.json({ error: "The test time must be HH:MM." }, { status: 400 });

    const soil = trimOrNull(body.soilCondition);
    if (soil && !(SOIL_CONDITIONS as readonly string[]).includes(soil)) {
      return NextResponse.json({ error: `Soil condition must be one of: ${SOIL_CONDITIONS.join(", ")}.` }, { status: 400 });
    }

    if (!body.pitId) return NextResponse.json({ error: "Choose the earth pit that was tested." }, { status: 400 });
    const [pit] = await db.select().from(earthPits).where(eq(earthPits.id, String(body.pitId))).limit(1);
    if (!pit) return NextResponse.json({ error: "Earth pit not found." }, { status: 404 });
    if (!pit.active) {
      return NextResponse.json(
        { error: `${pit.code} is out of use. Put it back in use before recording a test against it.` },
        { status: 400 },
      );
    }

    // A reading with no instrument against it cannot be traced to anything
    // (ISO 9001 7.1.5.2), so the instrument is required even though the column
    // allows null for the day an instrument record is ever removed.
    if (!body.instrumentId) {
      return NextResponse.json({ error: "Choose the instrument the test was taken with." }, { status: 400 });
    }
    const [instrument] = await db
      .select()
      .from(calibrationRecords)
      .where(eq(calibrationRecords.id, String(body.instrumentId)))
      .limit(1);
    if (!instrument) return NextResponse.json({ error: "Instrument not found in the calibration register." }, { status: 404 });

    const evaluated = evaluateFallOfPotential({
      currentProbeDistanceM: body.currentProbeDistanceM,
      r52: body.r52,
      r62: body.r62,
      r72: body.r72,
      singleReading: !!body.singleReading,
      limitOhms: pit.limitOhms,
    });
    if (!evaluated.ok) return NextResponse.json({ error: evaluated.error }, { status: 400 });
    const ev = evaluated.value;

    const calStatus = calStatusOn(instrument, testDate);
    const warning = calibrationWarning(calStatus);

    const testNumber = await nextDocNumber("ET");
    const row = {
      id: nanoid(),
      testNumber,
      pitId: pit.id,
      testDate,
      testTime,
      method: METHOD_FALL_OF_POTENTIAL,
      instrumentId: instrument.id,
      instrumentLabel: instrumentLabel(instrument),
      instrumentCalStatus: calStatus,
      currentProbeDistanceM: ev.currentProbeDistanceM,
      readings: JSON.stringify(ev.readings),
      resistanceOhms: ev.resistanceOhms,
      spreadPct: ev.spreadPct,
      consistent: ev.consistent,
      limitOhms: ev.limitOhms,
      verdict: ev.verdict,
      soilCondition: soil,
      weather: trimOrNull(body.weather, 200),
      remarks: trimOrNull(body.remarks, 2000),
      testedById: gate.actor?.id ?? null,
      testedByName: gate.actor?.name ?? null,
    };
    await db.insert(earthTests).values(row);

    // An earth above its limit is a defect in the site's protection against
    // electric shock and lightning, and it has to be acted on and closed out
    // like any other non-conformity: raised the same way a failed calibration
    // raises one.
    let raisedNc: { id: string; ncNumber: string } | null = null;
    if (ev.verdict === "FAIL") {
      const ncNumber = await nextDocNumber("NC");
      const description =
        `Earth pit ${pit.code} (${pit.name}${pit.location ? `, ${pit.location}` : ""}) measured ${ev.resistanceOhms} Ω ` +
        `against a limit of ${ev.limitOhms} Ω on ${testDate} (test ${testNumber}, fall-of-potential, ${row.instrumentLabel}). ` +
        `The earth electrode is not providing the protection it is installed for. Investigate the electrode and its ` +
        `connections, improve or replace it, and retest.` +
        (ev.consistent === false ? ` The readings were not consistent (spread ${ev.spreadPct}%), so retest with the current spike further out first.` : "") +
        (warning ? ` Note: ${warning}` : "");
      const nc = {
        id: nanoid(),
        ncNumber,
        type: "EARTHING_FAILURE",
        severity: "HIGH",
        detectedDate: today(),
        detectedBy: gate.actor?.name ?? "Earthing",
        relatedEntityType: "earth_test",
        relatedEntityId: row.id,
        equipmentId: null,
        description,
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
        entityDescription: `NC ${ncNumber} raised (HIGH), earth pit ${pit.code} above its limit`,
      });
    }

    await db.insert(auditLog).values({
      id: nanoid(),
      userId: gate.actor?.id ?? null,
      userName: gate.actor?.name ?? "User",
      action: "CREATE",
      entityType: "earth_test",
      entityId: row.id,
      entityDescription:
        `Earth test ${testNumber}: ${pit.code} ${ev.resistanceOhms} Ω (limit ${ev.limitOhms} Ω) ${ev.verdict} on ${testDate}` +
        ` · ${row.instrumentLabel} (${calStatus})` +
        (ev.consistent === false ? ` · readings inconsistent, spread ${ev.spreadPct}%` : "") +
        (raisedNc ? ` · NC ${raisedNc.ncNumber} raised` : ""),
    });

    return NextResponse.json(
      { ...row, pitCode: pit.code, pitName: pit.name, warning, advice: ev.advice, nonConformity: raisedNc },
      { status: 201 },
    );
  } catch (err) {
    if (isMissingTable(err)) return NextResponse.json({ error: EARTHING_SETUP_MESSAGE }, { status: 503 });
    console.error("Failed to record earth test:", err);
    return NextResponse.json({ error: "Failed to record the earth test" }, { status: 500 });
  }
}
