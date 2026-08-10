// src/lib/hse/permit-form.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PERMIT_WORK_TYPES,
  WORK_AREA_PRECAUTIONS,
  PPE_REQUIREMENTS,
  REQUIRED_DOCUMENTS,
  mandatoryPrecautionsFor,
  missingMandatoryPrecautions,
  selectedPpe,
  isChecklistComplete,
  unmarkedItems,
  validateWorkTypes,
} from "./permit-form";

test("the transcribed lists match the paper form", () => {
  assert.equal(PERMIT_WORK_TYPES.length, 5);
  assert.equal(REQUIRED_DOCUMENTS.length, 4);
  assert.equal(WORK_AREA_PRECAUTIONS.length, 14);
  assert.equal(PPE_REQUIREMENTS.length, 13);
});

test("every checklist key is unique", () => {
  for (const list of [WORK_AREA_PRECAUTIONS, PPE_REQUIREMENTS, REQUIRED_DOCUMENTS]) {
    const keys = list.map((i) => i.key);
    assert.equal(new Set(keys).size, keys.length);
  }
});

test("hot work cannot be permitted without a fire watch", () => {
  const missing = missingMandatoryPrecautions(["HOT_WORK"], { CLEAR_AREA: "YES" });
  assert.deepEqual(missing, ["Fire Extinguisher/Fire Watch"]);
});

test("crossing out a mandatory control does not satisfy it", () => {
  const missing = missingMandatoryPrecautions(["HOT_WORK"], { FIRE_WATCH: "NO", CLEAR_AREA: "NA" });
  assert.equal(missing.length, 2);
});

test("confined space demands gas testing and ventilation", () => {
  const missing = missingMandatoryPrecautions(["CONFINED_SPACE"], {});
  assert.deepEqual(missing.sort(), ["Gas Testing prior to work", "Provide Ventilation"].sort());
});

test("a permit covering two work types carries both sets of controls once", () => {
  const req = mandatoryPrecautionsFor(["HOT_WORK", "ENERGIZED_SYSTEM", "HOT_WORK"]);
  const keys = req.map((r) => r.key).sort();
  assert.deepEqual(keys, ["CLEAR_AREA", "DE_ENERGIZING", "FIRE_WATCH"]);
});

test("cold work adds no mandatory controls of its own", () => {
  assert.deepEqual(missingMandatoryPrecautions(["COLD_WORK"], {}), []);
});

test("an unknown work type contributes nothing rather than throwing", () => {
  assert.deepEqual(mandatoryPrecautionsFor(["NONSENSE"]), []);
});

test("selected PPE comes back in the printed order", () => {
  const ppe = selectedPpe({ HEARING: "YES", HELMET: "YES", GLOVES: "NO", GOGGLES: "YES" });
  assert.deepEqual(ppe, ["Safety Helmet", "Safety Goggles", "Hearing Protection"]);
});

test("no PPE marks reads as none selected, not as a crash", () => {
  assert.deepEqual(selectedPpe(null), []);
  assert.deepEqual(selectedPpe(undefined), []);
  assert.deepEqual(selectedPpe({}), []);
});

test("a blank line is not the same as a crossed one", () => {
  const marks = Object.fromEntries(WORK_AREA_PRECAUTIONS.map((p) => [p.key, "NO" as const]));
  assert.equal(isChecklistComplete(WORK_AREA_PRECAUTIONS, marks), true);

  delete (marks as Record<string, string>).WET_DOWN;
  assert.equal(isChecklistComplete(WORK_AREA_PRECAUTIONS, marks), false);
  assert.deepEqual(unmarkedItems(WORK_AREA_PRECAUTIONS, marks), ["Wet Down Surrounding"]);
});

test("an empty checklist is incomplete, not vacuously complete", () => {
  assert.equal(isChecklistComplete(WORK_AREA_PRECAUTIONS, {}), false);
  assert.equal(isChecklistComplete(WORK_AREA_PRECAUTIONS, null), false);
});

test("a permit must name at least one type of work", () => {
  assert.equal(validateWorkTypes([]).ok, false);
  assert.equal(validateWorkTypes(null).ok, false);
  assert.equal(validateWorkTypes(["MADE_UP"]).ok, false);
});

test("duplicate work types collapse to one", () => {
  const r = validateWorkTypes(["HOT_WORK", "HOT_WORK", "COLD_WORK"]);
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.workTypes, ["HOT_WORK", "COLD_WORK"]);
});
