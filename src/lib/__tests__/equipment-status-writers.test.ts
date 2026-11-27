// src/lib/__tests__/equipment-status-writers.test.ts
// A machine's status is derived by one writer (lib/equipment-status.ts), and
// that only works if every flow that changes a fault or a job calls it.
//
// The work-order route did not (found end-to-end on the CM flow, 16 Nov 2026):
// a repair whose fault was closed before its work order was completed left
// the machine "under maintenance" for good. File-scan guard, like the
// safety-chain test, because no database is reachable here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const API = join(process.cwd(), "src", "app", "api");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const read = (...p: string[]) => strip(readFileSync(join(API, ...p), "utf8"));

const WRITERS: Array<[string, string[]]> = [
  ["work order status changes", ["work-orders", "[id]", "route.ts"]],
  // A fault is recorded by one function, from the form and from the end of a
  // troubleshooting session alike (27 Nov 2026); the call lives there.
  ["fault create", ["..", "..", "lib", "maintenance", "report-breakdown.ts"]],
  ["fault update and close-out", ["corrective", "[id]", "route.ts"]],
  ["PM checklist completion", ["pm-checklists", "route.ts"]],
];

for (const [what, path] of WRITERS) {
  test(`${what} re-derive the machine's status`, () => {
    assert.ok(/applyDerivedStatus\s*\(/.test(read(...path)), `${path.join("/")} no longer calls applyDerivedStatus()`);
  });
}
