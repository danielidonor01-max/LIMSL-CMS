// src/lib/signoff/chains.ts
// Configurable multi-level sign-off chains, grounded in the LIMSL Equipment
// Maintenance Procedure (Prepared → Reviewed → Approved, with QA/QC for ISO-9001
// records control and HSE for safety/LOTO/PTW verification).
//
// These are intentionally data-driven so the exact roles/steps can be tuned
// later without touching the sign-off engine.

import { canSignStep } from "@/lib/roles";

// `signer: "PERMIT_HOLDER"` binds the step to the one person the record names
// rather than to a role. The permit holder signs the permit issued to him, and
// no other technician can sign it in his place.
export type ChainStep = {
  role: string;
  roleLabel: string;
  required: boolean;
  signer?: "PERMIT_HOLDER" | "WMS_ORIGINATOR";
  // Controlled documents are signed twice (LIMSL, November 2026): once to
  // issue them for review and approval, then again to issue them for
  // implementation. The pass is what the revision history prints.
  pass?: "REVIEW" | "IMPLEMENTATION";
  // Exactly who may sign this step, with no seniority cover and no Super Admin
  // stand-in unless listed. The Maintenance Manager's and Factory Manager's
  // signatures on a controlled document are theirs alone: that is the SOP.
  signableBy?: string[];
};

// One controlled-document pass, built twice so the two cannot drift apart.
function twoPasses(steps: Omit<ChainStep, "pass" | "roleLabel">[], labels: string[]): ChainStep[] {
  const pass = (p: "REVIEW" | "IMPLEMENTATION", prefix: string) =>
    steps.map((st, i) => ({ ...st, pass: p, roleLabel: `${prefix}: ${labels[i]}` }));
  return [...pass("REVIEW", "Issue for review"), ...pass("IMPLEMENTATION", "Issue for implementation")];
}

// Preventive Maintenance checklist sign-off:
//   Technician performs → Foreman verifies → QA/QC checks records → Maintenance
//   Manager approves.
export const PM_CHAIN: ChainStep[] = [
  { role: "TECHNICIAN", roleLabel: "Performed by (Technician)", required: true },
  { role: "FOREMAN", roleLabel: "Verified by (Foreman)", required: true },
  { role: "QA_QC", roleLabel: "Records check (QA/QC)", required: true },
  { role: "MAINTENANCE_MANAGER", roleLabel: "Approved by (Maintenance Manager)", required: true },
];

// Corrective Maintenance close-out sign-off, three signatures (LIMSL, 17 Nov
// 2026; it was five plus an optional COO step, too heavy for a breakdown):
//   Technician repairs → Foreman verifies the machine runs → Maintenance
//   Manager approves the RCA and closes the record.
// Safety is already covered by the permit the job needed before work started
// (`correctiveSignBlocker` refuses the first signature without one), so HSE
// no longer signs the close-out. A chain nobody has signed yet is rebuilt to
// this one on next access; a chain with signatures keeps its old steps.
export const CM_CHAIN: ChainStep[] = [
  { role: "TECHNICIAN", roleLabel: "Repaired by (Technician)", required: true },
  { role: "FOREMAN", roleLabel: "Verified by (Foreman)", required: true },
  { role: "MAINTENANCE_MANAGER", roleLabel: "RCA approved and closed (Maintenance Manager)", required: true },
];

// Work Method Statement authorisation — three action parties, matching the
// Prepared / Reviewed / Approved columns on the LIMSL paper WMS:
//   Originator (Foreman, or a Super Admin) → Maintenance Manager →
//   Factory Manager, signed twice: issue for review, then issue for
//   implementation. Only the second pass approves the statement.
// HSE and QA/QC are not signatories on the method statement. HSE's safety
// review happens on the JHA written against the approved WMS.
//
// There is no separate Factory Supervisor or Factory Coordinator role in the
// system: the review step is held by MAINTENANCE_MANAGER and the approval
// step by FACTORY_MANAGER, whose accounts those people sign under.
export const WMS_CHAIN: ChainStep[] = twoPasses(
  [
    { role: "FOREMAN", required: true, signableBy: ["FOREMAN", "SUPER_ADMIN"] },
    { role: "MAINTENANCE_MANAGER", required: true, signableBy: ["MAINTENANCE_MANAGER"] },
    { role: "FACTORY_MANAGER", required: true, signableBy: ["FACTORY_MANAGER"] },
  ],
  ["Prepared by (Originator)", "Reviewed by (Maintenance Manager)", "Approved by (Factory Manager)"],
);

