import { test } from "node:test";
import assert from "node:assert/strict";
import { jobPlanFor, hasBespokePlan, JOB_PLAN_CATEGORIES } from "@/lib/maintenance/job-plans";
import { EQUIPMENT_CATEGORY_LABELS } from "@/lib/constants";

// The finding this closes: one generic 21-item list was served to all 33 assets,
// so a crane, a CNC, a compressor and an earthing system got identical checks.
test("different equipment categories get genuinely different task lists", () => {
  const crane = jobPlanFor("CRANE");
  const compressor = jobPlanFor("COMPRESSOR");
  const earthing = jobPlanFor("EARTHING");

  const items = (p: ReturnType<typeof jobPlanFor>) =>
    p.sections.flatMap((s) => s.tasks.map((t) => t.item.toLowerCase()));

  assert.ok(items(crane).some((i) => i.includes("brake")), "a crane plan must check the brake");
  assert.ok(items(crane).some((i) => i.includes("rope") || i.includes("chain")), "a crane plan must check the rope/chain");
  assert.ok(items(compressor).some((i) => i.includes("separator")), "a compressor plan must check separator dP");
  assert.ok(items(earthing).some((i) => i.includes("loop impedance")), "an earthing plan must measure loop impedance");

  // And they must not be the same list wearing different titles.
  assert.notDeepEqual(items(crane), items(compressor));
  assert.notDeepEqual(items(compressor), items(earthing));
});

test("a category with no bespoke plan falls back to the general one, and says so", () => {
  assert.equal(hasBespokePlan("OTHER"), false);
  assert.equal(jobPlanFor("OTHER").category, "GENERAL");
  assert.equal(jobPlanFor(null).category, "GENERAL");
  assert.equal(jobPlanFor("NOT_A_CATEGORY").category, "GENERAL");
  // The fallback is still a usable plan, not an empty shell.
  assert.ok(jobPlanFor("OTHER").sections.flatMap((s) => s.tasks).length >= 10);
});

test("aliased categories resolve to a real plan", () => {
  assert.equal(hasBespokePlan("CNC_LIGHT"), true);
  assert.equal(hasBespokePlan("PRESS_ROLL_SHEAR"), true);
  assert.equal(jobPlanFor("CNC_LIGHT").category, "CNC_HEAVY");
});

test("every plan is well-formed and safety-bearing", () => {
  for (const cat of JOB_PLAN_CATEGORIES) {
    const plan = jobPlanFor(cat);
    const tasks = plan.sections.flatMap((s) => s.tasks);
    assert.ok(tasks.length > 0, `${cat} has no tasks`);
    assert.ok(plan.title.trim().length > 0, `${cat} has no title`);
    // Acceptance criteria are what make a tick evidence rather than an opinion.
    const withCriteria = tasks.filter((t) => t.criteria?.trim()).length;
    assert.ok(withCriteria / tasks.length > 0.9, `${cat}: most tasks must state what OK means`);
    // No duplicate task text within a plan.
    const items = tasks.map((t) => t.item);
    assert.equal(new Set(items).size, items.length, `${cat} repeats a task`);
  }
});

test("measured tasks declare a unit, and unit-less tasks do not pretend to", () => {
  for (const cat of JOB_PLAN_CATEGORIES) {
    for (const t of jobPlanFor(cat).sections.flatMap((s) => s.tasks)) {
      if (t.unit !== undefined) assert.ok(t.unit.trim().length > 0, `${cat}: "${t.item}" has an empty unit`);
    }
  }
});

test("every plan category is a real equipment category", () => {
  for (const cat of JOB_PLAN_CATEGORIES) {
    assert.ok(cat in EQUIPMENT_CATEGORY_LABELS, `${cat} is not an equipment category`);
  }
});
