// src/lib/maintenance/failure-codes.ts
// A deliberately small failure taxonomy, in the spirit of ISO 14224 but sized
// for a 33-machine fabrication shop rather than an offshore platform.
//
// Before this, every failure was one of eight fault types recorded against a
// machine. That cannot answer the questions maintenance actually asks: how many
// spindle-bearing failures across the CNC fleet this year? Is the same contactor
// welding shut on three welding sets? Was this found by a PM or by a breakdown?
// Free-text root cause can't aggregate; coded modes can.
//
// Keep this list SHORT. A taxonomy nobody can pick from accurately is worse than
// none, every added code costs accuracy at the point of entry.

export type FailureModeCode = {
  code: string;
  label: string;
  // Which fault types this mode plausibly belongs to, so the picker can narrow
  // itself instead of showing all thirty options every time.
  faultTypes: string[];
};

export const FAILURE_MODES: FailureModeCode[] = [
  // Mechanical
  { code: "BEARING_FAILURE", label: "Bearing failure / seizure", faultTypes: ["MECHANICAL"] },
  { code: "WEAR", label: "Wear beyond limit", faultTypes: ["MECHANICAL", "STRUCTURAL"] },
  { code: "MISALIGNMENT", label: "Misalignment", faultTypes: ["MECHANICAL"] },
  { code: "LOOSENESS", label: "Looseness / fastener failure", faultTypes: ["MECHANICAL", "STRUCTURAL"] },
  { code: "FRACTURE", label: "Fracture / crack", faultTypes: ["MECHANICAL", "STRUCTURAL"] },
  { code: "DEFORMATION", label: "Deformation / bending", faultTypes: ["MECHANICAL", "STRUCTURAL"] },
  { code: "VIBRATION", label: "Excessive vibration / noise", faultTypes: ["MECHANICAL"] },
  { code: "BLOCKAGE", label: "Blockage / restriction", faultTypes: ["MECHANICAL", "HYDRAULIC", "PNEUMATIC"] },
  { code: "LUBRICATION_FAILURE", label: "Lubrication failure / starvation", faultTypes: ["MECHANICAL"] },
  { code: "BELT_CHAIN_FAILURE", label: "Belt / chain / coupling failure", faultTypes: ["MECHANICAL"] },

  // Fluid power
  { code: "LEAK_EXTERNAL", label: "External leak", faultTypes: ["HYDRAULIC", "PNEUMATIC"] },
  { code: "LEAK_INTERNAL", label: "Internal leak / bypass", faultTypes: ["HYDRAULIC", "PNEUMATIC"] },
  { code: "PRESSURE_LOSS", label: "Loss of pressure / flow", faultTypes: ["HYDRAULIC", "PNEUMATIC"] },
  { code: "CONTAMINATION", label: "Fluid contamination", faultTypes: ["HYDRAULIC", "PNEUMATIC"] },
  { code: "SEAL_FAILURE", label: "Seal / gasket failure", faultTypes: ["HYDRAULIC", "PNEUMATIC", "MECHANICAL"] },
  { code: "VALVE_FAILURE", label: "Valve fails to operate", faultTypes: ["HYDRAULIC", "PNEUMATIC"] },

  // Electrical
  { code: "OPEN_CIRCUIT", label: "Open circuit / broken conductor", faultTypes: ["ELECTRICAL"] },
  { code: "SHORT_CIRCUIT", label: "Short circuit / earth fault", faultTypes: ["ELECTRICAL"] },
  { code: "CONTACT_FAILURE", label: "Contactor / relay contact failure", faultTypes: ["ELECTRICAL"] },
  { code: "INSULATION_FAILURE", label: "Insulation breakdown", faultTypes: ["ELECTRICAL"] },
  { code: "OVERHEAT", label: "Overheating / thermal trip", faultTypes: ["ELECTRICAL", "MECHANICAL"] },
  { code: "MOTOR_FAILURE", label: "Motor failure", faultTypes: ["ELECTRICAL", "MECHANICAL"] },
  { code: "POWER_SUPPLY", label: "Supply loss / voltage fault", faultTypes: ["ELECTRICAL"] },
  { code: "CONNECTION_LOOSE", label: "Loose / corroded termination", faultTypes: ["ELECTRICAL"] },

  // Control & instrumentation
  { code: "SENSOR_FAULT", label: "Sensor / switch fault", faultTypes: ["CONTROL", "ELECTRICAL"] },
  { code: "PLC_HMI_FAULT", label: "PLC / HMI / communication fault", faultTypes: ["CONTROL"] },
  { code: "SOFTWARE_PARAMETER", label: "Software or parameter fault", faultTypes: ["CONTROL"] },
  { code: "CALIBRATION_DRIFT", label: "Out of calibration / drift", faultTypes: ["CONTROL", "SAFETY"] },

  // Safety & other
  { code: "SAFETY_DEVICE_FAILURE", label: "Safety device failed to function", faultTypes: ["SAFETY", "CONTROL"] },
  { code: "OPERATOR_DAMAGE", label: "Operational damage / misuse", faultTypes: ["MECHANICAL", "STRUCTURAL", "SAFETY"] },
  { code: "CONSUMABLE_EXPIRED", label: "Consumable exhausted", faultTypes: ["MECHANICAL", "ELECTRICAL", "UNKNOWN"] },
  { code: "UNKNOWN", label: "Not determined", faultTypes: ["UNKNOWN", "MECHANICAL", "ELECTRICAL", "HYDRAULIC", "PNEUMATIC", "CONTROL", "STRUCTURAL", "SAFETY"] },
];

// How the failure came to light. This is what tells you whether the PM
// programme is earning its keep: a fleet where most failures are found by
// BREAKDOWN is running to failure regardless of what the plan says.
export const DETECTION_METHODS: { code: string; label: string }[] = [
  { code: "OPERATOR", label: "Reported by operator" },
  { code: "PM_INSPECTION", label: "Found during PM / inspection" },
  { code: "BREAKDOWN", label: "Discovered on breakdown" },
  { code: "CONDITION_MONITORING", label: "Condition monitoring" },
  { code: "CALIBRATION", label: "Found during calibration" },
  { code: "AUDIT", label: "Found during audit" },
];

const BY_CODE = new Map(FAILURE_MODES.map((m) => [m.code, m]));

export const failureModeLabel = (code: string | null | undefined): string =>
  (code && BY_CODE.get(code)?.label) || "-";

export const detectionMethodLabel = (code: string | null | undefined): string =>
  DETECTION_METHODS.find((d) => d.code === code)?.label ?? "-";

// The modes worth offering for a given fault type, most relevant first.
// UNKNOWN is always available: forcing a guess produces worse data than an
// honest "not determined".
export function failureModesFor(faultType: string | null | undefined): FailureModeCode[] {
  const ft = faultType ?? "UNKNOWN";
  const matching = FAILURE_MODES.filter((m) => m.faultTypes.includes(ft));
  return matching.length > 1 ? matching : FAILURE_MODES;
}

export const isFailureMode = (code: string): boolean => BY_CODE.has(code);
