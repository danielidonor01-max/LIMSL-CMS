// src/lib/notifications/categories.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classify,
  sortNotifications,
  CATEGORY_LABEL,
  CATEGORY_TONE,
  CATEGORY_FILTERS,
} from "./categories";

test("a permit expiry is safety and urgent, even though it arrives as GENERAL", () => {
  // GENERAL is the catch-all every new feature reaches for, so it carries some
  // of the most important messages in the system. Classifying on the event
  // alone would file a permit expiry alongside a newsletter.
  const r = classify({ event: "GENERAL", relatedEntityType: "permit" });
  assert.deepEqual(r, { category: "SAFETY", priority: "URGENT" });
});

test("a reported incident is safety and urgent", () => {
  assert.deepEqual(classify({ event: "GENERAL", relatedEntityType: "safety_incident" }), {
    category: "SAFETY",
    priority: "URGENT",
  });
});

test("the entity beats the event when both are known", () => {
  // A sign request about a permit is still about a permit.
  const r = classify({ event: "PROCEDURE_SIGN_REQUEST", relatedEntityType: "permit" });
  assert.equal(r.category, "SAFETY");
  assert.equal(r.priority, "URGENT");
});

test("the event still classifies when there is no entity", () => {
  assert.deepEqual(classify({ event: "BREAKDOWN" }), {
    category: "MAINTENANCE",
    priority: "URGENT",
  });
  assert.deepEqual(classify({ event: "PTW_SIGN_REQUEST", relatedEntityType: null }), {
    category: "SAFETY",
    priority: "URGENT",
  });
});

test("an unrecognised message is general and low, never urgent", () => {
  // Failing towards urgent would let any new event type shout at everybody.
  for (const n of [{}, { event: "SOMETHING_NEW" }, { relatedEntityType: "widget" }]) {
    assert.deepEqual(classify(n), { category: "GENERAL", priority: "LOW" });
  }
});

test("nothing is classified from the words in the message", () => {
  // A category derived from wording changes silently the day somebody rewrites
  // a message, so classify takes no title at all.
  const a = classify({ event: "GENERAL", relatedEntityType: "permit" });
  const b = classify({ event: "GENERAL", relatedEntityType: "permit" });
  assert.deepEqual(a, b);
});

test("unread comes first, then urgency, then newest", () => {
  const rows = [
    { id: "read-urgent", readAt: "x", relatedEntityType: "permit", createdAt: "2026-09-09" },
    { id: "unread-low", readAt: null, event: "PROCEDURE_SIGN_REQUEST", createdAt: "2026-09-01" },
    { id: "unread-urgent", readAt: null, relatedEntityType: "permit", createdAt: "2026-09-02" },
  ];
  assert.deepEqual(
    sortNotifications(rows).map((r) => r.id),
    ["unread-urgent", "unread-low", "read-urgent"],
  );
});

test("two messages of equal standing read newest first", () => {
  const rows = [
    { id: "old", readAt: null, relatedEntityType: "permit", createdAt: "2026-09-01" },
    { id: "new", readAt: null, relatedEntityType: "permit", createdAt: "2026-09-05" },
  ];
  assert.deepEqual(sortNotifications(rows).map((r) => r.id), ["new", "old"]);
});

test("only safety is tinted, so the tint keeps meaning something", () => {
  // Four coloured categories is the same failure as one flat list, reproduced
  // in colour.
  const tinted = (Object.keys(CATEGORY_TONE) as (keyof typeof CATEGORY_TONE)[]).filter(
    (k) => !CATEGORY_TONE[k].includes("ink-"),
  );
  assert.deepEqual(tinted, ["SAFETY"]);
});

test("every category has a label and a filter", () => {
  for (const c of ["SAFETY", "MAINTENANCE", "COMPLIANCE", "GENERAL"] as const) {
    assert.ok(CATEGORY_LABEL[c], `${c} has no label`);
    assert.ok(CATEGORY_FILTERS.includes(c), `${c} cannot be filtered to`);
  }
  assert.equal(CATEGORY_FILTERS[0], "ALL");
});
