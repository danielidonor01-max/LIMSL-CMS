import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { changeKindOf, retireBlocker } from "@/lib/maintenance/category-retire";
import { isNoticeDay, roundLine, roundsToAnnounce, type RoundRow } from "@/lib/maintenance/round-reminders";

test("a category is retired only once nothing depends on it", () => {
  assert.equal(retireBlocker({ machines: 0, openVisits: 0, openBatches: 0 }), null);
  assert.match(retireBlocker({ machines: 3, openVisits: 0, openBatches: 0 }) ?? "", /3 machines are still in this category\. Move them/);
  assert.match(retireBlocker({ machines: 1, openVisits: 0, openBatches: 0 }) ?? "", /1 machine is still/);
  assert.match(retireBlocker({ machines: 0, openVisits: 0, openBatches: 1 }) ?? "", /PM batch is still open/);
  assert.match(retireBlocker({ machines: 0, openVisits: 2, openBatches: 0 }) ?? "", /2 planned visits are still open/);
});

test("retire and bring back are kinds of the one change request", () => {
  assert.equal(changeKindOf("retire"), "RETIRE");
  assert.equal(changeKindOf("REINSTATE"), "REINSTATE");
  assert.equal(changeKindOf("create"), "CREATE");
  assert.equal(changeKindOf(undefined), "UPDATE");
  assert.equal(changeKindOf("DELETE"), "UPDATE");
});

test("retiring keeps the record, frees the calendar and is checked again at the last signature", () => {
  const lib = readFileSync("src/lib/maintenance/asset-categories.ts", "utf8");
  assert.match(lib, /all\.filter\(\(c\) => c\.isActive !== false\)/);
  assert.match(lib, /change\.kind === "RETIRE" \|\| change\.kind === "REINSTATE"\) return applyRetirement/);
  assert.match(lib, /retiring \? retireBlocker\(await retireFacts\(change\.categoryCode\)\) : null/);
  assert.match(lib, /set\(\{ isActive: !retiring, updatedAt: now \}\)/);
  assert.doesNotMatch(lib, /delete\(assetCategories\)/);
  // History still has its name.
  assert.match(lib, /listCategories\(\{ includeRetired: true \}\)/);
  const route = readFileSync("src/app/api/asset-categories/changes/route.ts", "utf8");
  assert.match(route, /const blocker = retireBlocker\(await retireFacts\(code\)\);/);
});

test("a machine cannot be put into a retired category", () => {
  for (const f of ["src/app/api/equipment/route.ts", "src/app/api/equipment/[assetId]/route.ts"]) {
    assert.match(readFileSync(f, "utf8"), /has been retired\. Choose a category that is in use/, f);
  }
  assert.match(readFileSync("src/app/api/asset-categories/move/route.ts", "utf8"), /target\.isActive === false/);
});

const row = (over: Partial<RoundRow> = {}): RoundRow => ({
  equipmentId: "e1",
  plannedDate: "2027-01-20",
  activityType: "PM",
  status: "SCHEDULED",
  responsiblePersonId: null,
  batchId: null,
  completedDate: null,
  category: "CRANE",
  ...over,
});

test("a round is announced seven days out, then daily from two days out", () => {
  assert.deepEqual([8, 7, 6, 3, 2, 1, 0, -1].map(isNoticeDay), [false, true, false, false, true, true, true, false]);
});

test("one line per category round, however many machines, and only while nobody is assigned", () => {
  const rows = [
    row({ equipmentId: "a" }),
    row({ equipmentId: "b" }),
    row({ equipmentId: "b" }),
    row({ equipmentId: "c", responsiblePersonId: "u1" }),
    row({ equipmentId: "d", batchId: "b1" }),
    row({ equipmentId: "e", category: "WELDING", plannedDate: "2027-01-15" }),
    row({ equipmentId: "f", activityType: "CM" }),
    row({ equipmentId: "g", status: "COMPLETED" }),
  ];
  const out = roundsToAnnounce(rows, "2027-01-13");
  assert.deepEqual(
    out.map((r) => [r.category, r.plannedDate, r.machines, r.daysToGo]),
    [
      ["WELDING", "2027-01-15", 1, 2],
      ["CRANE", "2027-01-20", 2, 7],
    ],
  );
  assert.equal(roundLine(out[1], "Cranes", "20 Jan 2027"), "Cranes PM, 20 Jan 2027 (in 7 days), 2 machines");
  assert.deepEqual(roundsToAnnounce(rows, "2027-01-10"), []);
});

test("the scheduler gets in with the secret only, and the notice goes to those who assign", () => {
  const route = readFileSync("src/app/api/escalations/run/route.ts", "utf8");
  assert.match(route, /export async function GET[\s\S]*!secret \|\| authHeader !== `Bearer \$\{secret\}`/);
  assert.match(readFileSync("src/auth.config.ts", "utf8"), /"\/api\/escalations\/run"/);
  const cron = JSON.parse(readFileSync("vercel.json", "utf8"));
  assert.deepEqual(cron.crons, [{ path: "/api/escalations/run", schedule: "0 6 * * *" }]);
  const esc = readFileSync("src/lib/escalations.ts", "utf8");
  assert.match(esc, /roles: ROUND_ASSIGN_NOTICE_ROLES/);
  assert.match(readFileSync("src/lib/roles.ts", "utf8"), /ROUND_ASSIGN_NOTICE_ROLES = \["FOREMAN", "MAINTENANCE_MANAGER"\]/);
  assert.match(esc, /recentlyEscalated\("escalation:rounds-unassigned", "ALL", now\)/);
});
