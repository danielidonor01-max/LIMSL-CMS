// src/lib/__tests__/permit-flow-and-ins-numbers.test.ts
// Found raising the permit for PMB-2026-0078 (27 Nov 2026).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canAccessPath, PERMIT_ISSUE_ROLES } from "@/lib/roles";
import { batchSeries } from "@/lib/maintenance/pm-batch";

test("HSE, who raises the PM permit, can open the batch it is raised from", () => {
  assert.ok(PERMIT_ISSUE_ROLES.includes("HSE"));
  assert.equal(canAccessPath("HSE", "/pm-batches/abc"), true);
  assert.equal(canAccessPath("HSE", "/permits/new"), true);
});

test("the permit form takes the analysis's suggestions once, not on every keystroke", () => {
  const src = readFileSync("src/app/permits/new/page.tsx", "utf8");
  assert.match(src, /prefilledFor\.current === selectedJha\.id\) return;/);
  // The pre-fill must not re-run when the issuer edits the description or area.
  assert.match(src, /setPrecautionMarks\(\(prev\) => \(\{ \.\.\.nextPrec, \.\.\.prev \}\)\);\r?\n  \}, \[selectedJha\]\);/);
});

test("an inspection round is numbered INS, a PM round PMB", () => {
  assert.equal(batchSeries("INS"), "INS");
  assert.equal(batchSeries("PM"), "PMB");
  const raise = readFileSync("src/lib/maintenance/pm-batch.ts", "utf8");
  assert.match(raise, /nextDocNumber\(batchSeries\(activityType\)\)/);
  assert.doesNotMatch(raise, /nextDocNumber\("PMB"\)/);
  assert.match(readFileSync("src/lib/db/backfill-2026.ts", "utf8"), /nextNumber\(tx, batchSeries\(b\.activityType\)\)/);
});
