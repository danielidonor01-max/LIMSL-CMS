// src/lib/__tests__/signing-feedback.test.ts
// What the trail is told and when (LIMSL, 16 Nov 2026): the milestone a
// signature reaches, who may ping the next signer and how often, which
// sidebar modules carry a dot, and when a PM batch counts as authorised.
import { test } from "node:test";
import assert from "node:assert/strict";
import { milestoneAfterSign } from "@/lib/signoff/milestones";
import { pingEligibility, pingWindow } from "@/lib/signoff/ping";
import { nextPendingStep, stepAudience, WMS_CHAIN, JHA_CHAIN } from "@/lib/signoff/chains";
import { attentionModules } from "@/lib/attention";
import { batchAuthorisation } from "@/lib/maintenance/batch-authorisation";

const wms = (signed: number, by: (i: number) => string = (i) => `u${i}`) =>
  WMS_CHAIN.map((s, i) => ({
    stepOrder: i + 1,
    role: s.role,
    roleLabel: s.roleLabel,
    required: true,
    status: i < signed ? "SIGNED" : "PENDING",
    signedById: i < signed ? by(i + 1) : null,
    signerUserId: null as string | null,
    signerUserName: null as string | null,
  }));

test("a signature mid-pass moves the document on and names who is next", () => {
  const m = milestoneAfterSign("WMS", wms(1), 1);
  assert.equal(m.kind, "SIGNED");
  assert.equal(m.next?.who, "Maintenance Manager");
});

test("the third signature finishes pass 1, and pass 2 starts with the originator again", () => {
  const m = milestoneAfterSign("WMS", wms(3), 3);
  assert.equal(m.kind, "PASS_COMPLETE");
  assert.equal(m.pass, "REVIEW");
  assert.equal(m.next?.who, "Foreman");
});

test("the last signature completes the document", () => {
  assert.equal(milestoneAfterSign("WMS", wms(6), 6).kind, "CHAIN_COMPLETE");
});

test("the next pending step is the first unsigned one, and a returned chain has none", () => {
  assert.equal(nextPendingStep(wms(2))?.stepOrder, 3);
  const returned = wms(2).map((s) => (s.stepOrder === 3 ? { ...s, status: "REJECTED" } : s));
  assert.equal(nextPendingStep(returned), null);
});

test("a step bound to a person waits on that person, not on everyone in the role", () => {
  assert.deepEqual(stepAudience("JHA", { stepOrder: 2, role: "FOREMAN", signerUserId: "f1" }), { userIds: ["f1"] });
  assert.deepEqual(stepAudience("WMS", { stepOrder: 2, role: "MAINTENANCE_MANAGER" }), { roles: ["MAINTENANCE_MANAGER"] });
  // The originator's step names Foreman and Super Admin; the reminder goes to the Foreman.
  assert.deepEqual(stepAudience("WMS", { stepOrder: 1, role: "FOREMAN" }), { roles: ["FOREMAN"] });
  assert.equal(JHA_CHAIN[1].signer, "WMS_ORIGINATOR");
});

test("only someone who has signed can ping, and never the person it waits on", () => {
  const chain = wms(1, () => "foreman-1");
  assert.ok(pingEligibility({ id: "foreman-1", role: "FOREMAN" }, "WMS", chain).ok);
  const mm = pingEligibility({ id: "mm-1", role: "MAINTENANCE_MANAGER" }, "WMS", chain);
  assert.ok(!mm.ok && /waiting on you/.test(mm.reason));
  const tech = pingEligibility({ id: "t-1", role: "TECHNICIAN" }, "WMS", chain);
  assert.ok(!tech.ok && /Only people who have signed/.test(tech.reason));
  assert.ok(pingEligibility({ id: "sa-1", role: "SUPER_ADMIN" }, "WMS", chain).ok, "a Super Admin can chase the MM step it cannot sign");
  assert.ok(!pingEligibility({ id: "foreman-1", role: "FOREMAN" }, "WMS", wms(6, () => "foreman-1")).ok);
});

test("one ping per document every 30 minutes", () => {
  const at = Date.parse("2026-11-16T10:00:00Z");
  assert.deepEqual(pingWindow(null, at), { allowed: true, nextAt: null });
  const recent = pingWindow("2026-11-16T09:45:00Z", at);
  assert.equal(recent.allowed, false);
  assert.equal(recent.nextAt, "2026-11-16T10:15:00.000Z");
  assert.equal(pingWindow("2026-11-16T09:30:00Z", at).allowed, true);
});

test("the sidebar dot follows the work, not the inbox", () => {
  const none = {
    signoffs: [] as string[],
    batchesNeedingWms: 0,
    batchesNeedingJha: 0,
    batchesNeedingPermit: 0,
    myOpenWork: 0,
    canWriteWms: false,
    canWriteJha: false,
    canIssuePermit: false,
  };
  assert.deepEqual(attentionModules(none), []);
  // HSE asked to raise a JHA: the dot is on JHA until the JHA exists.
  assert.deepEqual(attentionModules({ ...none, canWriteJha: true, batchesNeedingJha: 1 }), ["/jha"]);
  // Somebody who cannot raise it is not dotted for it.
  assert.deepEqual(attentionModules({ ...none, batchesNeedingJha: 1 }), []);
  // A batch approval waiting on the Maintenance Manager.
  assert.deepEqual(attentionModules({ ...none, signoffs: ["PM_BATCH"] }), ["/approvals", "/pm-batches"]);
  assert.deepEqual(attentionModules({ ...none, myOpenWork: 2 }), ["/my-tasks"]);
});

test("a batch is authorised once every live line is approved", () => {
  const line = (status: string, n = "WO-2026-0035/1") => ({ workOrderNumber: n, status });
  assert.equal(batchAuthorisation([line("PENDING_APPROVAL"), line("PENDING_APPROVAL")]).ok, false);
  assert.equal(batchAuthorisation([line("OPEN"), line("OPEN"), line("CANCELLED")]).ok, true);
  assert.equal(batchAuthorisation([line("OPEN"), line("REJECTED", "WO-2026-0035/2")]).ok, false);
  assert.equal(batchAuthorisation([line("CANCELLED")]).ok, false);
});
