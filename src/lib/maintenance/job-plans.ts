// src/lib/maintenance/job-plans.ts
// PM task libraries, one per equipment category.
//
// Until now a single hardcoded 21-item list was served to all 33 assets: a CNC
// lathe, a 5-tonne overhead crane, a screw compressor and an earthing system
// each received "Gearbox oil level & condition" and "Emergency stop functional"
// — and every item arrived pre-ticked OK. An auditor who prints two checklists
// sees they are identical and concludes the PM record is a formality. Worse,
// nobody was checking crane brake wear, compressor separator dP or earth-loop
// impedance, because those tasks did not exist anywhere in the system.
//
// Each task carries acceptance criteria (what "OK" actually means) and, where
// the answer is a number rather than a judgement, a unit — so a PM produces
// evidence and a trend instead of a tick.
export type JobTask = {
  item: string;
  criteria?: string; // what OK means — the acceptance criterion
  unit?: string; // when set, the technician records a measured value
};

export type JobPlan = {
  category: string;
  title: string;
  sections: { key: "visual" | "functional" | "lubrication" | "electrical"; label: string; tasks: JobTask[] }[];
};

const SAFETY_COMMON: JobTask[] = [
  { item: "Guards, covers and interlocks in place", criteria: "No guard removed, defeated or damaged" },
  { item: "Emergency stop functional", criteria: "Machine stops on E-stop; reset required to restart" },
  { item: "Warning labels and markings legible", criteria: "All safety decals readable" },
];

// Tasks every powered asset shares. Category plans ADD to these; they never
// silently replace them.
const GENERAL_VISUAL: JobTask[] = [
  { item: "General cleanliness and housekeeping", criteria: "No swarf, oil pooling or obstruction around the machine" },
  { item: "Structural frame and mountings secure", criteria: "No cracked welds; fasteners tight" },
  { item: "Leaks (oil / coolant / air)", criteria: "No active leak; no fresh pooling" },
  { item: "Cables and hoses condition", criteria: "No chafing, crushing or exposed conductors" },
];