// Equipment Maintenance Procedure revision control:
//   QA/QC authorises the change (document control) → Maintenance Manager →
//   Factory Manager → COO sign off before the revision becomes effective.
export const PROCEDURE_CHAIN: ChainStep[] = twoPasses(
  [
    { role: "QA_QC", required: true },
    { role: "MAINTENANCE_MANAGER", required: true, signableBy: ["MAINTENANCE_MANAGER"] },
    { role: "FACTORY_MANAGER", required: true, signableBy: ["FACTORY_MANAGER"] },
    { role: "COO", required: true },
  ],
  [
    "Authorised by (QA/QC, document control)",
    "Signed off (Maintenance Manager)",
    "Signed off (Factory Manager)",
    "Approved (COO)",
  ],
);

// Permit-to-Work authorisation, matching the signature blocks on the printed
// LIMSL permit. The four blocks below are the ones signed on paper.
//
// The Permit Applicant is HSE (LIMSL, 17 Nov 2026; it was the Foreman). HSE
// raises the permit, and raising it signs the applicant block in the same act
// (api/permits POST), so nobody is asked to sign their own application twice.
// Permits raised before this keep the Foreman on that block; a stored step is
// read by its own role when it no longer matches this chain.
//
// The asset holder is the Maintenance Manager or the Factory Manager (LIMSL,
// 16 Nov 2026), so both asset-holder blocks name them as signatories, not as a
// senior covering. The site supervisor block is also open to the foreman, as
// on paper. The engine refuses to let one person sign two steps of the same
// chain; with HSE applying, the Foreman is free for the site supervisor block
// and the Maintenance or Factory Manager takes the asset holder block.
const ASSET_HOLDERS = ["MAINTENANCE_MANAGER", "FACTORY_MANAGER", "SUPER_ADMIN"];
export const PTW_CHAIN: ChainStep[] = [
  { role: "HSE", roleLabel: "Permit Applicant (PA)", required: true, signableBy: ["HSE", "SUPER_ADMIN"] },
  {
    role: "MAINTENANCE_MANAGER",
    roleLabel: "Asset Holder Supervisor (AHS)",
    required: true,
    signableBy: ASSET_HOLDERS,
  },
  {
    role: "FOREMAN",
    roleLabel: "Asset Holder Site Supervisor (AHSS)",
    required: true,
    signableBy: ["FOREMAN", ...ASSET_HOLDERS],
  },
  {
    role: "TECHNICIAN",
    roleLabel: "Permit Holder (PH)",
    required: true,
    signer: "PERMIT_HOLDER",
  },
  { role: "TECHNICIAN", roleLabel: "Affected Custodian (AC)", required: false },
];

// Job Hazard Analysis approval, in the same two passes as the WMS. HSE
// prepares it from an approved Work Method Statement; the Foreman who
// originated that WMS confirms the job is described as it will actually be
// done (the step is bound to him, not to any foreman); the Factory Manager
// approves. No permit may be raised against a JHA that has not finished this.
export const JHA_CHAIN: ChainStep[] = twoPasses(
  [
    { role: "HSE", required: true, signableBy: ["HSE", "SUPER_ADMIN"] },
    { role: "FOREMAN", required: true, signer: "WMS_ORIGINATOR" },
    { role: "FACTORY_MANAGER", required: true, signableBy: ["FACTORY_MANAGER"] },
  ],
  ["Prepared by (HSE Supervisor)", "Reviewed by (Foreman, originator of the WMS)", "Approved by (Factory Manager)"],
);

