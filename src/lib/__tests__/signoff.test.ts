// Regression tests for the generic sign-off engine's pure half. These encode the
// compliance rule that makes the chain auditable: a step cannot be signed until
// every earlier REQUIRED step carries a real signature.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CHAINS,
  CM_CHAIN,
  PM_CHAIN,
  PROCEDURE_CHAIN,
  PTW_CHAIN,
  PTW_CLOSEOUT_CHAIN,
  WMS_CHAIN,
  chainFor,
  chainSummary,
  isStepUnlocked,
  type ChainStep,
} from "@/lib/signoff/chains";
import { ROLES } from "@/lib/roles";

type StepState = { stepOrder: number; required: boolean | null; status: string };

const step = (stepOrder: number, status: string, required: boolean | null = true): StepState => ({
  stepOrder,
  required,
  status,
});

// Materialise a declared chain the way the signoffs table does: one row per
// step, ordered from 1.
const materialise = (chain: ChainStep[], statuses: string[]): StepState[] =>
  chain.map((s, i) => ({ stepOrder: i + 1, required: s.required, status: statuses[i] ?? "PENDING" }));

// ── isStepUnlocked ───────────────────────────────────────────────────────────

test("isStepUnlocked: the first step has no predecessors and is always open", () => {
  const chain = [step(1, "PENDING"), step(2, "PENDING"), step(3, "PENDING")];
  assert.equal(isStepUnlocked(chain, 1), true);
});

test("isStepUnlocked: an unsigned earlier required step locks the chain", () => {
  const chain = [step(1, "PENDING"), step(2, "PENDING")];
  assert.equal(isStepUnlocked(chain, 2), false);
});

test("isStepUnlocked: earlier required steps signed in order open the next step", () => {
  const chain = [step(1, "SIGNED"), step(2, "SIGNED"), step(3, "PENDING")];
  assert.equal(isStepUnlocked(chain, 3), true);
});

test("isStepUnlocked: a gap anywhere behind the step still locks it", () => {
  // Step 2 was skipped; signing step 1 and 3 must not open step 4.
  const chain = [step(1, "SIGNED"), step(2, "PENDING"), step(3, "SIGNED"), step(4, "PENDING")];
  assert.equal(isStepUnlocked(chain, 4), false);
});

test("isStepUnlocked: an optional earlier step never blocks", () => {
  const chain = [step(1, "SIGNED"), step(2, "PENDING", false), step(3, "PENDING")];
  assert.equal(isStepUnlocked(chain, 3), true);
});

test("isStepUnlocked: required=null is treated as optional and does not block", () => {
  const chain = [step(1, "PENDING", null), step(2, "PENDING")];
  assert.equal(isStepUnlocked(chain, 2), true);
});

test("isStepUnlocked: a REJECTED earlier required step blocks everything after it", () => {
  const chain = [step(1, "SIGNED"), step(2, "REJECTED"), step(3, "PENDING")];
  assert.equal(isStepUnlocked(chain, 3), false);
  // …and only SIGNED clears it, no other terminal status counts.
  for (const status of ["REJECTED", "PENDING", "SKIPPED", "signed", ""]) {
    assert.equal(isStepUnlocked([step(1, status), step(2, "PENDING")], 2), status === "SIGNED");
  }
});

test("isStepUnlocked: the step's own status and later steps are irrelevant", () => {
  const chain = [step(1, "SIGNED"), step(2, "REJECTED"), step(3, "PENDING")];
  assert.equal(isStepUnlocked(chain, 2), true);
  // A signature further down the chain cannot retro-unlock an earlier step.
  assert.equal(isStepUnlocked([step(1, "PENDING"), step(2, "SIGNED"), step(3, "SIGNED")], 2), false);
});

test("isStepUnlocked: an unknown step order is gated by every required step before it", () => {
  const chain = [step(1, "SIGNED"), step(2, "SIGNED")];
  assert.equal(isStepUnlocked(chain, 99), true);
  assert.equal(isStepUnlocked([step(1, "SIGNED"), step(2, "PENDING")], 99), false);
});

// ── chainSummary ─────────────────────────────────────────────────────────────

