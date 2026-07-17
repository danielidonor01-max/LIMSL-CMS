// src/lib/settings.ts
// Server-side accessor for the single-row app settings. Converts the stored row
// into the WorkSettings shape the production-time calculator consumes, falling
// back to sane defaults when the row (or a field) is missing.
import { db } from "@/lib/db";
import { appSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { DEFAULT_WORK_SETTINGS, type WorkSettings } from "@/lib/worktime";

export const SETTINGS_ID = "singleton";

export async function getSettingsRow() {
  const rows = await db.select().from(appSettings).where(eq(appSettings.id, SETTINGS_ID)).limit(1);
  return rows[0] ?? null;
}

export function rowToWorkSettings(row: Awaited<ReturnType<typeof getSettingsRow>>): WorkSettings {
  if (!row) return DEFAULT_WORK_SETTINGS;
  let workingDays = DEFAULT_WORK_SETTINGS.workingDays;
  try {
    const parsed = JSON.parse(row.workingDays);
    if (Array.isArray(parsed)) {
      const nums = parsed.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
      if (nums.length) workingDays = nums;
    }
  } catch {
    // keep default
  }
  return {
    workDayStart: row.workDayStart || DEFAULT_WORK_SETTINGS.workDayStart,
    workDayEnd: row.workDayEnd || DEFAULT_WORK_SETTINGS.workDayEnd,
    lunchStart: row.lunchStart ?? null,
    lunchEnd: row.lunchEnd ?? null,
    workingDays,
    weekendOvertime: !!row.weekendOvertime,
  };
}

export async function getWorkSettings(): Promise<WorkSettings> {
  return rowToWorkSettings(await getSettingsRow());
}
