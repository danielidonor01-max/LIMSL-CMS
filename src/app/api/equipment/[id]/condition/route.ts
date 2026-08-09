// src/app/api/equipment/[id]/condition/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { conditionPoints, conditionReadings, equipment } from "@/lib/db/schema";
import { eq, inArray, desc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireRoles } from "@/lib/authz";
import { MAINTENANCE_WRITE_ROLES } from "@/lib/roles";
import { verdictFor, trendOf, programmeHealth, CONDITION_UNITS, type ConditionKind } from "@/lib/maintenance/condition";
import { logEquipmentEvent } from "@/lib/equipment-log";

// Points with their readings, verdict and trend. Computed here so the twin, a
// report and any future dashboard cannot disagree about whether a bearing is
// heating up.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const points = await db.select().from(conditionPoints).where(eq(conditionPoints.equipmentId, id));
    if (!points.length) {
      return NextResponse.json({ points: [], health: programmeHealth([]) });
    }

    const readings = await db
      .select()
      .from(conditionReadings)
      .where(inArray(conditionReadings.pointId, points.map((p) => p.id)))
      .orderBy(desc(conditionReadings.takenOn))
      .limit(500);

    const byPoint = new Map<string, typeof readings>();
    for (const r of readings) byPoint.set(r.pointId, [...(byPoint.get(r.pointId) ?? []), r]);

    const enriched = points.map((p) => {
      const rs = byPoint.get(p.id) ?? [];
      const latest = rs[0] ?? null;
      return {
        ...p,
        latest,
        verdict: latest ? verdictFor(latest.value, p.alertLimit, p.alarmLimit) : "NO_LIMIT",
        trend: trendOf(rs.map((r) => ({ value: r.value, takenOn: r.takenOn })), p.alarmLimit),
        readings: rs.slice(0, 24),
      };
    });

    return NextResponse.json({
      points: enriched,
      health: programmeHealth(points.map((p) => ({ lastReadingDate: p.lastReadingDate, intervalDays: p.intervalDays }))),
    });
  } catch (error) {
    console.error("Failed to load condition data:", error);
    return NextResponse.json({ error: "Failed to load condition data" }, { status: 500 });
  }
}

// POST creates a measurement point, or records a reading against one.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const gate = await requireRoles(MAINTENANCE_WRITE_ROLES);
    if (gate.res) return gate.res;

    const { id } = await params;
    const body = await request.json();

    const [eq0] = await db.select().from(equipment).where(eq(equipment.id, id)).limit(1);
    if (!eq0) return NextResponse.json({ error: "Equipment not found" }, { status: 404 });

    const num = (v: unknown): number | null => {
      if (v === null || v === undefined || v === "") return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };

    if (body.kind === "READING") {
      const value = num(body.value);
      if (value === null) return NextResponse.json({ error: "Enter the reading as a number." }, { status: 400 });

      const [point] = await db.select().from(conditionPoints).where(eq(conditionPoints.id, body.pointId)).limit(1);
      if (!point || point.equipmentId !== id) {
        return NextResponse.json({ error: "Measurement point not found on this machine." }, { status: 404 });
      }

      const takenOn = String(body.takenOn ?? "").slice(0, 10) || new Date().toISOString().slice(0, 10);
      if (takenOn > new Date().toISOString().slice(0, 10)) {
        return NextResponse.json({ error: "A reading cannot be dated in the future." }, { status: 400 });
      }

      const verdict = verdictFor(value, point.alertLimit, point.alarmLimit);

      await db.insert(conditionReadings).values({
        id: nanoid(),
        pointId: point.id,
        value,
        takenOn,
        verdict,
        notes: body.notes || null,
        takenById: gate.actor?.id ?? null,
        takenByName: gate.actor?.name ?? null,
      });
      await db.update(conditionPoints).set({ lastReadingDate: takenOn }).where(eq(conditionPoints.id, point.id));

      // Only an out-of-limit reading is worth a history entry. Logging every
      // routine measurement would bury the machine's real events under noise.
      if (verdict === "ALERT" || verdict === "ALARM") {
        await logEquipmentEvent({
          equipmentId: id,
          category: "INSPECTION",
          source: "AUTO",
          title: `${point.name}: ${value} ${point.unit ?? ""}, ${verdict === "ALARM" ? "above alarm level" : "above alert level"}`,
          detail: body.notes || null,
          occurredAt: takenOn,
          performedById: gate.actor?.id ?? null,
          performedByName: gate.actor?.name ?? null,
        });
      }

      return NextResponse.json({ ok: true, verdict }, { status: 201 });
    }

    const name = String(body.name ?? "").trim();
    const kind = String(body.kind ?? "TEMPERATURE") as ConditionKind;
    if (!name) return NextResponse.json({ error: "Name the measurement point." }, { status: 400 });

    const alert = num(body.alertLimit);
    const alarm = num(body.alarmLimit);
    // Thresholds the wrong way round would make every reading an alarm and no
    // reading an alert, silently useless.
    if (alert !== null && alarm !== null && alert >= alarm) {
      return NextResponse.json(
        { error: "The alert level must be below the alarm level, alert means plan, alarm means stop." },
        { status: 400 },
      );
    }

    const row = {
      id: nanoid(),
      equipmentId: id,
      name,
      kind,
      unit: body.unit || CONDITION_UNITS[kind] || null,
      alertLimit: alert,
      alarmLimit: alarm,
      intervalDays: num(body.intervalDays) ?? 90,
      lastReadingDate: null,
      notes: body.notes || null,
    };
    await db.insert(conditionPoints).values(row);
    return NextResponse.json(row, { status: 201 });
  } catch (error) {
    console.error("Failed to save condition data:", error);
    return NextResponse.json({ error: "Failed to save condition data" }, { status: 500 });
  }
}
