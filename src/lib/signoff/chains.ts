// src/lib/signoff/chains.ts
// Configurable multi-level sign-off chains, grounded in the LIMSL Equipment
// Maintenance Procedure (Prepared → Reviewed → Approved, with QA/QC for ISO-9001
// records control and HSE for safety/LOTO/PTW verification).
//
// These are intentionally data-driven so the exact roles/steps can be tuned
// later without touching the sign-off engine.

// `signer: "PERMIT_HOLDER"` binds the step to the one person the record names
// rather than to a role. The permit holder signs the permit issued to him, and
// no other technician can sign it in his place.
export type ChainStep = {
  role: string;
  roleLabel: string;
  required: boolean;
  signer?: "PERMIT_HOLDER";
};

// Preventive Maintenance checklist sign-off:
//   Technician performs → Foreman verifies → QA/QC checks records → Maintenance
//   Manager approves.
export const PM_CHAIN: ChainStep[] = [
  { role: "TECHNICIAN", roleLabel: "Performed by (Technician)", required: true },
  { role: "FOREMAN", roleLabel: "Verified by (Foreman)", required: true },
  { role: "QA_QC", roleLabel: "Records check (QA/QC)", required: true },
  { role: "MAINTENANCE_MANAGER", roleLabel: "Approved by (Maintenance Manager)", required: true },
];

// Corrective Maintenance close-out sign-off (higher authority, RCA + safety):
//   Technician repairs → Foreman verifies → HSE safety sign-off → Maintenance
//   Manager approves RCA/CA → Factory Manager close-out. COO for critical cases.
export const CM_CHAIN: ChainStep[] = [
  { role: "TECHNICIAN", roleLabel: "Repaired by (Technician)", required: true },
  { role: "FOREMAN", roleLabel: "Verified by (Foreman)", required: true },
  { role: "HSE", roleLabel: "Safety sign-off (HSE)", required: true },
  { role: "MAINTENANCE_MANAGER", roleLabel: "RCA & action approved (Maintenance Manager)", required: true },
  { role: "FACTORY_MANAGER", roleLabel: "Close-out (Factory Manager)", required: true },
  { role: "COO", roleLabel: "Executive approval (COO), critical only", required: false },
];

// Work Method Statement authorisation:
//   Prepared (Foreman) → Reviewed (Maintenance Manager) → HSE safety sign-off →
//   Factory Manager final approval. HSE signs, then it pushes to the Factory
//   Manager for the final sign-off.
export const WMS_CHAIN: ChainStep[] = [
  { role: "FOREMAN", roleLabel: "Prepared by (Foreman)", required: true },
  { role: "MAINTENANCE_MANAGER", roleLabel: "Reviewed by (Maintenance Manager)", required: true },
  { role: "HSE", roleLabel: "Safety sign-off (HSE)", required: true },
  { role: "FACTORY_MANAGER", roleLabel: "Final approval (Factory Manager)", required: true },
];

// Equipment Maintenance Procedure revision control:
//   QA/QC authorises the change (document control) → Maintenance Manager →
//   Factory Manager → COO sign off before the revision becomes effective.
export const PROCEDURE_CHAIN: ChainStep[] = [
  { role: "QA_QC", roleLabel: "Authorised by (QA/QC, document control)", required: true },
  { role: "MAINTENANCE_MANAGER", roleLabel: "Signed off (Maintenance Manager)", required: true },
  { role: "FACTORY_MANAGER", roleLabel: "Signed off (Factory Manager)", required: true },
  { role: "COO", roleLabel: "Approved (COO)", required: true },
];

// Permit-to-Work authorisation, matching the signature blocks on the printed
// LIMSL permit. HSE issues the permit, so HSE does not appear as a step: raising
// it IS the HSE act. The four blocks below are the ones signed on paper.
//
// PA and AHSS are both Foreman-level and that is deliberate, not a duplication
// error: on the paper permit they are two different people, the foreman who
// applied for the permit and the foreman supervising the site. The sign-off
// engine already refuses to let one person sign two steps of the same chain, so
// this reads on screen exactly as it reads on paper. (With only one Foreman
// account in the system the AHSS step will need a senior to cover it.)
export const PTW_CHAIN: ChainStep[] = [
  { role: "FOREMAN", roleLabel: "Permit Applicant (PA)", required: true },
  { role: "MAINTENANCE_MANAGER", roleLabel: "Asset Holder Supervisor (AHS)", required: true },
  { role: "FOREMAN", roleLabel: "Asset Holder Site Supervisor (AHSS)", required: true },
  {
    role: "TECHNICIAN",
    roleLabel: "Permit Holder (PH)",
    required: true,
    signer: "PERMIT_HOLDER",
  },
  { role: "TECHNICIAN", roleLabel: "Affected Custodian (AC)", required: false },
];

// Job Hazard Analysis approval. HSE prepares it from an approved Work Method
// Statement; the Maintenance Manager confirms the job is described as it will
// actually be done, and the Factory Manager approves it. No permit may be raised
// against a JHA that has not finished this.
export const JHA_CHAIN: ChainStep[] = [
  { role: "HSE", roleLabel: "Prepared by (HSE)", required: true },
  { role: "MAINTENANCE_MANAGER", roleLabel: "Reviewed by (Maintenance Manager)", required: true },
  { role: "FACTORY_MANAGER", roleLabel: "Approved by (Factory Manager)", required: true },
];

// Management authorising commencement. This is what a work order IS at LIMSL,
// and until now it was implied by the work order merely existing.
export const WORK_ORDER_CHAIN: ChainStep[] = [
  { role: "FOREMAN", roleLabel: "Raised by (Foreman)", required: true },
  { role: "MAINTENANCE_MANAGER", roleLabel: "Approved to commence (Maintenance Manager)", required: true },
];

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

export const CHAINS: Record<string, ChainStep[]> = {
  NON_CONFORMITY: NC_CHAIN,
  SAFETY_INCIDENT: SAFETY_INCIDENT_CHAIN,
  PM_CHECKLIST: PM_CHAIN,
  CORRECTIVE: CM_CHAIN,
  WMS: WMS_CHAIN,
  JHA: JHA_CHAIN,
  WORK_ORDER: WORK_ORDER_CHAIN,
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
