// src/lib/hse/risk-matrix.ts
// Likelihood x severity, before and after controls. ISO 45001 6.1.2.
//
// The hazard analysis previously recorded residual risk as one of LOW, MEDIUM
// or HIGH, chosen from a dropdown with nothing behind it. That is an opinion
// with a label on it. What the standard asks for, and what an auditor reads, is
// a rating you can argue with: how likely, how bad, scored the same way every
// time, and scored TWICE so the controls can be shown to have done something.
//
// The second rating is the point. "This job is high risk" is a description.
// "This job is high risk and the controls bring it to low" is a safety case,
// and the gap between the two numbers is the only evidence that the control
// measures were worth writing down.

export const LIKELIHOOD = [
  { value: 1, label: "Rare", help: "Would require an unusual combination of failures" },
  { value: 2, label: "Unlikely", help: "Could happen, but not expected" },
  { value: 3, label: "Possible", help: "Has happened here or on similar work" },
  { value: 4, label: "Likely", help: "Expected to happen without controls" },
  { value: 5, label: "Almost certain", help: "Will happen if the work proceeds uncontrolled" },
] as const;

export const SEVERITY = [
  { value: 1, label: "Negligible", help: "No injury, or first aid on the spot" },
  { value: 2, label: "Minor", help: "Treated injury, back to work the same day" },
  { value: 3, label: "Moderate", help: "Lost-time injury, reportable" },
  { value: 4, label: "Major", help: "Serious injury, permanent effect" },
  { value: 5, label: "Catastrophic", help: "Fatality, or multiple serious injuries" },
] as const;

export type RiskBand = "LOW" | "MEDIUM" | "HIGH" | "EXTREME";

export type RiskRating = {
  likelihood: number;
  severity: number;
  score: number;
  band: RiskBand;
};

const inScale = (n: unknown): n is number =>
  typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 5;

export function riskBand(score: number): RiskBand {
  if (score >= 16) return "EXTREME";
  if (score >= 10) return "HIGH";
  if (score >= 5) return "MEDIUM";
  return "LOW";
}

export function rate(likelihood: unknown, severity: unknown): RiskRating | null {
  if (!inScale(likelihood) || !inScale(severity)) return null;
  const score = likelihood * severity;
  return { likelihood, severity, score, band: riskBand(score) };
}

export const BAND_LABEL: Record<RiskBand, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  EXTREME: "Extreme",
};

// The pill formula from UI-STANDARDS. Low is deliberately not green: a green
// badge on every row reads as decoration and stops carrying meaning.
export const BAND_TONE: Record<RiskBand, string> = {
  LOW: "bg-ink-500/10 text-ink-600 border-ink-500/20",
  MEDIUM: "bg-warn-500/10 text-warn-700 border-warn-500/20",
  HIGH: "bg-danger-500/10 text-danger-600 border-danger-500/20",
  EXTREME: "bg-danger-600 text-white border-danger-700",
};

export type StepRisk = {
  step?: string;
  hazards?: string;
  controls?: string;
  initial?: RiskRating | null;
  residual?: RiskRating | null;
};

// Work is not authorised on the strength of an analysis that still rates a step
// as extreme after its controls. That is the matrix having teeth: without a
// rule attached, scoring the risk changes nothing about what happens next.
export function blockingSteps(steps: StepRisk[]): string[] {
  return steps
    .filter((s) => s.residual?.band === "EXTREME")
    .map((s, i) => s.step?.trim() || `Step ${i + 1}`);
}

// A control that does not reduce the rating has not been shown to work. This is
// not blocking, because some hazards genuinely cannot be reduced further and
// the honest record says so, but it is the thing an auditor asks about and it
// should be visible while the analysis is being written rather than afterwards.
export function ineffectiveControls(steps: StepRisk[]): string[] {
  return steps
    .filter((s) => s.initial && s.residual && s.residual.score >= s.initial.score)
    .map((s, i) => s.step?.trim() || `Step ${i + 1}`);
}

// Old records were written before the matrix existed and carry a bare LOW /
// MEDIUM / HIGH string. They render as that band with no score, rather than
// being back-filled with invented numbers: a rating nobody made is not evidence.
export function bandFromLegacy(raw: unknown): RiskBand | null {
  const v = String(raw ?? "").trim().toUpperCase();
  return v === "LOW" || v === "MEDIUM" || v === "HIGH" || v === "EXTREME" ? v : null;
}
