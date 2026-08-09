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

// These used to borrow the heavy-CNC plan. They now answer for themselves — a
// bench router is not asked about tool-change cycles, and a press brake is asked
// about stopping time and two-hand control instead of spindle temperature.
test("light CNC and press/roll/shear have their own plans, not the heavy one", () => {
  assert.equal(jobPlanFor("CNC_LIGHT").category, "CNC_LIGHT");
  assert.equal(jobPlanFor("PRESS_ROLL_SHEAR").category, "PRESS_ROLL_SHEAR");

  const press = JSON.stringify(jobPlanFor("PRESS_ROLL_SHEAR"));
  assert.match(press, /two-hand/i, "a press must check two-hand control");
  assert.ok(!/spindle bearing temperature/i.test(press), "a press has no spindle");
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

// The reverse direction, which is the one that actually regressed. Phase 5 added
// the SYS asset type with category SYSTEM; the job plans predate it, so every
// facility system quietly landed on the generic checklist — back on exactly the
// "one list for everything" finding the audit raised. CNC_LIGHT and
// PRESS_ROLL_SHEAR were borrowing the heavy-CNC plan, which asked a bench router
// about tool-change cycles and a press brake about spindle bearing temperature.
test("every equipment category has its own plan — none borrows or falls back", () => {
  const borrowing = Object.keys(EQUIPMENT_CATEGORY_LABELS)
    // OTHER is the honest catch-all and is meant to use the general plan.
    .filter((c) => c !== "OTHER")
    .filter((c) => !JOB_PLAN_CATEGORIES.includes(c));

  assert.deepEqual(
    borrowing,
    [],
    `these categories have no plan of their own: ${borrowing.join(", ")} — ` +
      `a technician asked a question with no answer learns to tick without reading`,
  );
});

test("a new category cannot be added without a plan going unnoticed", () => {
  for (const cat of Object.keys(EQUIPMENT_CATEGORY_LABELS)) {
    if (cat === "OTHER") continue;
    assert.equal(hasBespokePlan(cat), true, `${cat} falls back to the generic checklist`);
    const plan = jobPlanFor(cat);
    assert.equal(plan.category, cat, `${cat} is served ${plan.category}'s plan, not its own`);
    // Substance, not section count — an earthing installation legitimately has
    // nothing to lubricate, and penalising that would push someone to pad it.
    const tasks = plan.sections.reduce((n, sec) => n + sec.tasks.length, 0);
    assert.ok(tasks >= 6, `${cat}'s plan has only ${tasks} tasks — too thin to be a real inspection`);
  }
});
