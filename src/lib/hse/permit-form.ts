// src/lib/hse/permit-form.ts
// The LIMSL Permit to Work, as printed. Every list here is transcribed from the
// paper form (see PTW 4207) rather than invented, because the printed permit and
// the record in this system have to be the same document. If a line moves on the
// paper form it moves here, and nowhere else.

export type PermitWorkType =
  | "COLD_WORK"
  | "HOT_WORK"
  | "CONFINED_SPACE"
  | "EXCAVATION"
  | "ENERGIZED_SYSTEM";

export const PERMIT_WORK_TYPES: { value: PermitWorkType; label: string }[] = [
  { value: "COLD_WORK", label: "Cold Work" },
  { value: "HOT_WORK", label: "Hot Work" },
  { value: "CONFINED_SPACE", label: "Confined Space" },
  { value: "EXCAVATION", label: "Excavation" },
  { value: "ENERGIZED_SYSTEM", label: "Energized System" },
];

export const ZONE_CLASSIFICATIONS = ["Non-Hazardous", "Hazardous"] as const;

// Ticked, crossed, or untouched. The paper form is marked with a tick or an X,
// and the difference matters: an X is a decision that the control is not needed,
// a blank is nobody having considered it. Collapsing the two into a checkbox
// would turn "not applicable" and "not thought about" into the same record.
export type TriState = "YES" | "NO" | "NA";

export const REQUIRED_DOCUMENTS = [
  { key: "JHA", label: "Job Hazard Analysis (JHA) specific to Job" },
  { key: "GAS_TEST", label: "Gas Testing Form" },
  { key: "WMS", label: "Work Method Statement" },
  { key: "TOOL_LIST", label: "List of Equipments/Tool/Materials to be used" },
] as const;

export const WORK_AREA_PRECAUTIONS = [
  { key: "CLEAR_AREA", label: "Clear Work Surrounding Area" },
  { key: "SHIELD_ADJACENT", label: "Shield Adjacent Area" },
  { key: "WET_DOWN", label: "Wet Down Surrounding" },
  { key: "ILLUMINATION", label: "Proper Illumination" },
  { key: "VENTILATION", label: "Provide Ventilation" },
  { key: "DEMARCATION", label: "Temporary Demarcation" },
  { key: "WARNING_SIGNS", label: "Warning Signs/Notice" },
  { key: "SCAFFOLD", label: "Scaffold Platform" },
  { key: "ROAD_CLOSURE", label: "Temporary Road Closure" },
  { key: "SPADE_LOTO", label: "Spade/Blind/lock out/Tag Out" },
  { key: "TOOLBOX_TALK", label: "Toolbox Talk" },
  { key: "FIRE_WATCH", label: "Fire Extinguisher/Fire Watch" },
  { key: "GAS_TEST_PRIOR", label: "Gas Testing prior to work" },
  { key: "DE_ENERGIZING", label: "De-Energizing/Isolation" },
] as const;

export const PPE_REQUIREMENTS = [
  { key: "HELMET", label: "Safety Helmet" },
  { key: "SAFETY_SHOE", label: "Safety Shoe/boot" },
  { key: "SWIM_VEST", label: "Swimming Certificate/Vest" },
  { key: "GOGGLES", label: "Safety Goggles" },
  { key: "FACE_VISOR", label: "Full face visor" },
  { key: "APRON", label: "Protective Apron" },
  { key: "DUST_MASK", label: "Dust Mask" },
  { key: "HEARING", label: "Hearing Protection" },
  { key: "GLOVES", label: "Rubber/Cotton Gloves" },
  { key: "RUBBER_BOOT", label: "Rubber Boot" },
  { key: "HARNESS", label: "Safety Harness" },
  { key: "FR_COVERALL", label: "Fire retardant Coverall" },
  { key: "COMMS", label: "Communication Device" },
] as const;

export type ChecklistMarks = Record<string, TriState>;

// Controls that stop the specific killer the work type invites. Ticking "hot
// work" and leaving fire watch blank is the permit failing at the only thing it
// exists to do, so these are refused at issue rather than noted afterwards.
const MANDATORY_BY_WORK_TYPE: Record<PermitWorkType, { key: string; label: string }[]> = {
  HOT_WORK: [
    { key: "FIRE_WATCH", label: "Fire Extinguisher/Fire Watch" },
    { key: "CLEAR_AREA", label: "Clear Work Surrounding Area" },
  ],
  CONFINED_SPACE: [
    { key: "GAS_TEST_PRIOR", label: "Gas Testing prior to work" },
    { key: "VENTILATION", label: "Provide Ventilation" },
  ],
  ENERGIZED_SYSTEM: [{ key: "DE_ENERGIZING", label: "De-Energizing/Isolation" }],
  EXCAVATION: [{ key: "DEMARCATION", label: "Temporary Demarcation" }],
  COLD_WORK: [],
};

export function mandatoryPrecautionsFor(workTypes: string[]): { key: string; label: string }[] {
  const out = new Map<string, { key: string; label: string }>();
  for (const t of workTypes) {
    for (const req of MANDATORY_BY_WORK_TYPE[t as PermitWorkType] ?? []) out.set(req.key, req);
  }
  return [...out.values()];
}

export function missingMandatoryPrecautions(
  workTypes: string[],
  marks: ChecklistMarks | null | undefined,
): string[] {
  const m = marks ?? {};
  return mandatoryPrecautionsFor(workTypes)
    .filter((req) => m[req.key] !== "YES")
    .map((req) => req.label);
}

// Every PPE item ticked on the permit, in printed order, for the permit face and
// for the toolbox talk. Order is the paper order so the two can be read together.
export function selectedPpe(marks: ChecklistMarks | null | undefined): string[] {
  const m = marks ?? {};
  return PPE_REQUIREMENTS.filter((p) => m[p.key] === "YES").map((p) => p.label);
}

export function isChecklistComplete(
  items: readonly { key: string }[],
  marks: ChecklistMarks | null | undefined,
): boolean {
  const m = marks ?? {};
  return items.every((i) => m[i.key] === "YES" || m[i.key] === "NO" || m[i.key] === "NA");
}

export function unmarkedItems(
  items: readonly { key: string; label: string }[],
  marks: ChecklistMarks | null | undefined,
): string[] {
  const m = marks ?? {};
  return items.filter((i) => !m[i.key]).map((i) => i.label);
}

// A permit that names no work type authorises nothing in particular, which is
// how a cold-work permit ends up covering grinding.
export function validateWorkTypes(workTypes: unknown): { ok: true; workTypes: PermitWorkType[] } | { ok: false; error: string } {
  const raw = Array.isArray(workTypes) ? workTypes : [];
  const valid = raw.filter((t): t is PermitWorkType =>
    PERMIT_WORK_TYPES.some((w) => w.value === t),
  );
  if (valid.length === 0) {
    return { ok: false, error: "Select at least one type of work (cold work, hot work, confined space, excavation or energized system)." };
  }
  return { ok: true, workTypes: [...new Set(valid)] };
}