// Management authorising commencement. This is what a work order IS at LIMSL,
// and until now it was implied by the work order merely existing.
export const WORK_ORDER_CHAIN: ChainStep[] = [
  { role: "FOREMAN", roleLabel: "Raised by (Foreman)", required: true },
  { role: "MAINTENANCE_MANAGER", roleLabel: "Approved to commence (Maintenance Manager)", required: true },
];

// A PM batch is one work order (LIMSL, 16 Nov 2026). The machines in it are
// serviced together under one method statement, one hazard analysis and one
// permit, so management authorises them together too: one approval for the
// batch, not one per machine. The same two people as any work order.
export const PM_BATCH_CHAIN: ChainStep[] = WORK_ORDER_CHAIN.map((s) => ({ ...s }));

// Permit-to-Work close-out. Raised once the permit is ACTIVE and the job is done:
// the work party confirms the area is clear, then HSE confirms the isolation is
// removed and the equipment is safe to re-energise. A permit cannot reach CLOSED
// without both.
export const PTW_CLOSEOUT_CHAIN: ChainStep[] = [
  { role: "FOREMAN", roleLabel: "Work complete, area clear (Foreman)", required: true },
  { role: "HSE", roleLabel: "Isolation removed, safe to re-energise (HSE)", required: true },
];

// Non-conformity / CAPA close-out (ISO 9001 10.2.2, ISO 45001 10.2).
// An NC used to close on a single status change, less rigour than a machine
// breakdown, which demands five signatures. The clause requires evidence of the
// action taken AND of its effectiveness, reviewed by someone other than the
// person who performed it.
// Each step is a DIFFERENT role: one person per role is the norm in a shop this
// size, and segregation of duties forbids the same person signing twice, a
// chain that named one role twice could never be completed here.
export const NC_CHAIN: ChainStep[] = [
  { role: "QA_QC", roleLabel: "Investigation & root cause (QA/QC)", required: true },
  { role: "MAINTENANCE_MANAGER", roleLabel: "Corrective action approved (Maintenance Manager)", required: true },
  { role: "FACTORY_MANAGER", roleLabel: "Effectiveness verified & closed (Factory Manager)", required: true },
];

// Safety incidents are investigated by HSE, not quality, and the Factory
// Manager owns the close-out because incidents carry legal weight.
export const SAFETY_INCIDENT_CHAIN: ChainStep[] = [
  { role: "HSE", roleLabel: "Investigation & root cause (HSE)", required: true },
  { role: "MAINTENANCE_MANAGER", roleLabel: "Controls implemented (Maintenance Manager)", required: true },
  { role: "FACTORY_MANAGER", roleLabel: "Close-out approved (Factory Manager)", required: true },
];

// A change to an asset category — its name, or the interval every machine in
// it is serviced on. The Maintenance Manager reviews it as the owner of the
// maintenance regime; QA/QC approve it as document control, the same order
// as the method statement. Nothing on the register or the plan moves until
// both have signed.
export const ASSET_CATEGORY_CHAIN: ChainStep[] = [
  { role: "MAINTENANCE_MANAGER", roleLabel: "Reviewed by (Maintenance Manager)", required: true },
  { role: "QA_QC", roleLabel: "Approved by (QA/QC Supervisor)", required: true },
];

export const CHAINS: Record<string, ChainStep[]> = {
  ASSET_CATEGORY: ASSET_CATEGORY_CHAIN,
  NON_CONFORMITY: NC_CHAIN,
  SAFETY_INCIDENT: SAFETY_INCIDENT_CHAIN,
  PM_CHECKLIST: PM_CHAIN,
  CORRECTIVE: CM_CHAIN,
  WMS: WMS_CHAIN,
  JHA: JHA_CHAIN,
  WORK_ORDER: WORK_ORDER_CHAIN,
  PM_BATCH: PM_BATCH_CHAIN,
  PROCEDURE: PROCEDURE_CHAIN,
  PERMIT: PTW_CHAIN,
  PERMIT_CLOSEOUT: PTW_CLOSEOUT_CHAIN,
};

