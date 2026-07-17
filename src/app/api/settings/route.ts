// src/app/api/settings/route.ts
// Organisation-wide app settings (single "singleton" row). GET is readable by any
// authenticated user — the corrective form and KPI engine need the working-hours
// window. PATCH is restricted to the Super Admin.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { appSettings } from "@/lib/db/schema";
import { requireRoles } from "@/lib/authz";
import { SETTINGS_WRITE_ROLES } from "@/lib/roles";
import { getSettingsRow, rowToWorkSettings, SETTINGS_ID } from "@/lib/settings";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function normalize(row: Awaited<ReturnType<typeof getSettingsRow>>) {
  const ws = rowToWorkSettings(row);
  return {
    ...ws,
    updatedByName: row?.updatedByName ?? null,
    updatedAt: row?.updatedAt ?? null,
  };
}

export async function GET() {
  try {
    const row = await getSettingsRow();
    return NextResponse.json(normalize(row));
  } catch (error: any) {
    console.error("Failed to load settings:", error);
    return NextResponse.json({ error: "Failed to load settings", details: error.message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const gate = await requireRoles(SETTINGS_WRITE_ROLES);
    if (gate.res) return gate.res;

    const body = await request.json();

    // Validate before writing — a bad window would silently break downtime maths.
    for (const [key, label] of [["workDayStart", "Work start"], ["workDayEnd", "Work end"]] as const) {
      if (!TIME_RE.test(body[key] ?? "")) {
        return NextResponse.json({ error: `${label} must be a valid HH:MM time.` }, { status: 400 });
      }
    }
    if (body.workDayEnd <= body.workDayStart) {
      return NextResponse.json({ error: "Work end must be after work start." }, { status: 400 });
    }

    const hasLunch = body.lunchStart || body.lunchEnd;
    if (hasLunch) {
      if (!TIME_RE.test(body.lunchStart ?? "") || !TIME_RE.test(body.lunchEnd ?? "")) {
        return NextResponse.json({ error: "Lunch times must be valid HH:MM, or both left blank." }, { status: 400 });
      }
      if (body.lunchEnd <= body.lunchStart) {
        return NextResponse.json({ error: "Lunch end must be after lunch start." }, { status: 400 });
      }
    }

    const days: number[] = Array.isArray(body.workingDays)
      ? Array.from(new Set(body.workingDays.map(Number).filter((n: number) => Number.isInteger(n) && n >= 0 && n <= 6))).sort() as number[]
      : [1, 2, 3, 4, 5];
    if (!days.length) {
      return NextResponse.json({ error: "Select at least one working day." }, { status: 400 });
    }

    const values = {
      id: SETTINGS_ID,
      workDayStart: body.workDayStart,
      workDayEnd: body.workDayEnd,
      lunchStart: hasLunch ? body.lunchStart : null,
      lunchEnd: hasLunch ? body.lunchEnd : null,
      workingDays: JSON.stringify(days),
      weekendOvertime: !!body.weekendOvertime,
      updatedById: gate.actor?.id ?? null,
      updatedByName: gate.actor?.name ?? null,
      updatedAt: new Date().toISOString(),
    };

    await db
      .insert(appSettings)
      .values(values)
      .onConflictDoUpdate({ target: appSettings.id, set: values });

    const row = await getSettingsRow();
    return NextResponse.json(normalize(row));
  } catch (error: any) {
    console.error("Failed to save settings:", error);
    return NextResponse.json({ error: "Failed to save settings", details: error.message }, { status: 500 });
  }
}
