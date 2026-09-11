// src/lib/__tests__/emergency-escalation.test.ts
// Audit finding E-02: fire equipment inspections are not chased.
//
// The finding asked for them to go "on the PM schedule". They cannot go there
// literally — the schedule is keyed to the asset register by a NOT NULL foreign
// key, and an extinguisher is not a machine on that register. Putting forty
// extinguishers into the asset register to make the join work would inflate
// fleet availability, which is a headline ISO metric.
//
// What the finding wanted is that a due inspection gets chased the way an
// overdue PM gets chased. The register already knew what was due: assessReadiness
// has computed OVERDUE, DUE_SOON and NEVER_INSPECTED all along, and nothing read
// it. The gap was never the data, it was that nobody was told.
//
// These tests cover the decision (what counts as needing attention) directly,
// and the wiring (that the escalation engine reads it) by inspection, because
// the engine needs a database and these run offline.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assessReadiness } from "@/lib/hse/emergency";

const ESCALATIONS = readFileSync(join(process.cwd(), "src", "lib", "escalations.ts"), "utf8");
const code = ESCALATIONS.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const TODAY = "2026-09-11";

test("an extinguisher inspected within its interval is not chased", () => {
  const r = assessReadiness(
    { type: "FIRE_EXTINGUISHER", status: "SERVICEABLE", lastInspectionDate: "2026-09-01" },
    TODAY,
  );
  assert.equal(r.ready, true);
  assert.equal(r.inspection, "OK");
});

test("an extinguisher past its inspection interval is chased", () => {
  const r = assessReadiness(
    { type: "FIRE_EXTINGUISHER", status: "SERVICEABLE", lastInspectionDate: "2024-01-01" },
    TODAY,
  );
  assert.equal(r.ready, false);
  assert.equal(r.inspection, "OVERDUE");
  assert.ok(r.reasons.length > 0, "an overdue item must say why it is not ready");
});

test("one that has never been inspected is chased rather than assumed fine", () => {
  // The quiet failure this catches. A blank last-inspected date reads as "no
  // problem found" if the check is written as "is the due date in the past".
  const r = assessReadiness(
    { type: "FIRE_EXTINGUISHER", status: "SERVICEABLE", lastInspectionDate: null },
    TODAY,
  );
  assert.equal(r.ready, false);
  assert.equal(r.inspection, "NEVER_INSPECTED");
});

test("a defective item is not ready however recently it was inspected", () => {
  // Inspecting something and finding it broken is not the same as it being
  // serviceable, and the inspection date alone cannot tell them apart.
  const r = assessReadiness(
    { type: "FIRE_EXTINGUISHER", status: "DEFECTIVE", lastInspectionDate: TODAY },
    TODAY,
  );
  assert.equal(r.ready, false);
  assert.equal(r.severity, "fail");
});

test("an expired charge counts even when the inspection is current", () => {
  // Both can be true at once, and fixing one leaves the cylinder unusable.
  const r = assessReadiness(
    {
      type: "FIRE_EXTINGUISHER",
      status: "SERVICEABLE",
      lastInspectionDate: "2026-09-01",
      expiryDate: "2026-01-01",
    },
    TODAY,
  );
  assert.equal(r.ready, false);
  assert.equal(r.expiry, "EXPIRED");
});

test("the escalation engine reads the emergency register", () => {
  // The whole finding, in one assertion. If this import or query is removed the
  // register goes back to knowing what is due and telling nobody, which is
  // exactly the state the audit found.
  assert.match(code, /emergencyEquipment/, "escalations no longer query the emergency register");
  assert.match(code, /assessReadiness\s*\(/, "escalations no longer assess readiness");
  assert.match(
    code,
    /escalation:emergency-equipment/,
    "the emergency escalation no longer has its own dedup key",
  );
});

test("the emergency pass respects the no-nagging guard", () => {
  // Every other pass in this engine is guarded so repeated runs do not re-send.
  // One that is not would make the daily run a source of noise, and a noisy
  // digest is one nobody opens when something real arrives.
  const block = code.slice(
    code.indexOf("escalation:emergency-equipment") - 2500,
    code.indexOf("escalation:emergency-equipment") + 500,
  );
  assert.match(
    block,
    /recentlyEscalated\(\s*"escalation:emergency-equipment"/,
    "the emergency pass sends without checking whether it already did today",
  );
});

test("removed items are not reported as unready", () => {
  // An item taken off the register on purpose is not a finding, and reporting
  // it as one trains people to ignore the list.
  assert.match(
    code,
    /!==\s*"REMOVED"/,
    "escalations no longer exclude REMOVED items from the emergency sweep",
  );
});