test("chainSummary: counts only required steps", () => {
  const s = chainSummary([
    { required: true, status: "SIGNED" },
    { required: false, status: "PENDING" },
    { required: true, status: "PENDING" },
  ]);
  assert.deepEqual(s, { total: 2, signed: 1, complete: false });
});

test("chainSummary: complete once every required step is signed, optional ones ignored", () => {
  const s = chainSummary([
    { required: true, status: "SIGNED" },
    { required: true, status: "SIGNED" },
    { required: false, status: "PENDING" },
    { required: null, status: "PENDING" },
  ]);
  assert.deepEqual(s, { total: 2, signed: 2, complete: true });
});

test("chainSummary: a REJECTED required step is not complete", () => {
  const s = chainSummary([
    { required: true, status: "SIGNED" },
    { required: true, status: "REJECTED" },
  ]);
  assert.equal(s.complete, false);
  assert.equal(s.signed, 1);
});

test("chainSummary: an empty chain is never complete", () => {
  assert.deepEqual(chainSummary([]), { total: 0, signed: 0, complete: false });
});

test("chainSummary: an all-optional chain is never complete", () => {
  const s = chainSummary([
    { required: false, status: "SIGNED" },
    { required: false, status: "SIGNED" },
  ]);
  assert.deepEqual(s, { total: 0, signed: 0, complete: false });
});

test("chainSummary: CM close-out completes without the optional COO signature", () => {
  const statuses = CM_CHAIN.map((s) => (s.required ? "SIGNED" : "PENDING"));
  const s = chainSummary(materialise(CM_CHAIN, statuses));
  assert.equal(s.total, 5);
  assert.equal(s.complete, true);
});

// ── Declared chain integrity ─────────────────────────────────────────────────

test("chainFor resolves every registered entity type and returns [] for anything else", () => {
  assert.equal(chainFor("PM_CHECKLIST"), PM_CHAIN);
  assert.equal(chainFor("CORRECTIVE"), CM_CHAIN);
  assert.equal(chainFor("WMS"), WMS_CHAIN);
  assert.equal(chainFor("PROCEDURE"), PROCEDURE_CHAIN);
  assert.equal(chainFor("PERMIT"), PTW_CHAIN);
  assert.equal(chainFor("PERMIT_CLOSEOUT"), PTW_CLOSEOUT_CHAIN);
  assert.deepEqual(chainFor("NOT_A_CHAIN"), []);
  assert.deepEqual(chainFor(""), []);
});

test("every declared chain is non-empty, uses canonical roles and has a required step", () => {
  for (const [entityType, chain] of Object.entries(CHAINS)) {
    assert.ok(chain.length > 0, `${entityType} has no steps`);
    assert.ok(
      chain.some((s) => s.required),
      `${entityType} has no required step, chainSummary could never complete`,
    );
    for (const s of chain) {
      assert.ok(
        (ROLES as readonly string[]).includes(s.role),
        `${entityType} step role "${s.role}" is not a canonical role`,
      );
      assert.ok(s.roleLabel.trim().length > 0, `${entityType} step ${s.role} has no label`);
    }
    // A repeated role is normally a bug: with one person per role in a shop this
    // size, the chain could never be completed. PERMIT is the one deliberate
    // exception, because the printed permit genuinely carries two Foreman-level
    // signatures (the applicant and the site supervisor) from two different
    // people, and two Technician-level ones (the permit holder, who is bound to
    // a named person, and the affected custodian). Person-level segregation is
    // enforced at signing time, so the repeat still means two humans.
    const roles = chain.map((s) => s.role);
    if (entityType !== "PERMIT") {
      assert.equal(new Set(roles).size, roles.length, `${entityType} repeats a role in its chain`);
    }
  }
});

test("the permit chain matches the signature blocks on the printed form", () => {
  const chain = CHAINS.PERMIT;
  assert.deepEqual(
    chain.map((s) => s.roleLabel),
    [
      "Permit Applicant (PA)",
      "Asset Holder Supervisor (AHS)",
      "Asset Holder Site Supervisor (AHSS)",
      "Permit Holder (PH)",
      "Affected Custodian (AC)",
    ],
  );
  // The Contractor Supervisor block is not here on purpose: LIMSL permits cover
  // internal work only, and a step nobody ever signs is a step people learn to
  // skip.
  assert.equal(
    chain.some((s) => s.roleLabel.includes("Contractor")),
    false,
  );
  // Only the affected custodian is optional. A permit missing any of the other
  // four is not a permit.
  assert.deepEqual(
    chain.filter((s) => !s.required).map((s) => s.roleLabel),
    ["Affected Custodian (AC)"],
  );
});

