// Regression tests for the code-side AI guardrail. The model is untrusted: the
// validator must strip every claim the evidence pack cannot back, refuse to let
// an unverified component tag look verified, and never hand a technician an
// energised procedure without a LOTO prerequisite.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateAiResponse,
  validateChatTurn,
  type EvidenceItem,
  type EvidencePack,
} from "@/lib/diagnostics/ai-assist";

type RawResponse = Parameters<typeof validateAiResponse>[0];
type RawChatTurn = Parameters<typeof validateChatTurn>[0];

const STANDARD_LOTO = "Isolate the machine and verify zero energy (LOTO) before starting";

const ITEMS: EvidenceItem[] = [
  { id: "G:g1", kind: "GUIDE", label: "Guide, will not start", text: "Symptom: will not start." },
  { id: "H:CMRF-2026-0007", kind: "HISTORY", label: "History, CMRF-2026-0007", text: "Verified root cause: seized bearing." },
  { id: "D:chunk1", kind: "DOC", label: "Manual · Section 4", text: "Torque the flange to 40 Nm." },
  { id: "C:CB-12", kind: "COMPONENT", label: "CB-12, main breaker", text: "CB-12: main breaker (BREAKER)." },
];

const pack = (): EvidencePack => ({ items: ITEMS, componentTags: new Set(["CB-12", "KM-3"]) });

const diagnosis = (over: Partial<RawResponse["diagnoses"][number]> = {}) => ({
  cause: "Seized spindle bearing",
  confidence: 0.7,
  evidenceIds: ["H:CMRF-2026-0007"],
  steps: [{ action: "Spin the spindle by hand and listen for roughness" }],
  ...over,
});

const respond = (over: Partial<RawResponse> = {}): RawResponse => ({
  diagnoses: [diagnosis()],
  insufficientEvidence: false,
  ...over,
});

// ── Grounding: evidence ids ──────────────────────────────────────────────────

test("invented evidence ids are stripped, real ones keep their label and kind", () => {
  const out = validateAiResponse(
    respond({ diagnoses: [diagnosis({ evidenceIds: ["H:CMRF-2026-0007", "G:does-not-exist", "H:CMRF-1999-0001"] })] }),
    pack(),
  );
  assert.equal(out.diagnoses.length, 1);
  assert.deepEqual(out.diagnoses[0].evidence, [
    { id: "H:CMRF-2026-0007", label: "History, CMRF-2026-0007", kind: "HISTORY" },
  ]);
});

test("evidence id matching is exact, no prefix or case fuzz", () => {
  const out = validateAiResponse(
    respond({ diagnoses: [diagnosis({ evidenceIds: ["h:cmrf-2026-0007", "H:CMRF-2026-000", "H:CMRF-2026-0007 "] })] }),
    pack(),
  );
  assert.equal(out.diagnoses.length, 0);
});

test("a diagnosis with zero verifiable evidence is dropped", () => {
  const out = validateAiResponse(respond({ diagnoses: [diagnosis({ evidenceIds: ["G:hallucinated"] })] }), pack());
  assert.deepEqual(out.diagnoses, []);
});

test("an ungrounded hypothesis survives only under insufficientEvidence", () => {
  const out = validateAiResponse(
    respond({ diagnoses: [diagnosis({ evidenceIds: [] })], insufficientEvidence: true, notes: "No history for this machine." }),
    pack(),
  );
  assert.equal(out.diagnoses.length, 1);
  assert.deepEqual(out.diagnoses[0].evidence, []);
  assert.equal(out.insufficientEvidence, true);
  assert.equal(out.notes, "No history for this machine.");
});

test("a diagnosis with no cause is dropped whatever its evidence", () => {
  const out = validateAiResponse(respond({ diagnoses: [diagnosis({ cause: "" })] }), pack());
  assert.deepEqual(out.diagnoses, []);
});

// ── Grounding: component tags ────────────────────────────────────────────────

test("unknown component tags are surfaced as verified:false, registry tags as true", () => {
  const out = validateAiResponse(
    respond({ diagnoses: [diagnosis({ componentTags: ["CB-12", "XX-99", " km-3 "] })] }),
    pack(),
  );
  assert.deepEqual(out.diagnoses[0].componentTags, [
    { tag: "CB-12", verified: true },
    { tag: "XX-99", verified: false },
    // Trimmed and matched case-insensitively, but the model's spelling is kept.
    { tag: "km-3", verified: true },
  ]);
});

test("blank component tags are discarded rather than rendered as empty chips", () => {
  const out = validateAiResponse(respond({ diagnoses: [diagnosis({ componentTags: ["", "   ", "CB-12"] })] }), pack());
  assert.deepEqual(out.diagnoses[0].componentTags, [{ tag: "CB-12", verified: true }]);
});

// ── Safety: LOTO injection ───────────────────────────────────────────────────

