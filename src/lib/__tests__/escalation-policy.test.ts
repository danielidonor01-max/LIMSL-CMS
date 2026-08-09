import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_ESCALATION_POLICY,
  normalisePolicy,
  audienceForAge,
  tierCrossed,
  diffDigest,
  shouldSendDigest,
  isSnoozed,
  validateSnooze,
} from "@/lib/maintenance/escalation-policy";
import { ROLES } from "@/lib/roles";

const P = DEFAULT_ESCALATION_POLICY;

// ── Age tiers ────────────────────────────────────────────────────────────────
// Escalation means the audience widens, not that the same people are told again
// more loudly.
test("the audience widens as an item ages, cumulatively", () => {
  assert.deepEqual(audienceForAge(0, P), ["FOREMAN"]);
  assert.deepEqual(audienceForAge(3, P), ["FOREMAN", "MAINTENANCE_MANAGER"]);
  assert.deepEqual(audienceForAge(7, P), ["FOREMAN", "MAINTENANCE_MANAGER", "FACTORY_MANAGER"]);
  assert.deepEqual(audienceForAge(30, P), ["FOREMAN", "MAINTENANCE_MANAGER", "FACTORY_MANAGER", "COO"]);
});

test("reaching a tier adds people rather than handing the problem over", () => {
  const at7 = audienceForAge(7, P);
  for (const r of audienceForAge(3, P)) {
    assert.ok(at7.includes(r), `${r} stopped being notified once the item aged`);
  }
});

test("the tier just crossed is identifiable, so the message can say what changed", () => {
  assert.equal(tierCrossed(2, 3, P)?.roles[0], "MAINTENANCE_MANAGER");
  assert.equal(tierCrossed(6, 8, P)?.roles[0], "FACTORY_MANAGER");
  assert.equal(tierCrossed(3, 4, P), null, "no tier between 3 and 4");
  // Jumping several tiers at once reports the highest reached.
  assert.equal(tierCrossed(0, 20, P)?.roles[0], "COO");
});

test("a nonsense age does not crash or notify everybody", () => {
  assert.deepEqual(audienceForAge(NaN, P), ["FOREMAN"]);
  assert.deepEqual(audienceForAge(-5, P), ["FOREMAN"]);
});

// ── Policy normalisation ─────────────────────────────────────────────────────
test("a stored policy survives being half-written or hand-edited", () => {
  assert.deepEqual(normalisePolicy(null), P);
  assert.deepEqual(normalisePolicy({}), P);
  assert.deepEqual(normalisePolicy({ tiers: "nonsense" }), P);
});

// A policy with no tiers notifies nobody, which looks exactly like a working
// system with nothing to report.
test("an empty tier list falls back to the default rather than silencing everything", () => {
  assert.deepEqual(normalisePolicy({ tiers: [] }).tiers, P.tiers);
  assert.deepEqual(normalisePolicy({ tiers: [{ afterDays: 1, roles: [] }] }).tiers, P.tiers);
});

test("tiers are sorted and de-duplicated whatever order they were saved in", () => {
  const n = normalisePolicy({
    tiers: [
      { afterDays: 9, roles: ["COO", "COO"] },
      { afterDays: 1, roles: ["FOREMAN"] },
    ],
  });
  assert.deepEqual(n.tiers.map((t) => t.afterDays), [1, 9]);
  assert.deepEqual(n.tiers[1].roles, ["COO"]);
});

test("out-of-range numbers are clamped, not accepted", () => {
  const n = normalisePolicy({ frequencyDays: 0, sendHour: 99, tiers: [{ afterDays: -4, roles: ["FOREMAN"] }] });
  assert.equal(n.frequencyDays, 1, "a frequency of zero would send continuously");
  assert.equal(n.sendHour, 23);
  assert.equal(n.tiers[0].afterDays, 0);
});

test("the default tiers name only real roles", () => {
  for (const t of P.tiers) {
    for (const r of t.roles) assert.ok((ROLES as readonly string[]).includes(r), `${r} is not a role`);
  }
});

// ── Change detection ─────────────────────────────────────────────────────────
// Counts are not enough: one machine fixed and another breaking leaves the count
// identical and the situation completely different.
test("the diff compares the set, not the count", () => {
  const d = diffDigest(["m1", "m2"], ["m2", "m3"]);
  assert.deepEqual(d.added, ["m3"]);
  assert.deepEqual(d.resolved, ["m1"]);
  assert.deepEqual(d.unchanged, ["m2"]);
  assert.equal(d.changed, true);
});

test("an identical set is not a change", () => {
  const d = diffDigest(["m1", "m2"], ["m2", "m1"]);
  assert.equal(d.changed, false);
  assert.deepEqual(d.added, []);
  assert.deepEqual(d.resolved, []);
});

test("the first ever digest counts everything as new", () => {
  const d = diffDigest(null, ["m1", "m2"]);
  assert.deepEqual(d.added, ["m1", "m2"]);
  assert.equal(d.changed, true);
});

// ── When to send ─────────────────────────────────────────────────────────────
// The behaviour that stops the flood: five machines still down, nothing new,
// nothing fixed → say nothing.
test("an unchanged situation sends nothing", () => {
  const r = shouldSendDigest({
    policy: P,
    lastSentAt: new Date("2026-08-08T07:00:00Z").toISOString(),
    diff: diffDigest(["m1", "m2", "m3", "m4", "m5"], ["m1", "m2", "m3", "m4", "m5"]),
    currentCount: 5,
    now: new Date("2026-08-12T07:00:00Z"), // Wednesday
  });
  assert.equal(r.send, false);
  assert.match(r.send === false ? r.reason : "", /nothing has changed/i);
});