export function chainFor(entityType: string): ChainStep[] {
  return CHAINS[entityType] ?? [];
}

// ── Pure helpers (safe on client & server) ────────────────────────────────────
type StepState = { stepOrder: number; required: boolean | null; status: string };

// A step is signable only when every earlier REQUIRED step is already signed.
export function isStepUnlocked(chain: StepState[], stepOrder: number): boolean {
  return chain
    .filter((s) => s.stepOrder < stepOrder && s.required)
    .every((s) => s.status === "SIGNED");
}

export function chainSummary(chain: { required: boolean | null; status: string }[]) {
  const requiredSteps = chain.filter((s) => s.required);
  const signed = requiredSteps.filter((s) => s.status === "SIGNED").length;
  const complete = requiredSteps.length > 0 && signed === requiredSteps.length;
  return { total: requiredSteps.length, signed, complete };
}

// The definition behind a stored step. Rows carry their role and label but not
// the rules, so the rules are read back from the chain by position, and only
// trusted while the row still matches it (an older chain keeps the old rules).
export function stepRule(entityType: string, step: { stepOrder: number; role: string }): ChainStep | undefined {
  const rule = chainFor(entityType)[step.stepOrder - 1];
  return rule && rule.role === step.role ? rule : undefined;
}

export function passOf(entityType: string, step: { stepOrder: number; role: string }) {
  return stepRule(entityType, step)?.pass ?? null;
}

// Whether someone in `userRole` may sign this step. A step that lists who signs
// it means exactly that list; every other step keeps the general rule (own
// role, a Super Admin, or a strictly more senior role in the chain).
export function canSignChainStep(
  userRole: string | null | undefined,
  entityType: string,
  step: { stepOrder: number; role: string },
): boolean {
  const rule = stepRule(entityType, step);
  if (rule?.signableBy) return !!userRole && rule.signableBy.includes(userRole);
  return canSignStep(userRole, step.role);
}

// A signature is an override when it comes from outside the step's own role,
// unless the step names that role as one of its signatories: a Super Admin
// originating a WMS is the SOP, not an exception to it.
export function isOverrideSignature(
  userRole: string | null | undefined,
  entityType: string,
  step: { stepOrder: number; role: string },
): boolean {
  if (userRole === step.role) return false;
  const rule = stepRule(entityType, step);
  return !(rule?.signableBy && userRole && rule.signableBy.includes(userRole));
}

// The signature a chain is waiting on: the earliest required step still
// pending, provided everything before it is signed. A returned chain is
// waiting on rework, not on a signer, so it has none.
export function nextPendingStep<T extends StepState>(chain: T[]): T | null {
  if (chain.some((s) => s.status === "REJECTED")) return null;
  const next = [...chain]
    .filter((s) => s.required && s.status === "PENDING")
    .sort((a, b) => a.stepOrder - b.stepOrder)[0];
  return next && isStepUnlocked(chain, next.stepOrder) ? next : null;
}

// Who a pending step is waiting on, addressed the way notify() takes it. A
// step bound to a person is that person and nobody else: the JHA waits on the
// Foreman who wrote the WMS, not on every Foreman. A step that names its
// signatories waits on those roles, less the Super Admin, who can cover an
// originator's step but is not who the step is for.
export function stepAudience(
  entityType: string,
  step: { stepOrder: number; role: string; signerUserId?: string | null },
): { userIds?: string[]; roles?: string[] } {
  if (step.signerUserId) return { userIds: [step.signerUserId] };
  const named = stepRule(entityType, step)?.signableBy?.filter((r) => r !== "SUPER_ADMIN");
  return { roles: named?.length ? named : [step.role] };
}