test("LOTO is injected when a step touches electrical energy and none was supplied", () => {
  const out = validateAiResponse(
    respond({
      diagnoses: [
        diagnosis({ cause: "Failed contactor coil", steps: [{ action: "Measure continuity across the contactor" }], safetyPrerequisites: ["Wear insulated gloves"] }),
      ],
    }),
    pack(),
  );
  assert.deepEqual(out.diagnoses[0].safetyPrerequisites, [STANDARD_LOTO, "Wear insulated gloves"]);
});

test("LOTO is injected for hydraulic and pneumatic stored energy too", () => {
  for (const cause of ["Hydraulic ram creeps under load", "Pneumatic line pressure drop"]) {
    const out = validateAiResponse(
      respond({ diagnoses: [diagnosis({ cause, safetyPrerequisites: [] })] }),
      pack(),
    );
    assert.equal(out.diagnoses[0].safetyPrerequisites[0], STANDARD_LOTO, `no LOTO for "${cause}"`);
  }
});

test("LOTO is detected from the step text even when the cause reads harmless", () => {
  const out = validateAiResponse(
    respond({ diagnoses: [diagnosis({ cause: "Intermittent stop", steps: [{ action: "Open the control panel and inspect the wiring" }], safetyPrerequisites: [] })] }),
    pack(),
  );
  assert.equal(out.diagnoses[0].safetyPrerequisites[0], STANDARD_LOTO);
});

test("an isolation prerequisite the model already supplied is not duplicated", () => {
  for (const supplied of [
    "Lock out and tag the main breaker",
    "Isolate the drive and prove dead",
    "Apply LOTO before opening the panel",
    "De-energise the panel",
  ]) {
    const out = validateAiResponse(
      respond({ diagnoses: [diagnosis({ cause: "Failed contactor coil", safetyPrerequisites: [supplied] })] }),
      pack(),
    );
    assert.deepEqual(out.diagnoses[0].safetyPrerequisites, [supplied], `duplicated LOTO for "${supplied}"`);
  }
});

test("a purely mechanical diagnosis gets no invented safety prerequisite", () => {
  const out = validateAiResponse(
    respond({
      diagnoses: [diagnosis({ cause: "Coolant reservoir low", steps: [{ action: "Top up the coolant to the sight glass" }], safetyPrerequisites: [] })],
    }),
    pack(),
  );
  assert.deepEqual(out.diagnoses[0].safetyPrerequisites, []);
});

// ── Confidence & shaping ─────────────────────────────────────────────────────

test("confidence is clamped to 0..100 and rounded", () => {
  const cases: Array<[unknown, number]> = [
    [0.7, 70],
    [0.756, 76],
    [0, 0],
    [1, 100],
    [1.5, 100],
    [42, 100],
    [-0.4, 0],
    [Number.NaN, 0],
    [undefined, 0],
    ["0.8", 80],
    ["not a number", 0],
  ];
  for (const [input, expected] of cases) {
    const out = validateAiResponse(
      respond({ diagnoses: [diagnosis({ confidence: input as number })] }),
      pack(),
    );
    assert.equal(out.diagnoses[0].confidence, expected, `confidence ${String(input)}`);
  }
});

test("diagnoses come back sorted by confidence and capped at four", () => {
  const out = validateAiResponse(
    respond({
      diagnoses: [0.2, 0.9, 0.5, 0.1, 0.7, 0.3].map((c) => diagnosis({ confidence: c, cause: `cause ${c}` })),
    }),
    pack(),
  );
  assert.equal(out.diagnoses.length, 4);
  assert.deepEqual(
    out.diagnoses.map((d) => d.confidence),
    [90, 70, 50, 30],
  );
});

test("steps are capped at eight and stepless entries are tolerated", () => {
  const steps = Array.from({ length: 12 }, (_, i) => ({ action: `step ${i + 1}` }));
  const out = validateAiResponse(respond({ diagnoses: [diagnosis({ steps })] }), pack());
  assert.equal(out.diagnoses[0].steps.length, 8);
  assert.equal(out.diagnoses[0].steps[7].action, "step 8");

  const none = validateAiResponse(respond({ diagnoses: [diagnosis({ steps: [] })] }), pack());
  assert.deepEqual(none.diagnoses[0].steps, []);
});

test("steps missing an action are dropped and optional fields normalise to undefined", () => {
  const out = validateAiResponse(
    respond({
      diagnoses: [
        diagnosis({
          steps: [
            { action: "" },
            { action: "Check the guide", expected: "", ifNot: "Escalate" },
          ] as RawResponse["diagnoses"][number]["steps"],
        }),
      ],
    }),
    pack(),
  );
  assert.deepEqual(out.diagnoses[0].steps, [{ action: "Check the guide", expected: undefined, ifNot: "Escalate" }]);
});

test("long free text is truncated to its storage limit", () => {
  const out = validateAiResponse(
    respond({
      diagnoses: [diagnosis({ cause: "c".repeat(500), escalateIf: "e".repeat(500) })],
      notes: "n".repeat(900),
    }),
    pack(),
  );
  assert.equal(out.diagnoses[0].cause.length, 300);
  assert.equal(out.diagnoses[0].escalateIf?.length, 300);
  assert.equal(out.notes?.length, 500);
});

