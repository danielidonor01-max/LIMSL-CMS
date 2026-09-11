// src/lib/maintenance/time-log.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sessionHours,
  totalLoggedHours,
  openSessionFor,
  runningSessions,
  canClockIn,
  canClockOff,
  hoursByPerson,
  formatHours,
  type TimeSession,
} from "@/lib/maintenance/time-log";

const s = (
  id: string,
  userId: string | null,
  startedAt: string,
  endedAt: string | null,
  userName = "Emeka",
): TimeSession => ({ id, userId, userName, startedAt, endedAt });

test("a closed stretch is worth the hours between its ends", () => {
  assert.equal(
    sessionHours(s("1", "u1", "2026-09-11T08:00:00Z", "2026-09-11T11:30:00Z")),
    3.5,
  );
});

test("a running clock counts for nothing until it is stopped", () => {
  // The total is what the job HAS cost. A figure that climbs while nobody is
  // looking cannot be signed for at close-out.
  assert.equal(sessionHours(s("1", "u1", "2026-09-11T08:00:00Z", null)), null);
  assert.equal(totalLoggedHours([s("1", "u1", "2026-09-11T08:00:00Z", null)]), 0);
});

test("an unparseable timestamp is worth nothing, not thousands of hours", () => {
  // The failure this is written against: a date parser that returned a huge
  // number for junk input, which then looked like real data on a dashboard.
  assert.equal(sessionHours(s("1", "u1", "not a date", "2026-09-11T11:00:00Z")), null);
  assert.equal(sessionHours(s("1", "u1", "2026-09-11T08:00:00Z", "whenever")), null);
  assert.equal(totalLoggedHours([s("1", "u1", "not a date", "also not a date")]), 0);
});

test("a stretch that ends before it starts is discarded, not subtracted", () => {
  // A clock set wrong on a phone. Counting it as negative work would quietly
  // reduce the total for the whole job and nothing would say why.
  assert.equal(sessionHours(s("1", "u1", "2026-09-11T11:00:00Z", "2026-09-11T08:00:00Z")), null);
  const sessions = [
    s("1", "u1", "2026-09-11T08:00:00Z", "2026-09-11T10:00:00Z"),
    s("2", "u1", "2026-09-11T14:00:00Z", "2026-09-11T09:00:00Z"),
  ];
  assert.equal(totalLoggedHours(sessions), 2);
});

test("hours add across several stretches on the same job", () => {
  // The normal shape of a real job: start, break for a part to arrive, resume.
  const sessions = [
    s("1", "u1", "2026-09-11T08:00:00Z", "2026-09-11T10:00:00Z"),
    s("2", "u1", "2026-09-11T13:00:00Z", "2026-09-11T14:30:00Z"),
  ];
  assert.equal(totalLoggedHours(sessions), 3.5);
});

test("elapsed time is not the same as hours worked", () => {
  // Started Friday afternoon, finished Monday morning. Seventy-two hours
  // elapsed, three hours of work, and mean time to repair wants the three.
  const sessions = [
    s("1", "u1", "2026-09-11T16:00:00Z", "2026-09-11T18:00:00Z"),
    s("2", "u1", "2026-09-14T08:00:00Z", "2026-09-14T09:00:00Z"),
  ];
  assert.equal(totalLoggedHours(sessions), 3);
});

test("the total is rounded to minutes, not to a float artefact", () => {
  const sessions = [
    s("1", "u1", "2026-09-11T08:00:00Z", "2026-09-11T08:40:00Z"),
    s("2", "u1", "2026-09-11T09:00:00Z", "2026-09-11T09:40:00Z"),
  ];
  assert.equal(totalLoggedHours(sessions), 1.33);
});

test("several people on one job at once is normal and allowed", () => {
  // A lead and two assistants on the same machine. Refusing the second person
  // because the job already has a clock running would make the feature unusable
  // on exactly the jobs that need it.
  const sessions = [s("1", "u1", "2026-09-11T08:00:00Z", null)];
  assert.deepEqual(canClockIn(sessions, "u2"), { ok: true });
});

