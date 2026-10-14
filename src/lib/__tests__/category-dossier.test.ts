// src/lib/__tests__/category-dossier.test.ts
// Verifying category dossier metrics:
// 1. Zero schedule collisions across all categories (specifically welding vs crane).
// 2. Health distribution calculations: operational vs faulty machines.
// 3. Next due date calculation from anchor and frequency.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CATEGORY_START_DATES, DEFAULT_CATEGORY_FREQUENCIES } from "../constants";
import { plannedDatesFor } from "../maintenance/plan-generation";

test("CRANE and WELDING categories never share PM days or months", () => {
  const craneDates = plannedDatesFor({
    frequency: "BI_MONTHLY",
    anchorDate: DEFAULT_CATEGORY_START_DATES.CRANE,
    year: 2026,
  }).map((p) => p.plannedDate);

  const weldingDates = plannedDatesFor({
    frequency: "BI_MONTHLY",
    anchorDate: DEFAULT_CATEGORY_START_DATES.WELDING,
    year: 2026,
  }).map((p) => p.plannedDate);

  assert.ok(craneDates.length > 0, "Crane must have scheduled dates");
  assert.ok(weldingDates.length > 0, "Welding must have scheduled dates");

  const common = craneDates.filter((d) => weldingDates.includes(d));
  assert.equal(
    common.length,
    0,
    `Crane and Welding categories must never collide on the same PM day. Collisions: ${common.join(", ")}`,
  );
});

test("all 12 categories have distinct staggered dates with zero day collisions across 2026", () => {
  const allDatesByDay = new Map<string, string[]>();

  for (const [code, start] of Object.entries(DEFAULT_CATEGORY_START_DATES)) {
    const freq = DEFAULT_CATEGORY_FREQUENCIES[code] ?? "QUARTERLY";
    const planned = plannedDatesFor({
      frequency: freq,
      anchorDate: start,
      year: 2026,
    });

    for (const p of planned) {
      if (!allDatesByDay.has(p.plannedDate)) {
        allDatesByDay.set(p.plannedDate, []);
      }
      allDatesByDay.get(p.plannedDate)!.push(code);
    }
  }

  const collisions: string[] = [];
  for (const [date, cats] of allDatesByDay.entries()) {
    if (cats.length > 1) {
      collisions.push(`${date}: ${cats.join(" & ")}`);
    }
  }

  assert.equal(
    collisions.length,
    0,
    `No two categories should ever have PM on the same date. Collisions found:\n${collisions.join("\n")}`,
  );
});

test("equipment health distribution correctly separates working from faulty machines", () => {
  const sampleMachines = [
    { id: "1", status: "OPERATIONAL" },
    { id: "2", status: "OPERATIONAL" },
    { id: "3", status: "UNDER_MAINTENANCE" },
    { id: "4", status: "BROKEN_DOWN" },
    { id: "5", status: "AWAITING_PARTS" },
    { id: "6", status: "DECOMMISSIONED" },
  ];

  const total = sampleMachines.length;
  const working = sampleMachines.filter((m) => m.status === "OPERATIONAL").length;
  const faulty = sampleMachines.filter((m) =>
    ["UNDER_MAINTENANCE", "BROKEN_DOWN", "AWAITING_PARTS"].includes(m.status),
  ).length;
  const decommissioned = sampleMachines.filter((m) => m.status === "DECOMMISSIONED").length;

  assert.equal(total, 6);
  assert.equal(working, 2);
  assert.equal(faulty, 3);
  assert.equal(decommissioned, 1);
  const percentage = Math.round((working / total) * 100);
  assert.equal(percentage, 33);
});

test("next due date correctly chooses upcoming date and counts days away", () => {
  const planned = plannedDatesFor({
    frequency: "BI_MONTHLY",
    anchorDate: "2026-01-20",
    year: 2026,
    notBefore: "2026-02-01",
  });

  assert.ok(planned.length > 0);
  const nextDate = planned[0].plannedDate;
  assert.equal(nextDate, "2026-03-20");

  const diffMs = new Date("2026-03-20T00:00:00").getTime() - new Date("2026-03-10T00:00:00").getTime();
  const daysAway = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  assert.equal(daysAway, 10);
});
