// The 17 Nov 2026 changes: a breakdown record signed only when complete, the
// permit's first day on its record, HSE as the Permit Applicant, the permit
// holder's revalidation request, and type-to-find dropdowns.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { closeOutGaps, listOf } from "@/lib/maintenance/cm-closeout-rules";
import { withIssueDay, renewalSummary } from "@/lib/hse/permit-validity";
import { PTW_CHAIN, canSignChainStep, isOverrideSignature } from "@/lib/signoff/chains";
import { matchesQuery } from "@/components/Select";

const src = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("a complete breakdown record has no gaps", () => {
  assert.deepEqual(
    closeOutGaps({
      failureMode: "BEARING_WEAR",
      verifiedRootCause: "Lubrication interval too long",
      downStartAt: "2026-11-10T08:00",
      downEndAt: "2026-11-10T14:00",
    }),
    [],
  );
});

test("a breakdown record names what it still lacks", () => {
  const gaps = closeOutGaps({ failureMode: "", verifiedRootCause: " ", downStartAt: null, downEndAt: null });
  assert.equal(gaps.length, 3);
  assert.equal(listOf(["a", "b", "c"]), "a, b and c");
  const backwards = closeOutGaps({
    failureMode: "X",
    verifiedRootCause: "Y",
    downStartAt: "2026-11-10T14:00",
    downEndAt: "2026-11-10T08:00",
  });
  assert.deepEqual(backwards, ["a restored time after the machine went down"]);
});

test("the first signature on a breakdown waits for a complete record, and the last one closes it", () => {
  const route = src("src/app/api/signoffs/[id]/route.ts");
  assert.match(route, /step\.entityType === "CORRECTIVE" && step\.stepOrder === 1/);
  assert.match(route, /correctiveSignBlocker\(/);
  assert.match(route, /closeCorrective\(/);
  // The page no longer has its own close button or the dead signature guard.
  const page = src("src/app/corrective/[id]/page.tsx");
  assert.doesNotMatch(page, /Verify and Close/);
  assert.doesNotMatch(page, /techSign|superSign/);
  assert.equal((page.match(/onClick=\{handleSave\}/g) ?? []).length, 1);
});

test("a fully signed hazard analysis tells HSE to raise the permit", () => {
  const route = src("src/app/api/signoffs/[id]/route.ts");
  assert.match(route, /step\.entityType === "JHA"/);
  assert.match(route, /Raise the permit/);
});

test("the permit's first day is on its record, covered by the approval", () => {
  const marks = withIssueDay({}, "2026-11-10", "2026-11-10T09:15:00Z", "Factory Manager");
  assert.equal(marks["2026-11-10"].status, "WORKED");
  assert.equal(marks["2026-11-10"].basis, "PERMIT_ISSUE");
  const s = renewalSummary("2026-11-10", 7, marks, "2026-11-10");
  assert.deepEqual(s.unaccounted, []);
  // Not approved: nothing is invented.
  assert.deepEqual(withIssueDay({}, "2026-11-10", null), {});
  // A real renewal on day one is never overwritten.
  const real = { "2026-11-10": { date: "2026-11-10", status: "NOT_WORKED" as const } };
  assert.equal(withIssueDay(real, "2026-11-10", "2026-11-10T09:15:00Z")["2026-11-10"].status, "NOT_WORKED");
});

test("a requested day is not a renewal", () => {
  const marks = {
    "2026-11-11": { date: "2026-11-11", status: "REQUESTED" as const, requestedByName: "Ajayi" },
  };
  const s = renewalSummary("2026-11-10", 7, marks, "2026-11-11");
  assert.equal(s.worked, 0);
  assert.ok(s.unaccounted.includes("2026-11-11"));
});

test("only the permit holder asks for a revalidation, and it goes to the Factory Manager", () => {
  const route = src("src/app/api/permits/[id]/revalidation-request/route.ts");
  assert.match(route, /permit\.permitHolderId && actor\?\.id !== permit\.permitHolderId/);
  assert.match(route, /roles: \["FACTORY_MANAGER"\]/);
  assert.match(route, /status: "REQUESTED"/);
});

test("HSE is the Permit Applicant, not the Foreman", () => {
  const pa = { ...PTW_CHAIN[0], stepOrder: 1 };
  assert.equal(pa.roleLabel, "Permit Applicant (PA)");
  assert.equal(pa.role, "HSE");
  assert.ok(canSignChainStep("HSE", "PERMIT", pa));
  assert.ok(!isOverrideSignature("HSE", "PERMIT", pa));
  assert.ok(!canSignChainStep("FOREMAN", "PERMIT", pa));
  // Raising the permit signs the applicant block.
  assert.match(src("src/app/api/permits/route.ts"), /Signed by raising the permit\./);
});

test("type-to-find matches every word, against the label or hidden keywords", () => {
  const crane = { value: "1", label: "Overhead Crane (Bay 2)", keywords: "LEE/PE/0161" };
  assert.ok(matchesQuery(crane, "crane"));
  assert.ok(matchesQuery(crane, "over bay"));
  assert.ok(matchesQuery(crane, "0161"));
  assert.ok(!matchesQuery(crane, "lathe"));
  assert.ok(matchesQuery(crane, "  "));
});
