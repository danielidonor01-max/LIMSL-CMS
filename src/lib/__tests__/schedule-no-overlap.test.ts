// src/lib/__tests__/schedule-no-overlap.test.ts
// Verifies that equipment categories have distinct, staggered annual PM start dates
// and that their scheduled preventive maintenance dates do not collide on the same day.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_CATEGORY_START_DATES,
  DEFAULT_CATEGORY_FREQUENCIES,
  EQUIPMENT_CATEGORY_LABELS,
} from "../constants";
import { plannedDatesFor, categoryCalendar } from "../maintenance/plan-generation";

test("all official equipment categories have defined start dates and frequencies", () => {
  const codes = Object.keys(EQUIPMENT_CATEGORY_LABELS);
  assert.ok(codes.length >= 10, "Expected at least 10 categories");

  for (const code of codes) {
    assert.ok(
      DEFAULT_CATEGORY_START_DATES[code],
      `Category ${code} is missing a DEFAULT_CATEGORY_START_DATE`,
    );
    assert.ok(
      DEFAULT_CATEGORY_FREQUENCIES[code],
      `Category ${code} is missing a DEFAULT_CATEGORY_FREQUENCY`,
    );
  }
});

test("welding machines and cranes never have PM on the same day", () => {
  const cranePlans = plannedDatesFor({
    frequency: DEFAULT_CATEGORY_FREQUENCIES.CRANE,
    anchorDate: DEFAULT_CATEGORY_START_DATES.CRANE,
    year: 2026,
  });
  const weldingPlans = plannedDatesFor({
    frequency: DEFAULT_CATEGORY_FREQUENCIES.WELDING,
    anchorDate: DEFAULT_CATEGORY_START_DATES.WELDING,
    year: 2026,
  });

  const craneDates = new Set(cranePlans.map((p) => p.plannedDate));
  const weldingDates = new Set(weldingPlans.map((p) => p.plannedDate));

  for (const d of craneDates) {
    assert.ok(
      !weldingDates.has(d),
      `Crane and Welding collided on date ${d}`,
    );
  }
});

test("no two equipment categories have overlapping PM dates across the entire annual schedule", () => {
  const year = 2026;
  const dateToCategories = new Map<string, string[]>();

  // Through the shared calendar, which is how the plan is built: a category
  // planned on its own cannot know that its Sunday shifts onto a Monday that
  // another category already owns.
  const calendar = categoryCalendar(
    Object.entries(DEFAULT_CATEGORY_START_DATES).map(([code, start]) => ({
      code,
      maintenanceFrequency: DEFAULT_CATEGORY_FREQUENCIES[code] ?? "QUARTERLY",
      defaultStartDate: start,
    })),
    year,
  );
  for (const [code, dates] of calendar.dates) {
    for (const date of dates) {
      if (!dateToCategories.has(date)) dateToCategories.set(date, []);
      dateToCategories.get(date)!.push(code);
    }
  }

  const collisions: { date: string; categories: string[] }[] = [];
  for (const [date, categories] of dateToCategories.entries()) {
    if (categories.length > 1) {
      collisions.push({ date, categories });
    }
  }

  assert.deepEqual(
    collisions,
    [],
    `Equipment categories must not have overlapping PM dates:\n${collisions
      .map((c) => `  ${c.date}: ${c.categories.join(", ")}`)
      .join("\n")}`,
  );
});
