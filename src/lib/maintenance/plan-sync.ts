// src/lib/maintenance/plan-sync.ts
// Writing a machine's plan into the schedule.
//
// The arithmetic lives in plan-generation.ts and is pure. This is the half that
// touches the database, kept separate so the rule can be tested without one and
// so every caller — adding a machine, changing its interval, importing a
// hundred at once — puts the same rows in.
//
// It only ever ADDS the dates that are missing. Rows somebody has rescheduled,
// deferred or completed are decisions people made, and a generator that
// overwrote them would erase those decisions silently, which is worse than
// having no generator at all.
import { db } from "@/lib/db";
import { maintenanceSchedule, auditLog } from "@/lib/db/schema";
import { and, eq, gte, lte } from "drizzle-orm";
import { nanoid } from "nanoid";
import { DEFAULT_CATEGORY_START_DATES, DEFAULT_CATEGORY_FREQUENCIES } from "@/lib/constants";
import {
  plannedDatesFor,
  missingDates,
  categoryCalendar,
  type CalendarCategory,
  type PlannedActivity,
} from "./plan-generation";
import { listCategories } from "./asset-categories";

export type PlanSyncResult = { added: number; dates: string[]; skipped: number };

export async function syncPlanForEquipment(
  machine: {
    id: string;
    category?: string | null;
    assetId?: string | null;
    name?: string | null;
    maintenanceFrequency?: string | null;
    commissioningDate?: string | null;
    lastMaintenanceDate?: string | null;
  },
  opts: {
    year?: number;
    /** Nothing is planned before this. Defaults to today. */
    notBefore?: string | null;
    actor?: { id?: string | null; name?: string | null };
  } = {},
): Promise<PlanSyncResult> {
  const year = opts.year ?? new Date().getFullYear();
  const notBefore = opts.notBefore === null ? null : (opts.notBefore ?? new Date().toISOString().slice(0, 10));

  let wanted: PlannedActivity[] = [];
  let byCategory = false;
  if (machine.category) {
    // A category's machines are serviced on the category's days, and those
    // days are resolved against every other category at once, so a weekend
    // date moved to Monday never lands on a Monday somebody else owns.
    let categories: CalendarCategory[] = [];
    try {
      categories = await listCategories();
    } catch {
      categories = Object.entries(DEFAULT_CATEGORY_START_DATES).map(([code, defaultStartDate]) => ({
        code,
        maintenanceFrequency: DEFAULT_CATEGORY_FREQUENCIES[code] ?? null,
        defaultStartDate,
      }));
    }
    const own = categories.find((c) => c.code === machine.category);
    if (own?.defaultStartDate) {
      byCategory = true;
      // The category owns the interval as well as the start date, so the
      // machine's own copy of the interval is not consulted here.
      const calendar = categoryCalendar(categories, year);
      wanted = (calendar.dates.get(own.code) ?? [])
        .filter((d) => !notBefore || d >= notBefore.slice(0, 10))
        .map((plannedDate) => {
          const month = Number(plannedDate.slice(5, 7));
          return { plannedDate, month, quarter: Math.floor((month - 1) / 3) + 1, activityType: "PM" as const };
        });
    }
  }
  // Only a machine whose category has no start date counts from its own
  // commissioning or last service. A category machine with nothing left this
  // year has nothing left; it does not fall back to a date of its own.
  if (!byCategory) {
    wanted = plannedDatesFor({
      frequency: machine.maintenanceFrequency,
      anchorDate: machine.lastMaintenanceDate || machine.commissioningDate || null,
      year,
      notBefore,
    });
  }
  if (wanted.length === 0) return { added: 0, dates: [], skipped: 0 };

  const existing = await db
    .select({ plannedDate: maintenanceSchedule.plannedDate })
    .from(maintenanceSchedule)
    .where(
      and(
        eq(maintenanceSchedule.equipmentId, machine.id),
        gte(maintenanceSchedule.plannedDate, `${year}-01-01`),
        lte(maintenanceSchedule.plannedDate, `${year}-12-31`),
      ),
    );

  const gaps = missingDates(wanted, existing);
  if (gaps.length === 0) return { added: 0, dates: [], skipped: existing.length };

  await db.insert(maintenanceSchedule).values(
    gaps.map((g) => ({
      id: nanoid(),
      equipmentId: machine.id,
      year,
      quarter: g.quarter,
      month: g.month,
      plannedDate: g.plannedDate,
      activityType: g.activityType,
      maintenanceFrequency: machine.maintenanceFrequency ?? null,
      status: "SCHEDULED",
    })),
  );

  const label = [machine.assetId, machine.name].filter(Boolean).join(" ") || machine.id;
  await db.insert(auditLog).values({
    id: nanoid(),
    userId: opts.actor?.id ?? null,
    userName: opts.actor?.name || "System",
    action: "CREATE",
    entityType: "maintenance_schedule",
    entityId: machine.id,
    entityDescription:
      `${label} added to the ${year} plan, ${gaps.length} PM activit${gaps.length === 1 ? "y" : "ies"} ` +
      `at ${String(machine.maintenanceFrequency ?? "").toLowerCase().replace(/_/g, " ")}: ` +
      gaps.map((g) => g.plannedDate).join(", "),
  });

  return { added: gaps.length, dates: gaps.map((g) => g.plannedDate), skipped: existing.length };
}

/**
 * A category's next PM day after `after`, and not before `notBefore`.
 *
 * Completing a PM rolls the series on, and rolling it from the date it was
 * done on would let one weekend shift drag every later date a day or two
 * further from the category's start date. The calendar is counted from the
 * start date every time, so the series stays on it. Null when the category has
 * no start date, and the caller falls back to counting from the row.
 */
export async function nextCategoryDate(code: string, after: string, notBefore: string): Promise<string | null> {
  const categories = await listCategories();
  if (!categories.find((c) => c.code === code)?.defaultStartDate) return null;
  const from = Number(after.slice(0, 4));
  for (const year of [from, from + 1, from + 2]) {
    const hit = (categoryCalendar(categories, year).dates.get(code) ?? []).find((d) => d > after && d >= notBefore);
    if (hit) return hit;
  }
  return null;
}
