import { test } from "node:test";
import assert from "node:assert/strict";
import { validateDeferral, MAX_DEFERRAL_REASON_CHARS } from "@/lib/maintenance/deferral";

const TODAY = "2026-08-07";

test("a deferral with a stated risk and a future review date is accepted", () => {
  const r = validateDeferral({
    reason: "Spare bearing on order, ETA 3 weeks. Machine derated and inspected weekly.",
    reviewDate: "2026-09-01",
    today: TODAY,
  });
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.reviewDate, "2026-09-01");
});

// The whole point of the register: you cannot put work off without saying why.
test("deferring without a justification is refused", () => {
  for (const reason of ["", "   ", "busy", null, undefined, 42]) {
    const r = validateDeferral({ reason, reviewDate: "2026-09-01", today: TODAY });
    assert.equal(r.ok, false, `"${String(reason)}" should not be an acceptable justification`);
  }
});

// A deferral without an expiry is indistinguishable from ignoring the work.
test("a review date today or in the past is refused", () => {
  const reason = "Awaiting the OEM engineer, next available visit is in September.";
  assert.equal(validateDeferral({ reason, reviewDate: TODAY, today: TODAY }).ok, false);
  assert.equal(validateDeferral({ reason, reviewDate: "2026-01-01", today: TODAY }).ok, false);
  assert.equal(validateDeferral({ reason, reviewDate: "", today: TODAY }).ok, false);
  assert.equal(validateDeferral({ reason, reviewDate: "next month", today: TODAY }).ok, false);
  assert.equal(validateDeferral({ reason, reviewDate: null, today: TODAY }).ok, false);
});

test("the justification is trimmed and bounded, never rejected for being long", () => {
  const long = "x".repeat(MAX_DEFERRAL_REASON_CHARS + 200);
  const r = validateDeferral({ reason: `   ${long}   `, reviewDate: "2026-12-01", today: TODAY });
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.reason.length, MAX_DEFERRAL_REASON_CHARS);
});

test("a timestamped review date still resolves to its calendar day", () => {
  const r = validateDeferral({
    reason: "Part lead time is six weeks; risk accepted with weekly inspection.",
    reviewDate: "2026-09-15T00:00:00.000Z",
    today: TODAY,
  });
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.reviewDate, "2026-09-15");
});
