// src/lib/hse/category-ppe.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { ppeForCategory, PPE_BY_CATEGORY, ppeKeysAreKnown } from "./category-ppe";
import { PPE_REQUIREMENTS } from "./permit-form";
import { EQUIPMENT_CATEGORY_LABELS } from "@/lib/constants";

test("every key maps to real PPE, so no line on a safety notice is blank", () => {
  // The failure this prevents is silent: an unknown key renders nothing, and a
  // person reads a shorter PPE list than the machine actually needs.
  assert.deepEqual(ppeKeysAreKnown(), []);
});

test("the words come from the one list that owns them", () => {
  // The permit face, the hazard analysis and this passport all describe the
  // same glove. If they disagree, two documents about one job contradict.
  const canonical = new Set<string>(PPE_REQUIREMENTS.map((p) => String(p.label)));
  for (const category of Object.keys(PPE_BY_CATEGORY)) {
    for (const label of ppeForCategory(category)) {
      assert.ok(canonical.has(label), `"${label}" is not a name the permit uses`);
    }
  }
});

test("an unknown machine gets the workshop baseline, never an empty list", () => {
  // A blank PPE panel reads as "nothing required", which is the most dangerous
  // thing this page could say.
  for (const unknown of ["", null, undefined, "SOMETHING_NEW"]) {
    const ppe = ppeForCategory(unknown);
    assert.ok(ppe.length >= 3, `${String(unknown)} produced ${ppe.length} items`);
    assert.ok(ppe.includes("Safety Helmet"));
  }
});

test("welding and measuring do not get the same answer", () => {
  // A default that is the same for everything is not a default, it is a
  // decoration.
  const welding = ppeForCategory("WELDING");
  assert.ok(welding.some((p) => /visor/i.test(p)), "welding without a visor");
  assert.ok(welding.some((p) => /retardant/i.test(p)), "welding without fire-retardant kit");
  assert.notDeepEqual(welding, ppeForCategory("MEASURING"));
});

test("the order is stable, so one machine never presents its PPE two ways", () => {
  assert.deepEqual(ppeForCategory("CRANE"), ppeForCategory("crane"));
  const twice = [ppeForCategory("WELDING"), ppeForCategory("WELDING")];
  assert.deepEqual(twice[0], twice[1]);
});

test("every category the register can hold has an entry or falls back knowingly", () => {
  // Not every category needs its own row, but a category with no row must land
  // on the baseline rather than on undefined.
  for (const category of Object.keys(EQUIPMENT_CATEGORY_LABELS)) {
    assert.ok(ppeForCategory(category).length > 0, `${category} yields no PPE at all`);
  }
});