test("the permit holder step is bound to a person, not to a role", () => {
  const ph = CHAINS.PERMIT.find((s) => s.roleLabel.startsWith("Permit Holder"));
  assert.equal(ph?.signer, "PERMIT_HOLDER");
  // Nothing else in any chain is person-bound; a stray binding would silently
  // lock a step to whoever happened to be named on the record.
  for (const [entityType, chain] of Object.entries(CHAINS)) {
    for (const s of chain) {
      if (s.signer) {
        assert.equal(entityType, "PERMIT", `${entityType} has an unexpected person-bound step`);
      }
    }
  }
});

test("the document chain runs work order, then WMS, then JHA, then permit", () => {
  // Each document's chain must exist for the flow to be enforceable at all.
  for (const entityType of ["WORK_ORDER", "WMS", "JHA", "PERMIT"]) {
    assert.ok(CHAINS[entityType]?.length > 0, `${entityType} has no sign-off chain`);
  }
  // HSE prepares the JHA. It is the handover point from maintenance to safety,
  // and if HSE is not the first step the analysis is being written by the same
  // department whose work it is meant to challenge.
  assert.equal(CHAINS.JHA[0].role, "HSE");
});

test("every declared chain unlocks strictly in declaration order", () => {
  for (const [entityType, chain] of Object.entries(CHAINS)) {
    const statuses = chain.map(() => "PENDING");

    // Nothing beyond the first step is reachable on a fresh chain.
    for (let i = 1; i < chain.length; i++) {
      const rows = materialise(chain, statuses);
      const earlierRequired = chain.slice(0, i).some((s) => s.required);
      assert.equal(
        isStepUnlocked(rows, i + 1),
        !earlierRequired,
        `${entityType} step ${i + 1} unlock state is wrong on a fresh chain`,
      );
    }

    // Signing top-down opens each successive step and completes the chain.
    for (let i = 0; i < chain.length; i++) {
      assert.equal(
        isStepUnlocked(materialise(chain, statuses), i + 1),
        true,
        `${entityType} step ${i + 1} should be open once step ${i} is signed`,
      );
      statuses[i] = "SIGNED";
    }
    assert.equal(chainSummary(materialise(chain, statuses)).complete, true, `${entityType} never completes`);
  }
});

// ── Segregation of duties ────────────────────────────────────────────────────
// A multi-level chain means multiple PEOPLE. Rank-seniority lets a manager cover
// a junior step, which without this rule let ONE senior sign an entire chain
// alone, including the HSE safety step, collapsing the control the chain
// exists to provide. Mirrors the guard in POST /api/signoffs/[id].
const alreadySignedByMe = (
  chain: Array<{ id: string; status: string; signedById: string | null }>,
  stepId: string,
  userId: string,
) => chain.find((s) => s.id !== stepId && s.status === "SIGNED" && s.signedById && s.signedById === userId);

test("one person cannot sign two steps of the same chain", () => {
  const chain = [
    { id: "s1", status: "SIGNED", signedById: "u-boss" },
    { id: "s2", status: "PENDING", signedById: null },
  ];
  assert.ok(alreadySignedByMe(chain, "s2", "u-boss"), "same signer must be blocked on a later step");
  assert.equal(alreadySignedByMe(chain, "s2", "u-other"), undefined, "a different person must be allowed");
});

test("re-signing your own rejected step is not blocked by the segregation rule", () => {
  const chain = [{ id: "s1", status: "REJECTED", signedById: "u-a" }];
  assert.equal(alreadySignedByMe(chain, "s1", "u-a"), undefined);
});

test("an unsigned earlier step never blocks a later signer", () => {
  const chain = [
    { id: "s1", status: "PENDING", signedById: null },
    { id: "s2", status: "PENDING", signedById: null },
  ];
  assert.equal(alreadySignedByMe(chain, "s2", "u-a"), undefined);
});
