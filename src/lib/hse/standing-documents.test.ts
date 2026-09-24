// src/lib/hse/standing-documents.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { jhaMatchesWms, permitReadiness } from "./standing-documents";

const wms = (over = {}) => ({ revision: 2, status: "APPROVED", wmsNumber: "WMS-2026-0004", ...over });
const jha = (over = {}) => ({ wmsRevision: 2, status: "APPROVED", jhaNumber: "JHA-2026-0009", ...over });

test("an analysis written against the current revision is current", () => {
  assert.equal(jhaMatchesWms(jha(), wms()), true);
});

test("an analysis written against an older revision is not", () => {
  assert.equal(jhaMatchesWms(jha({ wmsRevision: 1 }), wms({ revision: 2 })), false);
});

test("an analysis from before revisions were pinned is not retroactively condemned", () => {
  // Rewriting the past is not this rule's job. The next revision pins it.
  assert.equal(jhaMatchesWms(jha({ wmsRevision: null }), wms()), true);
  assert.equal(jhaMatchesWms(jha({ wmsRevision: undefined }), wms()), true);
});

test("a category with no method statement cannot be permitted", () => {
  const r = permitReadiness(null, null);
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.blockedBy, "NO_WMS");
});

test("an unapproved method statement cannot be permitted", () => {
  const r = permitReadiness(wms({ status: "UNDER_REVIEW" }), jha());
  assert.equal(r.ok === false && r.blockedBy, "WMS_UNAPPROVED");
});

test("an approved method with no hazard analysis cannot be permitted", () => {
  const r = permitReadiness(wms(), null);
  assert.equal(r.ok === false && r.blockedBy, "NO_JHA");
});

test("an unapproved hazard analysis cannot be permitted", () => {
  const r = permitReadiness(wms(), jha({ status: "UNDER_REVIEW" }));
  assert.equal(r.ok === false && r.blockedBy, "JHA_UNAPPROVED");
});

test("revising the method blocks the next permit until the analysis catches up", () => {
  // A machine joined the category, so the method changed. The hazards were
  // assessed against the work as it was, and that is the whole point of the pin.
  const r = permitReadiness(wms({ revision: 3 }), jha({ wmsRevision: 2 }));
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.blockedBy, "JHA_STALE");
  assert.match(r.ok === false ? r.reason : "", /revision 2/);
  assert.match(r.ok === false ? r.reason : "", /revision 3/);
});

test("the stale message says live permits are unaffected", () => {
  // Work already authorised and under way is not stopped by somebody editing a
  // document. That is a decision for a person.
  const r = permitReadiness(wms({ revision: 3 }), jha({ wmsRevision: 2 }));
  assert.match(r.ok === false ? r.reason : "", /already live are not affected/i);
});

test("an approved pair at the same revision is ready", () => {
  assert.deepEqual(permitReadiness(wms(), jha()), { ok: true });
});

test("every refusal explains itself", () => {
  const cases = [
    permitReadiness(null, null),
    permitReadiness(wms({ status: "DRAFT" }), null),
    permitReadiness(wms(), null),
    permitReadiness(wms(), jha({ status: "REJECTED" })),
    permitReadiness(wms({ revision: 5 }), jha({ wmsRevision: 1 })),
  ];
  for (const c of cases) {
    assert.equal(c.ok, false);
    assert.ok(c.ok === false && c.reason.trim().length > 20, "a refusal with no explanation is a dead end");
  }
});
