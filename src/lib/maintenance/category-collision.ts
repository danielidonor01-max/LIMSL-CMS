// src/lib/maintenance/category-collision.ts
// Global rule: No two equipment categories can ever share scheduled PM dates.
//
// Categories stagger maintenance across the annual calendar so that teams,
// tools and facilities are not overloaded on the same day. For example, cranes
// and welding machines cannot land on the same scheduled day.
import { plannedDatesFor } from "./plan-generation";
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
 * with any other active category on the annual schedule.
 */
export async function checkCategoryScheduleCollision(input: {
  categoryCode: string;
  label?: string;
  frequency: string;
  startDate: string | null;
  year?: number;
}): Promise<CollisionCheckResult> {
  const year = input.year ?? new Date().getFullYear();
  if (!input.startDate) {
    return { collides: false };
  }

  const proposedDates = plannedDatesFor({
    frequency: input.frequency,
    anchorDate: input.startDate,
    year,
  }).map((p) => p.plannedDate);

  if (proposedDates.length === 0) return { collides: false };

  // Load existing categories from DB or fallback
  let allCats: Array<{ code: string; label: string; maintenanceFrequency: string; defaultStartDate: string | null }> = [];
  try {
    allCats = await listCategories();
  } catch {
    // fallback to static defaults
    allCats = Object.keys(DEFAULT_CATEGORY_START_DATES).map((code) => ({
      code,
      label: EQUIPMENT_CATEGORY_LABELS[code] ?? code,
      maintenanceFrequency: DEFAULT_CATEGORY_FREQUENCIES[code] ?? "QUARTERLY",
      defaultStartDate: DEFAULT_CATEGORY_START_DATES[code] ?? null,
    }));
  }

  for (const other of allCats) {
    if (other.code === input.categoryCode) continue; // skip self
    const otherStart = other.defaultStartDate ?? DEFAULT_CATEGORY_START_DATES[other.code];
    if (!otherStart) continue;

    const otherDates = plannedDatesFor({
      frequency: other.maintenanceFrequency,
      anchorDate: otherStart,
      year,
    }).map((p) => p.plannedDate);

    const common = proposedDates.filter((d) => otherDates.includes(d));
    if (common.length > 0) {
      const catName = input.label || EQUIPMENT_CATEGORY_LABELS[input.categoryCode] || input.categoryCode;
      return {
        collides: true,
        collidingCategoryCode: other.code,
        collidingCategoryLabel: other.label,
        collidingDates: common,
        message: `Schedule collision detected: "${catName}" and "${other.label}" both have PM planned on ${common.join(", ")}. Different categories cannot share scheduled maintenance days.`,
      };
    }
  }

  return { collides: false };
}
