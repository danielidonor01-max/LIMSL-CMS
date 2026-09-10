// src/lib/hse/incidents.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  INCIDENT_TYPES,
  INCIDENT_TYPE_LABEL,
  INCIDENT_STATUS_LABEL,
  INCIDENT_STATUS_BADGE,
  isSerious,
  isValidType,
  requiresFormalInvestigation,
  blockersToClose,
  validateReport,
} from "./incidents";

test("a near miss is a first-class type, not an afterthought", () => {
  // It is the cheapest warning available and the whole reason to have the
  // module. If it were not reportable the record would only ever hold injuries.
  assert.ok(isValidType("NEAR_MISS"));
  assert.equal(INCIDENT_TYPE_LABEL.NEAR_MISS, "Near miss");
  assert.equal(requiresFormalInvestigation("NEAR_MISS"), false);
});

test("the events a regulator asks about cannot be closed on a shrug", () => {
  for (const t of ["LOST_TIME", "DANGEROUS_OCCURRENCE", "ENVIRONMENTAL"]) {
    assert.equal(isSerious(t), true, `${t} should be serious`);
    assert.equal(requiresFormalInvestigation(t), true);
  }
  for (const t of ["NEAR_MISS", "FIRST_AID", "PROPERTY_DAMAGE", "MEDICAL_TREATMENT"]) {
    assert.equal(requiresFormalInvestigation(t), false, `${t} should not force an investigation`);
  }
});

test("an unknown type is refused rather than stored", () => {
  for (const bad of ["", "INJURY", null, undefined, 3, "near_miss"]) {
    assert.equal(isValidType(bad), false, `${String(bad)} should be refused`);
  }
});

test("closing needs the immediate action and the corrective action", () => {
  const blockers = blockersToClose({ type: "NEAR_MISS" });
  assert.equal(blockers.length, 2);
  assert.ok(blockers.some((b) => b.includes("make the area safe")));
  assert.ok(blockers.some((b) => b.includes("stops this happening again")));
});

test("a serious incident additionally needs a root cause", () => {
  const near = blockersToClose({
    type: "NEAR_MISS",
    immediateAction: "Barriered off",
    correctiveAction: "Guard refitted",
  });
  assert.deepEqual(near, []);

  const lost = blockersToClose({
    type: "LOST_TIME",
    immediateAction: "Barriered off",
    correctiveAction: "Guard refitted",
  });
  assert.equal(lost.length, 1);
  assert.ok(lost[0].includes("root cause"));
});

test("blockers are sentences, not a boolean", () => {
  // They are shown next to the button refusing to work, so each one has to say
  // what to do about it.
  for (const b of blockersToClose({ type: "LOST_TIME" })) {
    assert.ok(b.endsWith(".") || b.endsWith(")."), `"${b}" is not a sentence`);
    assert.ok(b.length > 20, `"${b}" is too terse to act on`);
  }
});

test("reporting asks three things and refuses an empty description", () => {
  // A form that asks twelve questions gets used the first week and abandoned by
  // the third, which is how near-miss reporting dies.
  assert.deepEqual(
    validateReport({ type: "NEAR_MISS", description: "Sling frayed, load swung over the bay", occurredAt: "2026-09-10T09:00" }),
    { ok: true },
  );

  const noDesc = validateReport({ type: "NEAR_MISS", description: "slip", occurredAt: "x" });
  assert.equal(noDesc.ok, false);

  const noWhen = validateReport({ type: "NEAR_MISS", description: "Sling frayed badly", occurredAt: "" });
  assert.equal(noWhen.ok, false);

  const noType = validateReport({ type: "OOPS", description: "Sling frayed badly", occurredAt: "x" });
  assert.equal(noType.ok, false);
});

test("every type and status has a label, and every status a badge", () => {
  // A missing label renders a raw enum at somebody investigating an injury.
  for (const t of INCIDENT_TYPES) {
    assert.ok(t.label.length > 0, `${t.value} has no label`);
    assert.ok(t.help.length > 0, `${t.value} has no explanation`);
  }
  for (const s of ["REPORTED", "UNDER_INVESTIGATION", "ACTIONS_ASSIGNED", "CLOSED"]) {
    assert.ok(INCIDENT_STATUS_LABEL[s], `${s} has no label`);
    assert.ok(INCIDENT_STATUS_BADGE[s], `${s} has no badge`);
  }
});
