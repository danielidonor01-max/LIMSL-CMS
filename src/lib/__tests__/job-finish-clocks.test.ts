// src/lib/__tests__/job-finish-clocks.test.ts
// Finishing a job clocks everybody off it (LIMSL, 16 Nov 2026). A PM completed
// with its technician clocked on left the work order saying "clocked on now"
// for good, because time cannot be booked to a closed job. File-scan guard,
// like the safety-chain test, because no database is reachable here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const API = join(process.cwd(), "src", "app", "api");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const read = (...p: string[]) => strip(readFileSync(join(API, ...p), "utf8"));

for (const [what, path] of [
  ["filing a PM checklist", ["pm-checklists", "route.ts"]],
  ["completing or cancelling a work order", ["work-orders", "[id]", "route.ts"]],
] as const) {
  test(`${what} clocks everyone off the job`, () => {
    assert.ok(/clockEveryoneOff\s*\(/.test(read(...path)), `${path.join("/")} no longer calls clockEveryoneOff()`);
  });
}

test("filing the checklist is the technician's performed-by signature", () => {
  const src = read("pm-checklists", "route.ts");
  assert.ok(/filerSigns/.test(src) && /isOverrideSignature\(/.test(src), "step 1 must be signed by the filing technician");
  assert.ok(!/step1 && checklist\.technicianSignature &&/.test(src), "step 1 must not wait for a drawn signature");
});
