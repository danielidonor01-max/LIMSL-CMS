// src/lib/maintenance/category-collision.ts
// Global rule: No two equipment categories can ever share scheduled PM dates.
//
// Categories stagger maintenance across the annual calendar so that teams,
// tools and facilities are not overloaded on the same day. For example, cranes
// and welding machines cannot land on the same scheduled day.
//
// The days compared are the days AFTER the weekend rule, from the same shared
// calendar the plan is written from (plan-generation.ts). Comparing raw dates
// missed a Sunday that moves onto a Monday another category already owns.
import { calendarCollision, type CalendarCategory } from "./plan-generation";
import { listCategories } from "./asset-categories";
import { DEFAULT_CATEGORY_START_DATES, DEFAULT_CATEGORY_FREQUENCIES, EQUIPMENT_CATEGORY_LABELS } from "../constants";

export type CollisionCheckResult = {
  collides: boolean;
  collidingCategoryCode?: string;
  collidingCategoryLabel?: string;
  collidingDates?: string[];
  message?: string;
};

/**
 * Checks whether a proposed category schedule (frequency + start date) collides
 * with any other active category on the annual schedule, this year or next.
 */
export async function checkCategoryScheduleCollision(input: {
  categoryCode: string;
  label?: string;
  frequency: string;
  startDate: string | null;
  year?: number;
}): Promise<CollisionCheckResult> {
  if (!input.startDate) return { collides: false };

  let all: (CalendarCategory & { label: string })[] = [];
  try {
    all = await listCategories();
  } catch {
    all = Object.keys(DEFAULT_CATEGORY_START_DATES).map((code) => ({
      code,
      label: EQUIPMENT_CATEGORY_LABELS[code] ?? code,
      maintenanceFrequency: DEFAULT_CATEGORY_FREQUENCIES[code] ?? "QUARTERLY",
      defaultStartDate: DEFAULT_CATEGORY_START_DATES[code] ?? null,
    }));
  }

  const proposal = { code: input.categoryCode, maintenanceFrequency: input.frequency, defaultStartDate: input.startDate };
  // Weekdays fall differently every year, so a start date that is clean this
  // year can collide next year. Both are checked; the plan is only ever written
  // a year at a time, so further out is not yet a promise anybody relies on.
  const year = input.year ?? new Date().getFullYear();
  for (const y of [year, year + 1]) {
    const hit = calendarCollision(all, proposal, y);
    if (!hit) continue;
    const other = all.find((c) => c.code === hit.code);
    const otherLabel = other?.label ?? EQUIPMENT_CATEGORY_LABELS[hit.code] ?? hit.code;
    const catName = input.label || EQUIPMENT_CATEGORY_LABELS[input.categoryCode] || input.categoryCode;
    return {
      collides: true,
      collidingCategoryCode: hit.code,
      collidingCategoryLabel: otherLabel,
      collidingDates: hit.dates,
      message:
        `Schedule collision detected: "${catName}" and "${otherLabel}" would both have PM on ${hit.dates.join(", ")} ` +
        `(weekend dates move to the next free working day). Different categories cannot share scheduled maintenance days.`,
    };
  }
  return { collides: false };
}
