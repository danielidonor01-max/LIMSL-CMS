import { test } from "node:test";
import assert from "node:assert/strict";
import {
  shouldRetry,
  isTerminal,
  nextBackoffMs,
  upsertEntry,
  removeEntry,
  applyResult,
  sendable,
  failed,
  serialize,
  deserialize,
  fitsInStore,
  describeAge,
  MAX_ATTEMPTS,
  type OutboxEntry,
} from "@/lib/offline/outbox";

const entry = (over: Partial<OutboxEntry> = {}): OutboxEntry => ({
  id: "e1",
  url: "/api/work-orders",
  method: "POST",
  body: "{}",
  label: "PM checklist for LEE/PE/0012",
  dedupeKey: null,
  createdAt: "2026-08-08T09:00:00Z",
  attempts: 0,
  status: "PENDING",
  ...over,
});

// The failure this whole design is built to avoid: a validation error retried
// forever behind an optimistic tick, so the user never learns it was rejected.
test("a 4xx is terminal, retrying will never make it succeed", () => {
  for (const status of [400, 401, 403, 404, 409, 422]) {
    assert.equal(shouldRetry(status), false, `${status} must not be retried`);
  }
});

test("network failures and server errors are worth retrying", () => {
  assert.equal(shouldRetry(null), true, "no response at all is the case the outbox exists for");
  for (const status of [500, 502, 503, 504]) assert.equal(shouldRetry(status), true);
});

test("timeout and rate-limit are transient, not permanent rejections", () => {
  assert.equal(shouldRetry(408), true);
  assert.equal(shouldRetry(429), true);
});

test("a rejected entry is parked as FAILED with a reason, never dropped", () => {
  const r = applyResult(entry(), { ok: false, status: 400, error: "Describe the work performed." });
  assert.equal(r.keep, true);
  assert.equal(r.keep && r.entry.status, "FAILED");
  assert.equal(r.keep && r.entry.lastError, "Describe the work performed.");
});

test("a rejection with no message still explains that retrying will not help", () => {
  const r = applyResult(entry(), { ok: false, status: 409 });
  assert.equal(r.keep && r.entry.status, "FAILED");
  assert.match(r.keep ? r.entry.lastError ?? "" : "", /Retrying will not help/);
});

test("a transient failure stays PENDING and counts the attempt", () => {
  const r = applyResult(entry(), { ok: false, status: 503 });
  assert.equal(r.keep, true);
  assert.equal(r.keep && r.entry.status, "PENDING");
  assert.equal(r.keep && r.entry.attempts, 1);
});

test("a success removes the entry from the queue", () => {
  assert.deepEqual(applyResult(entry({ attempts: 3 }), { ok: true }), { keep: false });
});

// Retrying a dead server forever would keep the entry invisible in "pending".
test("past the attempt cap a retryable failure is parked, not retried forever", () => {
  const r = applyResult(entry({ attempts: MAX_ATTEMPTS - 1 }), { ok: false, status: 500 });
  assert.equal(r.keep && r.entry.status, "FAILED");
  assert.equal(r.keep && r.entry.attempts, MAX_ATTEMPTS);
  assert.match(r.keep ? r.entry.lastError ?? "" : "", /Gave up after/);
  assert.equal(isTerminal({ attempts: MAX_ATTEMPTS }), true);
  assert.equal(isTerminal({ attempts: 1 }), false);
});

test("backoff grows and then stops growing", () => {
  assert.equal(nextBackoffMs(0), 2_000);
  assert.equal(nextBackoffMs(1), 4_000);
  assert.equal(nextBackoffMs(2), 8_000);
  assert.equal(nextBackoffMs(10), 30_000, "capped rather than unbounded");
  assert.equal(nextBackoffMs(-3), 2_000, "a nonsense attempt count still yields a sane delay");
});

// Double-tapping Submit on a laggy phone is the normal case, not the edge case.
test("the same submission queued twice replaces rather than duplicates", () => {
  const first = entry({ id: "a", dedupeKey: "pm:wo-1" });
  const second = entry({ id: "b", dedupeKey: "pm:wo-1", body: '{"newer":true}' });
  const q = upsertEntry(upsertEntry([], first), second);
  assert.equal(q.length, 1);
  assert.equal(q[0].id, "b", "the later submission wins");
});

test("entries with no dedupe key all queue separately", () => {
  const q = upsertEntry(upsertEntry([], entry({ id: "a" })), entry({ id: "b" }));
  assert.equal(q.length, 2);
  assert.deepEqual(removeEntry(q, "a").map((e) => e.id), ["b"]);
});

test("only pending entries are sent; failed ones wait for a decision", () => {
  const q = [entry({ id: "a" }), entry({ id: "b", status: "FAILED" }), entry({ id: "c", status: "SENDING" })];
  assert.deepEqual(sendable(q).map((e) => e.id), ["a"]);
  assert.deepEqual(failed(q).map((e) => e.id), ["b"]);
});

// A broken outbox must not take the page down with it.
test("corrupt or missing storage reads as empty rather than throwing", () => {
  assert.deepEqual(deserialize(null), []);
  assert.deepEqual(deserialize(""), []);
  assert.deepEqual(deserialize("not json"), []);
  assert.deepEqual(deserialize('{"not":"an array"}'), []);
  assert.deepEqual(deserialize("[1,2,3]"), []);
  assert.deepEqual(deserialize('[{"id":"x"}]'), [], "entries missing required fields are discarded");
});

test("a valid queue round-trips through storage", () => {
  const q = [entry({ id: "a" }), entry({ id: "b", dedupeKey: "k" })];
  assert.deepEqual(deserialize(serialize(q)), q);
});

// Evicting the oldest entry to make room would silently destroy a submission
// the user believes is queued.
test("a queue too large to store is refused rather than trimmed", () => {
  const big = entry({ body: "x".repeat(5000) });
  assert.equal(fitsInStore([big], 4000), false);
  assert.equal(fitsInStore([big], 100_000), true);
  assert.equal(fitsInStore([], 10), true);
});

test("ages read in plain words", () => {
  const now = new Date("2026-08-08T12:00:00Z");
  assert.equal(describeAge("2026-08-08T11:59:40Z", now), "just now");
  assert.equal(describeAge("2026-08-08T11:30:00Z", now), "30 min ago");
  assert.equal(describeAge("2026-08-08T09:00:00Z", now), "3 hr ago");
  assert.equal(describeAge("2026-08-06T12:00:00Z", now), "2 day(s) ago");
  assert.equal(describeAge("rubbish", now), "just now", "an unparseable date must not render NaN");
});