test("a new breakdown is sent even if a digest already went out today", () => {
  const r = shouldSendDigest({
    policy: P,
    lastSentAt: new Date("2026-08-12T07:00:00Z").toISOString(),
    diff: diffDigest(["m1"], ["m1", "m2"]),
    currentCount: 2,
    now: new Date("2026-08-12T14:00:00Z"),
  });
  assert.equal(r.send, true, "sitting on a fresh breakdown is the opposite of escalation");
});

test("the frequency floor holds when nothing is new", () => {
  const weekly = { ...P, frequencyDays: 7 };
  const r = shouldSendDigest({
    policy: weekly,
    lastSentAt: new Date("2026-08-11T07:00:00Z").toISOString(),
    diff: diffDigest(["m1"], ["m1", "m2"]),
    currentCount: 2,
    now: new Date("2026-08-12T07:00:00Z"),
  });
  assert.equal(r.send, true, "a new item still overrides the floor");

  const quiet = shouldSendDigest({
    policy: weekly,
    lastSentAt: new Date("2026-08-11T07:00:00Z").toISOString(),
    diff: diffDigest(["m1"], ["m1"]),
    currentCount: 1,
    now: new Date("2026-08-12T07:00:00Z"),
  });
  assert.equal(quiet.send, false);
});

test("nothing outstanding means nothing to say", () => {
  const r = shouldSendDigest({ policy: P, lastSentAt: null, diff: diffDigest([], []), currentCount: 0 });
  assert.equal(r.send, false);
});

// Everything being fixed is worth one message, then silence.
test("the last item clearing is reported once", () => {
  const r = shouldSendDigest({
    policy: P,
    lastSentAt: new Date("2026-08-11T07:00:00Z").toISOString(),
    diff: diffDigest(["m1"], []),
    currentCount: 0,
    now: new Date("2026-08-12T07:00:00Z"),
  });
  assert.equal(r.send, true);
});

// The send window applies to cron ticks only. "Run now" doing nothing outside
// 07:00 would be indistinguishable from a broken button.
test("the send window holds a scheduled run but never blocks a manual one", () => {
  const args = {
    policy: { ...P, sendHour: 7 },
    lastSentAt: null,
    diff: diffDigest([], ["m1"]),
    currentCount: 1,
    now: new Date("2026-08-12T15:00:00"), // 15:00 local, not the send hour
  } as const;

  const scheduled = shouldSendDigest({ ...args, trigger: "scheduled" });
  assert.equal(scheduled.send, false);
  assert.match(scheduled.send === false ? scheduled.reason : "", /send window/i);

  assert.equal(shouldSendDigest({ ...args, trigger: "manual" }).send, true);
  assert.equal(shouldSendDigest(args).send, true, "manual is the safe default");
});

test("a scheduled run inside the window goes out", () => {
  const r = shouldSendDigest({
    policy: { ...P, sendHour: 7 },
    lastSentAt: null,
    diff: diffDigest([], ["m1"]),
    currentCount: 1,
    now: new Date("2026-08-12T07:30:00"),
    trigger: "scheduled",
  });
  assert.equal(r.send, true);
});

test("weekends are skipped when the workshop does not run", () => {
  const sat = shouldSendDigest({
    policy: P,
    lastSentAt: null,
    diff: diffDigest([], ["m1"]),
    currentCount: 1,
    now: new Date("2026-08-15T07:00:00Z"), // Saturday
  });
  assert.equal(sat.send, false);
  assert.match(sat.send === false ? sat.reason : "", /weekend/i);

  const weekendOn = shouldSendDigest({
    policy: { ...P, skipWeekends: false },
    lastSentAt: null,
    diff: diffDigest([], ["m1"]),
    currentCount: 1,
    now: new Date("2026-08-15T07:00:00Z"),
  });
  assert.equal(weekendOn.send, true);
});

test("repeatUnchanged restores the old always-send behaviour for anyone who wants it", () => {
  const r = shouldSendDigest({
    policy: { ...P, repeatUnchanged: true, frequencyDays: 1 },
    lastSentAt: new Date("2026-08-10T07:00:00Z").toISOString(),
    diff: diffDigest(["m1"], ["m1"]),
    currentCount: 1,
    now: new Date("2026-08-12T07:00:00Z"),
  });
  assert.equal(r.send, true);
});

// ── Snooze ───────────────────────────────────────────────────────────────────
test("a snoozed item stays quiet until its date, then returns", () => {
  const now = new Date("2026-08-12T09:00:00Z");
  assert.equal(isSnoozed({ until: "2026-08-20", reason: "part on order" }, now), true);
  assert.equal(isSnoozed({ until: "2026-08-01", reason: "part on order" }, now), false);
  assert.equal(isSnoozed(null, now), false);
  assert.equal(isSnoozed({ until: "rubbish", reason: null }, now), false);
});

test("snoozing requires a reason and a future date", () => {
  assert.equal(validateSnooze("", "2026-09-01", "2026-08-12").ok, false);
  assert.equal(validateSnooze("waiting", "2026-08-12", "2026-08-12").ok, false, "today is not the future");
  assert.equal(validateSnooze("bearing on order, ETA 3 weeks", "2026-09-01", "2026-08-12").ok, true);
  assert.equal(validateSnooze("bearing on order", "not-a-date", "2026-08-12").ok, false);
});
