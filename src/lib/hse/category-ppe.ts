// src/lib/hse/category-ppe.ts
// The PPE a machine type calls for, as a default.
//
// The scan passport needs to answer "what do I put on before I touch this" to
// somebody who has not logged in and may not have read the permit. That answer
// has to come from the same vocabulary as everything else: the permit face, the
// hazard analysis and the printed sheet all name PPE from PPE_REQUIREMENTS, and
// a second list written in slightly different words is how "Safety Goggles" and
// "Safety Glasses" end up meaning the same thing on two documents about the
// same job.
//
// So this maps a category to KEYS, and the labels come from the one place that
// owns them. A key that does not exist fails a test rather than rendering a
// blank line on a safety notice.
//
// This is a DEFAULT, not an authority. The permit for a specific job is the
// authority, and the passport says so.

import { PPE_REQUIREMENTS } from "./permit-form";

export const PPE_BY_CATEGORY: Record<string, string[]> = {
  CNC_HEAVY: ["HELMET", "FACE_VISOR", "SAFETY_SHOE", "HEARING"],
  CNC_LIGHT: ["GOGGLES", "SAFETY_SHOE", "HEARING"],
  WELDING: ["FACE_VISOR", "GLOVES", "FR_COVERALL", "SAFETY_SHOE", "DUST_MASK"],
  CRANE: ["HELMET", "SAFETY_SHOE", "GLOVES", "COMMS"],
  PRESS_ROLL_SHEAR: ["HELMET", "GLOVES", "SAFETY_SHOE", "GOGGLES"],
  COMPRESSOR: ["HEARING", "GOGGLES", "SAFETY_SHOE"],
  ELECTRICAL_PANEL: ["GLOVES", "FACE_VISOR", "SAFETY_SHOE"],
  EARTHING: ["GLOVES", "SAFETY_SHOE"],
  FACILITY_AC: ["GOGGLES", "SAFETY_SHOE", "GLOVES"],
  MEASURING: ["SAFETY_SHOE"],
};

// What anybody entering the workshop wears regardless of what they came to do.
const BASELINE = ["HELMET", "SAFETY_SHOE", "GOGGLES"];

const LABEL = new Map<string, string>(PPE_REQUIREMENTS.map((p) => [p.key, p.label]));

/**
 * The PPE labels for a machine category, in the order the canonical list
 * declares them so two machines never present the same set differently.
 */
export function ppeForCategory(category: string | null | undefined): string[] {
  const keys = PPE_BY_CATEGORY[String(category ?? "").toUpperCase()] ?? BASELINE;
  return PPE_REQUIREMENTS.filter((p) => keys.includes(p.key)).map((p) => String(p.label));
}

export const ppeKeysAreKnown = (): string[] =>
  [...new Set([...Object.values(PPE_BY_CATEGORY).flat(), ...BASELINE])].filter((k) => !LABEL.has(k));
