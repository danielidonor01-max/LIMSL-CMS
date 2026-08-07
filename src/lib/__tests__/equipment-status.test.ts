// Regression tests for the single writer of equipment.status. The register must
// never contradict the open records: one severe fault outranks everything, and
// the two manual states are never derived away.
import { test } from "node:test";
import assert from "node:assert/strict";
import { STICKY_MANUAL_STATUSES, decideStatus } from "@/lib/equipment-status";

const DERIVABLE = ["OPERATIONAL", "UNDER_MAINTENANCE", "BROKEN_DOWN"];

test("a CRITICAL open corrective breaks the machine down", () => {
  assert.equal(decideStatus("OPERATIONAL", ["CRITICAL"], false), "BROKEN_DOWN");
  assert.equal(decideStatus("OPERATIONAL", ["CRITICAL"], true), "BROKEN_DOWN");
});

test("a HIGH open corrective breaks the machine down", () => {
  assert.equal(decideStatus("OPERATIONAL", ["HIGH"], false), "BROKEN_DOWN");
});

test("one severe fault outranks any number of minor ones", () => {
  assert.equal(decideStatus("OPERATIONAL", ["LOW", "MEDIUM", "HIGH"], false), "BROKEN_DOWN");
  assert.equal(decideStatus("UNDER_MAINTENANCE", ["LOW", "CRITICAL"], false), "BROKEN_DOWN");
});

test("MEDIUM/LOW faults alone only put the machine under maintenance", () => {
  assert.equal(decideStatus("OPERATIONAL", ["MEDIUM"], false), "UNDER_MAINTENANCE");
  assert.equal(decideStatus("OPERATIONAL", ["LOW"], false), "UNDER_MAINTENANCE");
  assert.equal(decideStatus("OPERATIONAL", ["LOW", "MEDIUM", "LOW"], false), "UNDER_MAINTENANCE");
});

test("an unrecognised or blank urgency is treated as non-severe, not as no fault", () => {
  // deriveEquipmentStatus maps a null urgency column to "" — an open corrective
  // with no urgency recorded must still take the machine out of service.
  assert.equal(decideStatus("OPERATIONAL", [""], false), "UNDER_MAINTENANCE");
  assert.equal(decideStatus("OPERATIONAL", ["ROUTINE"], false), "UNDER_MAINTENANCE");
  // Urgency comparison is case-sensitive; the column only ever holds the
  // upper-case enum values written by the corrective routes.
  assert.equal(decideStatus("OPERATIONAL", ["critical"], false), "UNDER_MAINTENANCE");
});

test("no open faults but an in-progress work order means under maintenance", () => {
  assert.equal(decideStatus("OPERATIONAL", [], true), "UNDER_MAINTENANCE");
  assert.equal(decideStatus("BROKEN_DOWN", [], true), "UNDER_MAINTENANCE");
});

test("nothing open returns the machine to service", () => {
  assert.equal(decideStatus("OPERATIONAL", [], false), "OPERATIONAL");
  assert.equal(decideStatus("BROKEN_DOWN", [], false), "OPERATIONAL");
  assert.equal(decideStatus("UNDER_MAINTENANCE", [], false), "OPERATIONAL");
});

test("closing one of two open faults does not return a still-broken machine to service", () => {
  // The regression this module exists for: the second fault is still open.
  assert.equal(decideStatus("BROKEN_DOWN", ["CRITICAL"], false), "BROKEN_DOWN");
  assert.equal(decideStatus("BROKEN_DOWN", ["LOW"], false), "UNDER_MAINTENANCE");
});

test("derivation never depends on the previous derivable status", () => {
  const combos: Array<[string[], boolean]> = [
    [[], false],
    [[], true],
    [["LOW"], false],
    [["LOW"], true],
    [["CRITICAL"], false],
    [["CRITICAL"], true],
  ];
  for (const [urgencies, hasWo] of combos) {
    const results = DERIVABLE.map((from) => decideStatus(from, urgencies, hasWo));
    assert.equal(new Set(results).size, 1, `derivation disagreed across prior statuses for ${JSON.stringify(urgencies)}`);
  }
});

test("DECOMMISSIONED and AWAITING_PARTS are sticky in every combination", () => {
  const combos: Array<[string[], boolean]> = [
    [[], false],
    [[], true],
    [["LOW"], false],
    [["MEDIUM"], true],
    [["HIGH"], false],
    [["CRITICAL"], true],
    [["LOW", "CRITICAL"], true],
  ];
  for (const sticky of STICKY_MANUAL_STATUSES) {
    for (const [urgencies, hasWo] of combos) {
      assert.equal(
        decideStatus(sticky, urgencies, hasWo),
        sticky,
        `${sticky} was derived away by ${JSON.stringify(urgencies)} / activeWO=${hasWo}`,
      );
    }
  }
});

test("the sticky list is exactly the two documented manual states", () => {
  assert.deepEqual([...STICKY_MANUAL_STATUSES], ["DECOMMISSIONED", "AWAITING_PARTS"]);
});

test("decideStatus only ever returns a status the register understands", () => {
  const known = new Set([...DERIVABLE, ...STICKY_MANUAL_STATUSES]);
  for (const from of [...DERIVABLE, ...STICKY_MANUAL_STATUSES]) {
    for (const urgencies of [[], ["LOW"], ["CRITICAL"], ["", "HIGH"]]) {
      for (const hasWo of [true, false]) {
        assert.ok(known.has(decideStatus(from, urgencies, hasWo)));
      }
    }
  }
});
