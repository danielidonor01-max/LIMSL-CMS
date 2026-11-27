// src/lib/__tests__/troubleshooting-module.test.ts
// The Troubleshooting module rules (LIMSL, 27 Nov 2026).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { closeError, diagnosisState, hoursToCause, statusFor, troubleshootingSummary } from "@/lib/maintenance/troubleshooting";
import { TROUBLESHOOT_ROLES, canAccessPath } from "@/lib/roles";

test("a cause that needs a repair always lands on a breakdown", () => {
  assert.match(closeError({ outcome: "CAUSE_FOUND", resolvedCause: "Contactor welded" }) ?? "", /breakdown/);
  assert.match(closeError({ outcome: "SPECIALIST", note: "Needs the OEM engineer" }) ?? "", /breakdown/);
  assert.equal(closeError({ outcome: "CAUSE_FOUND", resolvedCause: "Contactor welded", linkedCorrectiveId: "cm1" }), null);
  assert.equal(closeError({ outcome: "CAUSE_FOUND", resolvedCause: "Contactor welded", attachCorrectiveId: "cm2" }), null);
  assert.equal(closeError({ outcome: "CAUSE_FOUND", resolvedCause: "Contactor welded", raiseBreakdown: true }), null);
  assert.ok(closeError({ outcome: "CAUSE_FOUND", resolvedCause: "x y", attachCorrectiveId: "cm2", raiseBreakdown: true }));
});

test("a session may end without a breakdown only as no fault found, with what was checked", () => {
  assert.equal(closeError({ outcome: "NO_FAULT", note: "Ran it for an hour, no trip" }), null);
  assert.ok(closeError({ outcome: "NO_FAULT", note: "" }));
  assert.ok(closeError({ outcome: "CAUSE_FOUND", resolvedCause: "", raiseBreakdown: true }));
  assert.equal(statusFor("ABANDONED"), "ABANDONED");
  assert.equal(statusFor("NO_FAULT"), "RESOLVED");
});

test("the lead figures: waiting, in progress, and time from report to cause", () => {
  const now = new Date("2026-11-27T12:00:00Z");
  const s = troubleshootingSummary(
    [
      { status: "OPEN", correctiveId: "cm1" },
      { status: "RESOLVED", outcome: "CAUSE_FOUND", correctiveId: "cm2", reportedAt: "2026-11-26T08:00:00Z", closedAt: "2026-11-26T14:00:00Z" },
      { status: "RESOLVED", outcome: "CAUSE_FOUND", correctiveId: "cm4", reportedAt: "2026-06-01T08:00:00Z", closedAt: "2026-06-01T10:00:00Z" },
    ],
    [{ id: "cm1" }, { id: "cm2", verifiedRootCause: "Worn bearing" }, { id: "cm3" }],
    now,
  );
  // cm1 is being worked, cm2 has its root cause, cm3 waits.
  assert.equal(s.awaitingDiagnosis, 1);
  assert.equal(s.inProgress, 1);
  // Only the last 90 days count: 6 hours, not the June case.
  assert.equal(s.avgHoursToCause, 6);
  assert.equal(s.causesFound90d, 1);
  assert.equal(hoursToCause("2026-11-26", "2026-11-26T06:00:00Z"), 6);
});

test("a cause found but not yet verified is waiting for the technician, not for a diagnosis", () => {
  const sessions = [{ status: "RESOLVED", outcome: "CAUSE_FOUND", correctiveId: "cm1" }];
  assert.equal(diagnosisState({ id: "cm1" }, sessions), "TO_VERIFY");
  assert.equal(diagnosisState({ id: "cm1", verifiedRootCause: "Worn bearing" }, sessions), "VERIFIED");
  assert.equal(diagnosisState({ id: "cm2" }, [{ status: "RESOLVED", outcome: "NO_FAULT", correctiveId: "cm2" }]), "WAITING");
  assert.equal(troubleshootingSummary(sessions, [{ id: "cm1" }]).awaitingDiagnosis, 0);
});

test("everyone except HSE and QA/QC starts sessions; they and everyone else can read them", () => {
  for (const r of ["HSE", "QA_QC", "VIEWER"]) assert.ok(!TROUBLESHOOT_ROLES.includes(r), r);
  for (const r of ["TECHNICIAN", "FOREMAN", "MAINTENANCE_MANAGER", "FACTORY_MANAGER", "COO", "SUPER_ADMIN"]) assert.ok(TROUBLESHOOT_ROLES.includes(r), r);
  assert.ok(canAccessPath("HSE", "/troubleshooting"));
  assert.ok(canAccessPath("QA_QC", "/troubleshooting"));
  const route = readFileSync("src/app/api/equipment/[assetId]/diagnose/chat/route.ts", "utf8");
  assert.match(route, /export async function POST[\s\S]*requireRoles\(TROUBLESHOOT_ROLES\)/);
  assert.doesNotMatch(route.slice(route.indexOf("export async function GET"), route.indexOf("async function underRateLimit")), /requireRoles/);
});

test("the cause found is only a suggestion: it never writes the verified root cause", () => {
  const route = readFileSync("src/app/api/equipment/[assetId]/diagnose/chat/route.ts", "utf8");
  assert.doesNotMatch(route, /verifiedRootCause/);
  const page = readFileSync("src/app/corrective/[id]/page.tsx", "utf8");
  // Offered only into a blank field, and only once the saved state is known.
  assert.match(page, /if \(record\?\.verifiedRootCause \|\| verifiedRootCause\.trim\(\)\) return;/);
  assert.match(page, /savedKey === null\) return;/);
});

test("a breakdown raised from a session is reported the same way as from the form", () => {
  assert.match(readFileSync("src/app/api/corrective/route.ts", "utf8"), /reportBreakdown\(/);
  assert.match(readFileSync("src/app/api/equipment/[assetId]/diagnose/chat/route.ts", "utf8"), /reportBreakdown\(/);
});