test("absent escalateIf and notes normalise to null", () => {
  const out = validateAiResponse(respond(), pack());
  assert.equal(out.diagnoses[0].escalateIf, null);
  assert.equal(out.notes, null);
});

test("a response with no usable diagnoses still returns a well-formed result", () => {
  const out = validateAiResponse({ diagnoses: [], insufficientEvidence: true }, pack());
  assert.deepEqual(out, { diagnoses: [], insufficientEvidence: true, notes: null });
});

test("an empty evidence pack can verify nothing", () => {
  const empty: EvidencePack = { items: [], componentTags: new Set() };
  const out = validateAiResponse(respond({ diagnoses: [diagnosis({ componentTags: ["CB-12"] })] }), empty);
  assert.deepEqual(out.diagnoses, []);
});

// ── Conversational turn ──────────────────────────────────────────────────────

const chat = (over: Partial<RawChatTurn> = {}): RawChatTurn => ({
  reply: "Let us check the supply side first.",
  insufficientEvidence: false,
  ...over,
});

test("chat turn: invented evidence ids are stripped", () => {
  const turn = validateChatTurn(chat({ evidenceIds: ["D:chunk1", "D:chunk9", "G:g1"] }), pack());
  assert.deepEqual(
    turn.evidence?.map((e) => e.id),
    ["D:chunk1", "G:g1"],
  );
});

test("chat turn: unknown component tags are flagged unverified", () => {
  const turn = validateChatTurn(chat({ componentTags: ["CB-12", "QF-1"] }), pack());
  assert.deepEqual(turn.components, [
    { tag: "CB-12", verified: true },
    { tag: "QF-1", verified: false },
  ]);
});

test("chat turn: LOTO is injected from the hypothesis or the suggested checks", () => {
  const fromCause = validateChatTurn(chat({ likelyCause: "Tripped breaker on the drive panel" }), pack());
  assert.equal(fromCause.safety?.[0], STANDARD_LOTO);

  const fromStep = validateChatTurn(
    chat({ recommendedSteps: [{ action: "Check the motor terminal box for a loose wire" }] }),
    pack(),
  );
  assert.equal(fromStep.safety?.[0], STANDARD_LOTO);

  const mechanical = validateChatTurn(
    chat({ likelyCause: "Worn belt", recommendedSteps: [{ action: "Inspect the belt tension" }] }),
    pack(),
  );
  assert.deepEqual(mechanical.safety, []);
});

test("chat turn: recommended steps are capped at three so the reply stays workable", () => {
  const turn = validateChatTurn(
    chat({ recommendedSteps: Array.from({ length: 7 }, (_, i) => ({ action: `check ${i + 1}` })) }),
    pack(),
  );
  assert.equal(turn.steps?.length, 3);
  assert.equal(turn.steps?.[2].action, "check 3");
});

test("chat turn: confidence clamps to 0..100 but stays null when the model omits it", () => {
  assert.equal(validateChatTurn(chat(), pack()).confidence, null);
  assert.equal(validateChatTurn(chat({ confidence: 1.4 }), pack()).confidence, 100);
  assert.equal(validateChatTurn(chat({ confidence: -2 }), pack()).confidence, 0);
  assert.equal(validateChatTurn(chat({ confidence: 0 }), pack()).confidence, 0);
  assert.equal(validateChatTurn(chat({ confidence: 0.45 }), pack()).confidence, 45);
});

test("chat turn: flags coerce to booleans and the turn is always an assistant message", () => {
  const turn = validateChatTurn(chat({ resolved: undefined, insufficientEvidence: undefined }), pack());
  assert.equal(turn.role, "assistant");
  assert.equal(turn.resolved, false);
  assert.equal(turn.insufficientEvidence, false);
  assert.ok(!Number.isNaN(Date.parse(turn.ts)), "turn timestamp is not an ISO date");

  const resolvedTurn = validateChatTurn(chat({ resolved: true, likelyCause: "Blown fuse F2" }), pack());
  assert.equal(resolvedTurn.resolved, true);
  assert.equal(resolvedTurn.likelyCause, "Blown fuse F2");
});

test("chat turn: free text is truncated and blank optionals become null", () => {
  const turn = validateChatTurn(
    chat({ reply: "r".repeat(2500), likelyCause: "c".repeat(400), question: "q".repeat(400) }),
    pack(),
  );
  assert.equal(turn.text.length, 2000);
  assert.equal(turn.likelyCause?.length, 300);
  assert.equal(turn.question?.length, 300);

  const bare = validateChatTurn(chat({ reply: "" }), pack());
  assert.equal(bare.text, "");
  assert.equal(bare.likelyCause, null);
  assert.equal(bare.question, null);
});

test("chat turn: energy wording confined to the prose reply does not trigger LOTO", () => {
  // Only the working hypothesis and the actionable steps are scanned, the
  // conversational reply is not a procedure.
  const turn = validateChatTurn(chat({ reply: "The breaker panel is the usual suspect on this machine." }), pack());
  assert.deepEqual(turn.safety, []);
});