const PLANS: JobPlan[] = [
  {
    category: "CNC_HEAVY",
    title: "CNC machining centre / heavy",
    sections: [
      { key: "visual", label: "Visual & physical", tasks: [...GENERAL_VISUAL, ...SAFETY_COMMON, { item: "Way covers and bellows intact", criteria: "No tears exposing slideways" }] },
      { key: "functional", label: "Functional tests", tasks: [
        { item: "Axis travel smooth over full stroke", criteria: "No juddering, binding or backlash" },
        { item: "Spindle run-up and run-down", criteria: "No abnormal noise or vibration" },
        { item: "Spindle bearing temperature after 15 min", unit: "°C", criteria: "Within OEM limit" },
        { item: "Tool change cycle", criteria: "Completes without alarm" },
        { item: "Coolant flow and pressure", unit: "bar", criteria: "Within OEM range" },
        { item: "Limit switches and homing", criteria: "All axes home correctly" },
      ] },
      { key: "lubrication", label: "Lubrication", tasks: [
        { item: "Way lube reservoir level", criteria: "Above minimum; correct grade" },
        { item: "Automatic luber cycling", criteria: "Dispenses on cycle; no alarm" },
        { item: "Hydraulic fluid level and condition", criteria: "Clear, not milky or dark" },
        { item: "Filters inspected / replaced", criteria: "No bypass indication" },
      ] },
      { key: "electrical", label: "Electrical", tasks: [
        { item: "Panel interior clean and dry", criteria: "No dust build-up, no moisture ingress" },
        { item: "Terminal tightness (sample)", criteria: "No discolouration or heat marking" },
        { item: "Drive fault log reviewed", criteria: "No recurring faults since last PM" },
        { item: "Earth continuity to machine frame", unit: "Ω", criteria: "< 1 Ω" },
      ] },
    ],
  },
  {
    category: "CRANE",
    title: "Overhead crane / lifting equipment",
    sections: [
      { key: "visual", label: "Visual & structural", tasks: [
        ...SAFETY_COMMON,
        { item: "Hook condition and safety latch", criteria: "No deformation, no throat opening beyond 10%; latch springs closed" },
        { item: "Wire rope / chain condition", criteria: "No broken wires, kinks, corrosion or stretch beyond limit" },
        { item: "Rope anchorage and drum seating", criteria: "Correctly seated; no crossover damage" },
        { item: "Runway, end stops and buffers", criteria: "Secure; buffers undamaged" },
        { item: "SWL marking legible on crane and hook block", criteria: "Rated capacity clearly visible" },
      ] },
      { key: "functional", label: "Functional tests", tasks: [
        { item: "Hoist brake holds rated load", criteria: "No drift when suspended" },
        { item: "Brake lining wear", unit: "mm", criteria: "Above OEM discard thickness" },
        { item: "Upper and lower limit switches", criteria: "Stops travel at both limits" },
        { item: "Long and cross travel operation", criteria: "Smooth, no skew or judder" },
        { item: "Pendant / radio control functions", criteria: "Every function matches its label" },
        { item: "Overload protection", criteria: "Trips at set point" },
        { item: "Anti-collision / warning devices", criteria: "Audible and visual devices operate" },
      ] },
      { key: "lubrication", label: "Lubrication", tasks: [
        { item: "Wire rope lubricated", criteria: "Even film; no dry sections" },
        { item: "Gearbox oil level and condition", criteria: "At mark; no emulsion or metallic sheen" },
        { item: "Wheel and sheave bearings greased", criteria: "Grease reaching bearing" },
      ] },
      { key: "electrical", label: "Electrical", tasks: [
        { item: "Festoon / conductor bar condition", criteria: "No arcing marks or worn collectors" },
        { item: "Contactor condition", criteria: "No pitting or welding of contacts" },
        { item: "Isolation and earthing verified", unit: "Ω", criteria: "< 1 Ω to structure" },
      ] },
    ],
  },
  {
    category: "COMPRESSOR",
    title: "Air compressor",
    sections: [
      { key: "visual", label: "Visual & physical", tasks: [
        ...GENERAL_VISUAL, ...SAFETY_COMMON,
        { item: "Receiver and pipework condition", criteria: "No corrosion, no visible weld defects" },
        { item: "Safety relief valve within test date", criteria: "Certificate current" },
      ] },
      { key: "functional", label: "Functional tests", tasks: [
        { item: "Discharge pressure at load", unit: "bar", criteria: "Within set band" },
        { item: "Loading / unloading set points", criteria: "Loads and unloads at configured pressures" },
        { item: "Air/oil separator differential pressure", unit: "bar", criteria: "Below change-out threshold" },
        { item: "Discharge air temperature", unit: "°C", criteria: "Within OEM limit" },
        { item: "Running hours since last service", unit: "h", criteria: "Within service interval" },
        { item: "Condensate drain operating", criteria: "Drains automatically; no continuous air loss" },
        { item: "Dryer dew point / operation", unit: "°C", criteria: "Within specification" },
      ] },
      { key: "lubrication", label: "Lubrication & filters", tasks: [
        { item: "Compressor oil level and condition", criteria: "At mark; not dark or emulsified" },
        { item: "Oil filter condition", criteria: "Within interval; no bypass" },
        { item: "Air intake filter", criteria: "Clean; no restriction indication" },
      ] },
      { key: "electrical", label: "Electrical", tasks: [
        { item: "Motor current on load", unit: "A", criteria: "Within nameplate FLA" },
        { item: "Motor bearing temperature / noise", criteria: "No abnormal heat or noise" },
        { item: "Starter and overload settings", criteria: "Set to nameplate; no trip history" },
      ] },
    ],
  },
  {
    category: "WELDING",
    title: "Welding machine / positioner",
    sections: [
      { key: "visual", label: "Visual & physical", tasks: [
        ...GENERAL_VISUAL, ...SAFETY_COMMON,
        { item: "Welding cables and connectors", criteria: "No exposed conductor; connectors tight and cool" },
        { item: "Earth return clamp condition", criteria: "Clean, firm contact, undamaged" },
        { item: "Torch / gun and consumables", criteria: "No damage; consumables within wear limits" },
      ] },
      { key: "functional", label: "Functional tests", tasks: [
        { item: "Output current at set point", unit: "A", criteria: "Within tolerance of setting" },
        { item: "Output voltage at set point", unit: "V", criteria: "Within tolerance of setting" },
        { item: "Wire feed consistency", criteria: "No stutter or slip" },
        { item: "Shielding gas flow", unit: "l/min", criteria: "At specified rate; no leaks" },
        { item: "Cooling fan / water cooler operation", criteria: "Runs; no overheat trip" },
        { item: "Rotation / tilt operation (positioners)", criteria: "Smooth, holds position under load" },
      ] },
      { key: "lubrication", label: "Lubrication", tasks: [
        { item: "Positioner gearbox and bearings", criteria: "Lubricated; no play" },
        { item: "Roller bed drive chain", criteria: "Tensioned and lubricated" },
      ] },
      { key: "electrical", label: "Electrical", tasks: [
        { item: "Insulation resistance of welding circuit", unit: "MΩ", criteria: "Above minimum" },
        { item: "Earth continuity", unit: "Ω", criteria: "< 1 Ω" },
        { item: "Panel and contactor condition", criteria: "Clean; no heat damage" },
      ] },
    ],
  },
  {
    category: "ELECTRICAL_PANEL",
    title: "Electrical panel / switchgear",
    sections: [
      { key: "visual", label: "Visual", tasks: [
        { item: "Enclosure sealed; no moisture or vermin ingress", criteria: "Gaskets intact, glands sealed" },
        { item: "Panel clean and free of stored items", criteria: "Nothing stored in or against the panel" },
        { item: "Labelling and single-line diagram current", criteria: "Matches installed configuration" },
        { item: "Danger / arc-flash signage present", criteria: "Legible and correct rating" },
        { item: "Access clearance maintained", criteria: "Working space unobstructed" },
      ] },
      { key: "functional", label: "Functional tests", tasks: [
        { item: "Indicator lamps and meters operate", criteria: "All display correctly" },
        { item: "RCD / earth-leakage trip test", unit: "ms", criteria: "Trips within rated time" },
        { item: "Breaker operation (on/off/trip)", criteria: "Operates smoothly; trip indication clear" },
        { item: "Interlocks and door switches", criteria: "Prevent access while live where fitted" },
      ] },
      { key: "electrical", label: "Electrical measurements", tasks: [
        { item: "Thermographic scan of terminations", criteria: "No hot spot above ambient threshold" },
        { item: "Phase voltages", unit: "V", criteria: "Balanced within tolerance" },
        { item: "Phase currents / load balance", unit: "A", criteria: "Within rating; balanced" },
        { item: "Termination tightness (torque check)", criteria: "To specified torque" },
        { item: "Earth / bonding continuity", unit: "Ω", criteria: "< 1 Ω" },
      ] },
    ],
  },
  {
    category: "EARTHING",
    title: "Earthing & lightning protection",
    sections: [
      { key: "visual", label: "Visual", tasks: [
        { item: "Earth pits accessible and covers intact", criteria: "Inspection covers present and openable" },
        { item: "Conductor and bonding condition", criteria: "No corrosion, breaks or theft" },
        { item: "Air terminals / down conductors secure", criteria: "Fixings sound; no mechanical damage" },
        { item: "Test links present and identifiable", criteria: "Labelled and operable" },
      ] },
      { key: "electrical", label: "Electrical measurements", tasks: [
        { item: "Earth electrode resistance", unit: "Ω", criteria: "Below design limit" },
        { item: "Earth loop impedance", unit: "Ω", criteria: "Within design limit for protective device" },
        { item: "Bonding continuity to main structures", unit: "Ω", criteria: "< 1 Ω" },
        { item: "Surge protection device status", criteria: "Status indicator healthy" },
      ] },
    ],
  },
  {
    category: "MEASURING",
    title: "Measuring instrument",
    sections: [
      { key: "visual", label: "Visual", tasks: [
        { item: "Instrument physically undamaged", criteria: "No cracks, corrosion or worn faces" },
        { item: "Calibration label present and in date", criteria: "Sticker matches the calibration record" },
        { item: "Case, leads and probes condition", criteria: "No damaged insulation or bent contacts" },
        { item: "Stored in correct conditions", criteria: "Protected from impact, damp and heat" },
      ] },
      { key: "functional", label: "Functional checks", tasks: [
        { item: "Zero / reference check against known standard", criteria: "Within stated tolerance" },
        { item: "Battery condition", criteria: "Sufficient charge; no leakage" },
        { item: "Reading repeatability", criteria: "Repeats within tolerance over three readings" },
      ] },
    ],
  },
  {
    category: "FACILITY_AC",
    title: "Facility AC / low-voltage services",
    sections: [
      { key: "visual", label: "Visual", tasks: [
        { item: "Unit housing, mounts and drain condition", criteria: "Secure; condensate draining freely" },
        { item: "Filters clean", criteria: "No visible clogging" },
        { item: "Coil and fin condition", criteria: "Clean; fins not crushed" },
      ] },
      { key: "functional", label: "Functional tests", tasks: [
        { item: "Supply air temperature", unit: "°C", criteria: "Within design differential" },
        { item: "Thermostat control and set point", criteria: "Cycles at set point" },
        { item: "Fan operation and noise", criteria: "No abnormal noise or vibration" },
        { item: "Refrigerant pressures", unit: "bar", criteria: "Within design range" },
      ] },
      { key: "electrical", label: "Electrical", tasks: [
        { item: "Running current", unit: "A", criteria: "Within nameplate" },
        { item: "Isolator and wiring condition", criteria: "Sound; no heat damage" },
      ] },
    ],
  },
];

