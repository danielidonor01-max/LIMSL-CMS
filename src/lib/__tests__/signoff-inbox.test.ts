// src/lib/__tests__/signoff-inbox.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { pendingFor, sortInbox, entityHref, entityLabel, ENTITY_META } from "@/lib/signoff/inbox";
import { CHAINS } from "@/lib/signoff/chains";

const row = (o: Partial<Parameters<typeof pendingFor>[0][number]> = {}) => ({
  id: o.id ?? "s1",
  entityType: o.entityType ?? "WORK_ORDER",
  entityId: o.entityId ?? "wo1",
  stepOrder: o.stepOrder ?? 1,
  role: o.role ?? "FOREMAN",
  roleLabel: o.roleLabel ?? "Requested by",
  required: o.required ?? true,
  status: o.status ?? "PENDING",
  signerUserId: o.signerUserId ?? null,
  signerUserName: o.signerUserName ?? null,
});

test("a step is offered only to somebody who can sign it", () => {
  const rows = [row({ role: "FACTORY_MANAGER" })];
  assert.equal(pendingFor(rows, { role: "TECHNICIAN", id: "u1" }).length, 0);
  assert.equal(pendingFor(rows, { role: "FACTORY_MANAGER", id: "u2" }).length, 1);
  // Seniority carries, which is how an absent junior gets covered.
  assert.equal(pendingFor(rows, { role: "SUPER_ADMIN", id: "u3" }).length, 1);
});

test("a locked step stays out of the inbox", () => {
  // The whole point of an inbox is that everything in it can be actioned. A
  // step whose predecessor is unsigned cannot be, and filling the list with
  // those is what stops people reading it.
  const rows = [
    row({ id: "a", stepOrder: 1, role: "TECHNICIAN", status: "PENDING" }),
    row({ id: "b", stepOrder: 2, role: "FOREMAN", status: "PENDING" }),
  ];
  const items = pendingFor(rows, { role: "SUPER_ADMIN", id: "u1" });
  assert.deepEqual(items.map((i) => i.signoffId), ["a"]);
});

test("once the earlier step is signed the next one appears", () => {
  const rows = [
    row({ id: "a", stepOrder: 1, role: "TECHNICIAN", status: "SIGNED" }),
    row({ id: "b", stepOrder: 2, role: "FOREMAN", status: "PENDING" }),
  ];
  const items = pendingFor(rows, { role: "FOREMAN", id: "u1" });
  assert.deepEqual(items.map((i) => i.signoffId), ["b"]);
});

test("a step reserved for one person is not opened by rank", () => {
  // The permit holder signs the permit issued to him. A manager outranking him
  // does not get to sign it for him, and that is the point of the reservation.
  const rows = [row({ role: "TECHNICIAN", signerUserId: "holder" })];
  assert.equal(pendingFor(rows, { role: "SUPER_ADMIN", id: "someone-else" }).length, 0);
  const mine = pendingFor(rows, { role: "TECHNICIAN", id: "holder" });
  assert.equal(mine.length, 1);
  assert.equal(mine[0].personal, true);
});

test("chains are read per entity, not across them", () => {
  // Two records each waiting on their own first step. Grouping them together
  // would let one record's signed step unlock another record's second step.
  const rows = [
    row({ id: "a", entityId: "wo1", stepOrder: 1, status: "SIGNED", role: "TECHNICIAN" }),
    row({ id: "b", entityId: "wo1", stepOrder: 2, status: "PENDING", role: "FOREMAN" }),
    row({ id: "c", entityId: "wo2", stepOrder: 1, status: "PENDING", role: "TECHNICIAN" }),
    row({ id: "d", entityId: "wo2", stepOrder: 2, status: "PENDING", role: "FOREMAN" }),
  ];
  const items = pendingFor(rows, { role: "SUPER_ADMIN", id: "u1" });
  assert.deepEqual(items.map((i) => i.signoffId).sort(), ["b", "c"]);
});

test("a signature addressed to you by name sorts above everything", () => {
  // Nobody else can clear it, so it cannot wait behind work a colleague could
  // pick up.
  const items = sortInbox([
    { entityType: "PERMIT", personal: false },
    { entityType: "PROCEDURE", personal: true },
  ]);
  assert.equal(items[0].entityType, "PROCEDURE");
});

test("a permit outranks paperwork", () => {
  // A crew is standing at a machine waiting for it. A procedure revision is not.
  const items = sortInbox([
    { entityType: "PROCEDURE", personal: false },
    { entityType: "PM_CHECKLIST", personal: false },
    { entityType: "PERMIT", personal: false },
  ]);
  assert.deepEqual(items.map((i) => i.entityType), ["PERMIT", "PM_CHECKLIST", "PROCEDURE"]);
});

test("every chain the engine knows about has somewhere to send the reader", () => {
  // A new chain added to chains.ts without a row here would render as an
  // unlabelled item linking to the dashboard, which is a dead end in the one
  // place people go to clear their work.
  for (const entityType of Object.keys(CHAINS)) {
    assert.ok(ENTITY_META[entityType], `${entityType} has no inbox destination`);
    assert.notEqual(entityHref(entityType, "x"), "/", `${entityType} links nowhere`);
    assert.ok(entityLabel(entityType).length > 0);
  }
});
