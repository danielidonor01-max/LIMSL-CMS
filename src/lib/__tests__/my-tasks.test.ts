// src/lib/__tests__/my-tasks.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bucketOf,
  groupTasks,
  headlineFor,
  totalOutstanding,
  BUCKET_LABEL,
  type Task,
} from "@/lib/my-tasks";

const TODAY = "2026-09-10";

const task = (dueDate: string | null, id = dueDate ?? "none"): Task => ({
  kind: "WORK_ORDER",
  id,
  code: `WO-${id}`,
  title: "Job",
  href: `/work-orders/${id}`,
  dueDate,
  status: "OPEN",
});

test("today is its own bucket, not the start of the week", () => {
  // "Due today" and "due Friday" are different instructions to somebody
  // deciding what to pick up next.
  assert.equal(bucketOf("2026-09-09", TODAY), "OVERDUE");
  assert.equal(bucketOf(TODAY, TODAY), "TODAY");
  assert.equal(bucketOf("2026-09-11", TODAY), "SOON");
  assert.equal(bucketOf("2026-09-17", TODAY), "SOON");
  assert.equal(bucketOf("2026-09-18", TODAY), "LATER");
});

test("a job with no date is not quietly filed under later", () => {
  // An undated job has its own problem, and folding it in with next month's
  // work is how it stays undated.
  assert.equal(bucketOf(null, TODAY), "UNDATED");
  assert.equal(bucketOf(undefined, TODAY), "UNDATED");
  const g = groupTasks([task(null)], TODAY);
  assert.equal(g.UNDATED.length, 1);
  assert.equal(g.LATER.length, 0);
});

test("the oldest overdue job is at the very top", () => {
  // It is the one most likely to have been forgotten, so it cannot sit below a
  // job that went overdue yesterday.
  const g = groupTasks(
    [task("2026-09-09", "a"), task("2026-07-01", "b"), task("2026-08-15", "c")],
    TODAY,
  );
  assert.deepEqual(g.OVERDUE.map((t) => t.id), ["b", "c", "a"]);
});

test("everything else reads soonest first", () => {
  const g = groupTasks([task("2026-09-16", "a"), task("2026-09-11", "b")], TODAY);
  assert.deepEqual(g.SOON.map((t) => t.id), ["b", "a"]);
});

test("the headline names the worst thing first", () => {
  const overdue = groupTasks([task("2026-09-01"), task(TODAY, "t")], TODAY);
  assert.equal(headlineFor(overdue, "Emeka"), "One job is overdue, Emeka.");

  const todayOnly = groupTasks([task(TODAY, "t"), task("2026-09-12", "s")], TODAY);
  assert.equal(headlineFor(todayOnly, "Emeka"), "One job is due today, Emeka.");

  const soon = groupTasks([task("2026-09-12"), task("2026-09-13")], TODAY);
  assert.equal(headlineFor(soon), "2 jobs this week.");
});

test("an empty queue and a queue of future work say different things", () => {
  // "Nothing is due yet" and "nothing is assigned to you" mean different things
  // to a technician standing in a workshop at half past seven.
  assert.equal(headlineFor(groupTasks([], TODAY)), "Nothing is assigned to you.");
  assert.equal(headlineFor(groupTasks([task("2026-12-01")], TODAY)), "Nothing is due yet.");
});

test("the total counts every bucket, including undated", () => {
  const g = groupTasks([task("2026-09-01"), task(TODAY, "t"), task(null, "u")], TODAY);
  assert.equal(totalOutstanding(g), 3);
});

test("every bucket has a heading a person would recognise", () => {
  for (const b of ["OVERDUE", "TODAY", "SOON", "LATER", "UNDATED"] as const) {
    assert.ok(BUCKET_LABEL[b]?.length, `${b} has no label`);
  }
});
