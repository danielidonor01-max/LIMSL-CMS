// src/lib/signoff/chains.ts
// Configurable multi-level sign-off chains, grounded in the LIMSL Equipment
// Maintenance Procedure (Prepared → Reviewed → Approved, with QA/QC for ISO-9001
// records control and HSE for safety/LOTO/PTW verification).
//
// These are intentionally data-driven so the exact roles/steps can be tuned
// later without touching the sign-off engine.

export type ChainStep = { role: string; roleLabel: string; required: boolean };

// Preventive Maintenance checklist sign-off:
//   Technician performs → Foreman verifies → QA/QC checks records → Maintenance
//   Manager approves.
export const PM_CHAIN: ChainStep[] = [
  { role: "TECHNICIAN", roleLabel: "Performed by (Technician)", required: true },
  { role: "FOREMAN", roleLabel: "Verified by (Foreman)", required: true },
  { role: "QA_QC", roleLabel: "Records check (QA/QC)", required: true },
  { role: "MAINTENANCE_MANAGER", roleLabel: "Approved by (Maintenance Manager)", required: true },
];

// Corrective Maintenance close-out sign-off (higher authority — RCA + safety):
//   Technician repairs → Foreman verifies → HSE safety sign-off → Maintenance
//   Manager approves RCA/CA → Factory Manager close-out. COO for critical cases.
export const CM_CHAIN: ChainStep[] = [
  { role: "TECHNICIAN", roleLabel: "Repaired by (Technician)", required: true },
  { role: "FOREMAN", roleLabel: "Verified by (Foreman)", required: true },
  { role: "HSE", roleLabel: "Safety sign-off (HSE)", required: true },
  { role: "MAINTENANCE_MANAGER", roleLabel: "RCA & action approved (Maintenance Manager)", required: true },
  { role: "FACTORY_MANAGER", roleLabel: "Close-out (Factory Manager)", required: true },
  { role: "COO", roleLabel: "Executive approval (COO) — critical only", required: false },
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
  { role: "QA_QC", roleLabel: "Authorised by (QA/QC — document control)", required: true },
  { role: "MAINTENANCE_MANAGER", roleLabel: "Signed off (Maintenance Manager)", required: true },
  { role: "FACTORY_MANAGER", roleLabel: "Signed off (Factory Manager)", required: true },
  { role: "COO", roleLabel: "Approved (COO)", required: true },
];

export const CHAINS: Record<string, ChainStep[]> = {
  PM_CHECKLIST: PM_CHAIN,
  CORRECTIVE: CM_CHAIN,
  WMS: WMS_CHAIN,
  PROCEDURE: PROCEDURE_CHAIN,
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