// Categories with no bespoke plan fall back to a general powered-machine plan
// rather than nothing — the generic checklist stays available, it just stops
// pretending to be a crane inspection.
const GENERAL_PLAN: JobPlan = {
  category: "GENERAL",
  title: "General machine",
  sections: [
    { key: "visual", label: "Visual & physical", tasks: [...GENERAL_VISUAL, ...SAFETY_COMMON] },
    { key: "functional", label: "Functional tests", tasks: [
      { item: "Startup / shutdown sequence", criteria: "Operates as designed" },
      { item: "Controls and indicators respond", criteria: "Every control matches its label" },
      { item: "Movement / travel smooth", criteria: "No binding or unusual noise" },
      { item: "Abnormal noise or vibration", criteria: "None beyond normal operation" },
    ] },
    { key: "lubrication", label: "Lubrication", tasks: [
      { item: "Lubrication points serviced", criteria: "Correct grade applied at all points" },
      { item: "Oil levels and condition", criteria: "At mark; clean" },
      { item: "Filters inspected", criteria: "Within interval" },
    ] },
    { key: "electrical", label: "Electrical", tasks: [
      { item: "Panel cleanliness and tightness", criteria: "Clean, dry, terminals sound" },
      { item: "Motor condition and temperature", criteria: "No overheating or abnormal noise" },
      { item: "Earth continuity", unit: "Ω", criteria: "< 1 Ω" },
    ] },
  ],
};

const BY_CATEGORY = new Map(PLANS.map((p) => [p.category, p]));

// Categories that share a plan — a press/roll/shear is mechanically close
// enough to the heavy CNC plan to use it rather than the generic one.
const ALIASES: Record<string, string> = {
  CNC_LIGHT: "CNC_HEAVY",
  PRESS_ROLL_SHEAR: "CNC_HEAVY",
};

export function jobPlanFor(category: string | null | undefined): JobPlan {
  const key = category ?? "";
  return BY_CATEGORY.get(key) ?? BY_CATEGORY.get(ALIASES[key] ?? "") ?? GENERAL_PLAN;
}

export function hasBespokePlan(category: string | null | undefined): boolean {
  const key = category ?? "";
  return BY_CATEGORY.has(key) || !!ALIASES[key];
}

export const JOB_PLAN_CATEGORIES = PLANS.map((p) => p.category);
