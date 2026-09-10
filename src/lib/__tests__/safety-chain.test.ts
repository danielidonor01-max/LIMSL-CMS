// src/lib/__tests__/safety-chain.test.ts
// Which document authorises the work, and where the gate sits.
//
// The chain was built as WO -> WMS -> JHA -> PTW, on the reasoning that a
// method is written for work somebody has sanctioned. A user-journey review
// found that this deadlocks every new job: the safety documents cannot be
// prepared until the work is authorised, and the work cannot sensibly be
// authorised without seeing how it will be done. LIMSL confirmed the review
// was right about their process, and the order is now:
//
//     WMS -> JHA -> approved WO -> PTW
//
// The management-authorisation gate did not disappear when the sequence
// changed. It MOVED, from the method statement to the permit, which is the
// document that actually lets somebody pick up a spanner. Losing it entirely
// is the failure this file guards against, because that is the shape the bug
// would take: somebody removes the block from the WMS, the deadlock clears,
// the tests pass, and nothing anywhere checks that the job was ever approved.
//
// These are file-scan guards rather than route tests because no database is
// reachable from here and the routes are thin wrappers around db calls.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const API = join(process.cwd(), "src", "app", "api");
const read = (...p: string[]) => readFileSync(join(API, ...p), "utf8");

const WMS = read("wms", "route.ts");
const JHA = read("jha", "route.ts");
const PERMITS = read("permits", "route.ts");

test("the method statement does not require an authorised job", () => {
  // The deadlock. A WMS written for a job that has not been raised yet is the
  // normal case now, so neither a missing work order nor an unapproved one may
  // block it.
  assert.ok(
    !/PENDING_APPROVAL/.test(WMS),
    "the WMS route blocks on work-order approval again, which deadlocks every new job",
  );
  assert.ok(
    !/Select the approved work order/.test(WMS),
    "the WMS route requires a work order again",
  );
});

test("the permit refuses a job management has not approved", () => {
  // The other half. Whatever else changes, no permit against an unapproved
  // work order: that is the whole point of the approval existing.
  //
  // This asserts on an actual conditional, not on the constant appearing
  // somewhere in the file. The first version of this test matched the word
  // anywhere, so it went on passing after the gate was replaced with `if
  // (false)` and only the emergency test noticed. A guard that survives the
  // deletion of the thing it guards is worse than none: it certifies the bug.
  assert.ok(
    /if \(permitWo\.status === "PENDING_APPROVAL"\)/.test(PERMITS),
    "the permit route no longer checks work-order approval, so nothing does",
  );
  assert.ok(
    /return NextResponse\.json\(\{ error: approvalBlockMessage\(/.test(PERMITS),
    "the permit route no longer refuses an unapproved work order",
  );
});

test("the middle of the chain still holds", () => {
  // Unchanged by the re-sequencing, and worth pinning while the surrounding
  // code is being moved: an analysis is written against an APPROVED method
  // statement, and a permit is issued against an APPROVED analysis.
  assert.ok(
    /wms\.status !== "APPROVED"/.test(JHA),
    "a hazard analysis can now be written against an unapproved method statement",
  );
  assert.ok(
    /jhaDoc\.status !== "APPROVED"/.test(PERMITS),
    "a permit can now be issued against an unapproved hazard analysis",
  );
});

test("an emergency work order can still get its permit", () => {
  // An emergency commences immediately and collects signatures afterwards, so
  // it sits at OPEN with approvalRetrospective set. Blocking anything that is
  // not fully approved would leave a breakdown crew unable to raise the permit
  // their own isolation depends on. Only PENDING_APPROVAL may block.
  const gate = PERMITS.slice(PERMITS.indexOf("Management authorisation"));
  const blocked = [...gate.matchAll(/permitWo\.status === "(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(
    blocked.sort(),
    ["CANCELLED", "PENDING_APPROVAL"],
    `the permit gate blocks on ${blocked.join(", ")}; only PENDING_APPROVAL and CANCELLED may block`,
  );
});