test("the same person cannot clock on twice", () => {
  // What actually happens: somebody forgets to clock off, comes back the next
  // morning and presses the button again. Allowing it leaves the first stretch
  // running forever and the total meaningless.
  const sessions = [s("1", "u1", "2026-09-11T08:00:00Z", null)];
  const decision = canClockIn(sessions, "u1");
  assert.equal(decision.ok, false);
  assert.match(decision.ok === false ? decision.error : "", /already clocked on/i);
});

test("clocking on again after clocking off is fine", () => {
  const sessions = [s("1", "u1", "2026-09-11T08:00:00Z", "2026-09-11T10:00:00Z")];
  assert.deepEqual(canClockIn(sessions, "u1"), { ok: true });
});

test("clocking off without being on is refused", () => {
  assert.equal(canClockOff([], "u1").ok, false);
  assert.equal(
    canClockOff([s("1", "u1", "2026-09-11T08:00:00Z", "2026-09-11T10:00:00Z")], "u1").ok,
    false,
  );
  assert.equal(canClockOff([s("1", "u1", "2026-09-11T08:00:00Z", null)], "u1").ok, true);
});

test("the open stretch found is this person's, not somebody else's", () => {
  const sessions = [
    s("1", "u1", "2026-09-11T08:00:00Z", null),
    s("2", "u2", "2026-09-11T09:00:00Z", null),
  ];
  assert.equal(openSessionFor(sessions, "u2")?.id, "2");
  assert.equal(openSessionFor(sessions, "u3"), null);
});

test("everyone currently on the job is listed in the order they started", () => {
  const sessions = [
    s("2", "u2", "2026-09-11T09:00:00Z", null),
    s("1", "u1", "2026-09-11T08:00:00Z", null),
    s("3", "u3", "2026-09-11T07:00:00Z", "2026-09-11T08:00:00Z"),
  ];
  assert.deepEqual(runningSessions(sessions).map((r) => r.id), ["1", "2"]);
});

test("hours are attributed per person, worst-first", () => {
  const sessions = [
    s("1", "u1", "2026-09-11T08:00:00Z", "2026-09-11T09:00:00Z", "Emeka"),
    s("2", "u2", "2026-09-11T08:00:00Z", "2026-09-11T11:00:00Z", "Marcel"),
    s("3", "u1", "2026-09-11T13:00:00Z", "2026-09-11T14:00:00Z", "Emeka"),
  ];
  assert.deepEqual(hoursByPerson(sessions), [
    { userId: "u2", userName: "Marcel", hours: 3 },
    { userId: "u1", userName: "Emeka", hours: 2 },
  ]);
});

test("two people with the same name are kept apart", () => {
  // Keyed by id, because a costing that merges two people's hours under one
  // name is wrong in a way nobody can see by reading it.
  const sessions = [
    s("1", "u1", "2026-09-11T08:00:00Z", "2026-09-11T09:00:00Z", "Emeka"),
    s("2", "u2", "2026-09-11T08:00:00Z", "2026-09-11T10:00:00Z", "Emeka"),
  ];
  assert.equal(hoursByPerson(sessions).length, 2);
});

test("a duration reads the way somebody would say it", () => {
  assert.equal(formatHours(3.5), "3h 30m");
  assert.equal(formatHours(0.75), "45m");
  assert.equal(formatHours(2), "2h");
  assert.equal(formatHours(0), "0m");
});

test("no hours reads as nothing rather than as zero", () => {
  // A job nobody has booked time to has not taken no time; it has an unknown
  // amount, and "0h" is a claim.
  assert.equal(formatHours(null), "—");
  assert.equal(formatHours(undefined), "—");
  assert.equal(formatHours(NaN), "—");
  assert.equal(formatHours(-3), "—");
});
