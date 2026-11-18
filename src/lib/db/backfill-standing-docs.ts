// src/lib/db/backfill-standing-docs.ts
// Draft standing method statements and hazard analyses for the categories that
// had none when the 2026 PM record was backfilled. They are DRAFTS for the named
// signatories to check against the paper documents: nothing here is approved
// until the Foreman, HSE, the Maintenance Manager and the Factory Manager have
// each signed both passes themselves.

export type JhaRow = {
  step: string;
  hazards: string;
  controls: string;
  likelihoodBefore: number;
  severityBefore: number;
  likelihoodAfter: number;
  severityAfter: number;
  responsible: string;
};

export type StandingDoc = {
  label: string;
  scope: string;
  tools: string[];
  steps: string[];
  hazards: JhaRow[];
  ppe: string[];
};

const TECH = "Maintenance Technician";
const row = (step: string, hazards: string, controls: string, lb: number, sb: number, la: number, sa: number): JhaRow => ({
  step,
  hazards,
  controls,
  likelihoodBefore: lb,
  severityBefore: sb,
  likelihoodAfter: la,
  severityAfter: sa,
  responsible: TECH,
});

const ISOLATE = row(
  "Isolate the equipment and apply lock-out / tag-out",
  "Unexpected start-up, electric shock, release of stored energy",
  "Permit issued before work; isolate at source; lock and tag; prove dead before touching; key held by the person working",
  3, 5, 1, 5,
);
const RETURN = row(
  "Remove isolation and return to service",
  "Guards left off, tools left in the machine, re-energising with people exposed",
  "Account for tools; refit guards; clear the area; remove locks only after a head count; function test; hand back to the area owner",
  2, 4, 1, 4,
);

export const STANDING_DOCS: Record<string, StandingDoc> = {
  CRANE: {
    label: "Cranes & Lifting Equipments",
    scope: "Overhead cranes, hoists, trolleys, runways and lifting accessories.",
    tools: [],
    steps: [],
    ppe: ["HELMET", "SAFETY_SHOE", "GLOVES", "COMMS", "HARNESS"],
    hazards: [
      ISOLATE,
      row("Access the crane and work at height", "Fall from height, dropped tools", "Approved access equipment; harness anchored; tools tethered; area below barricaded", 3, 5, 1, 5),
      row("Inspect hook, rope, brakes and limit switches", "Crush and pinch points, sharp broken wires, sudden load movement", "No load on the hook; gloves; hands clear of drums and sheaves; banksman for any movement", 3, 4, 2, 3),
      row("Lubricate and adjust moving parts", "Skin contact with grease, slips from spills", "Approved lubricants; gloves; clean spills immediately", 2, 2, 1, 2),
      RETURN,
    ],
  },
  WELDING: {
    label: "Welding Machines and Accessories",
    scope: "SMAW, MIG, TIG and submerged arc welding machines, positioners, rollers and electrode ovens.",
    tools: ["Hand tools", "Multimeter", "Insulation tester", "Compressed air blower", "Cable lugs and insulation tape"],
    steps: [
      "Isolate the machine from the supply and allow the power source and ovens to cool.",
      "Inspect the torch, electrode holder, earth clamp and tongue for wear, heat damage and loose connections.",
      "Inspect welding and supply cables for cuts, exposed conductor and damaged insulation; replace what is defective.",
      "Open the casing, blow out dust and check terminals, fans and contactors.",
      "Check positioner and roller drives, and oven door seals and heaters, where fitted.",
      "Refit covers, restore the supply and carry out a function test.",
    ],
    ppe: ["FACE_VISOR", "GLOVES", "FR_COVERALL", "SAFETY_SHOE", "DUST_MASK"],
    hazards: [
      ISOLATE,
      row("Open the casing and clean the power source", "Residual charge in capacitors, dust inhalation, eye injury from blown dust", "Wait for capacitors to discharge and prove dead; dust mask and goggles; low-pressure air only", 3, 4, 1, 4),
      row("Inspect cables, torches and clamps", "Electric shock from damaged insulation, burns from hot parts", "Equipment cold before handling; defective cable removed from use; gloves", 3, 4, 1, 3),
      row("Function test the welding machine", "Arc flash, burns, fumes, fire", "Face visor and FR coverall; screens in place; ventilation; combustibles cleared; extinguisher at hand", 3, 4, 2, 3),
      RETURN,
    ],
  },
  CNC_LIGHT: {
    label: "CNC Light Duty",
    scope: "Band saw, CNC plasma and oxyfuel cutting machines and their generators.",
    tools: ["Hand tools", "Grease gun and approved lubricants", "Dial indicator", "Multimeter", "Feeler gauges"],
    steps: [
      "Stop the machine, isolate power and close gas supplies where fitted.",
      "Lubricate guides, rails and moving parts.",
      "Check spindle or torch condition, alignment and backlash.",
      "Inspect and clean the control panel; check cables and connections.",
      "Test the safety interlocks and emergency stops.",
      "Verify earthing continuity, restore supplies and run a test cycle.",
    ],
    ppe: ["GOGGLES", "SAFETY_SHOE", "HEARING", "GLOVES"],
    hazards: [
      ISOLATE,
      row("Close and vent gas supplies on cutting machines", "Fire or explosion from fuel gas and oxygen leaks", "Close cylinder valves; vent lines; leak test on restoring; no ignition sources", 2, 5, 1, 5),
      row("Lubricate and check alignment", "Cuts from blades and slag, pinch points on gantry and rails", "Blade guarded or removed; gloves; machine locked off; hands clear of drives", 3, 3, 1, 3),
      row("Test interlocks and run a test cycle", "Unexpected axis movement, noise, flying particles", "Area clear; one person at the controls; goggles and hearing protection", 2, 4, 1, 3),
      RETURN,
    ],
  },
  MEASURING: {
    label: "Measuring Instruments",
    scope: "Multimeters, clamp meters, insulation and earth testers, calipers and gas detectors.",
    tools: ["Reference standards", "Test leads", "Spare batteries", "Soft cleaning cloth"],
    steps: [
      "Check the physical condition of the instrument, leads and case.",
      "Replace batteries and confirm the instrument powers up and functions.",
      "Verify accuracy against a reference, or confirm the calibration certificate is in date.",
      "Record the calibration status and due date, and label the instrument.",
      "Withdraw any instrument that fails, and return good instruments to proper storage.",
    ],
    ppe: ["SAFETY_SHOE", "GLOVES"],
    hazards: [
      row("Check instruments and test leads", "Electric shock from damaged leads during verification", "Inspect leads first; damaged leads withdrawn; verify on low-voltage references only", 2, 4, 1, 3),
      row("Handle batteries", "Chemical contact from leaking batteries", "Gloves; dispose of leaking batteries as hazardous waste", 2, 2, 1, 2),
      row("Check gas detector response", "Exposure to test gas", "Use the calibration gas in a ventilated area; close the regulator after use", 2, 3, 1, 2),
    ],
  },
  BEVELING_FILING_GRINDING: {
    label: "Beveling / Filing / Grinding",
    scope: "Beveling machines, tool grinders and filing or sanding machines.",
    tools: ["Hand tools", "Grease gun and approved lubricants", "Dial indicator", "Multimeter"],
    steps: [
      "Stop the machine, isolate power and allow rotating parts to come to rest.",
      "Lubricate moving parts and check the spindle condition.",
      "Check alignment and backlash; inspect wheels, cutters and belts for wear.",
      "Inspect and clean the control panel; test the emergency stop and interlocks.",
      "Verify earthing continuity and run a test cycle.",
    ],
    ppe: ["GOGGLES", "SAFETY_SHOE", "HEARING", "GLOVES", "DUST_MASK"],
    hazards: [
      ISOLATE,
      row("Inspect wheels, cutters and belts", "Cuts from sharp edges, wheel burst from a damaged wheel", "Gloves; damaged wheels and cutters replaced; correct wheel rating confirmed", 3, 4, 1, 4),
      row("Clean dust from the machine", "Inhalation of metal dust, eye injury", "Dust mask and goggles; vacuum or wipe rather than blow", 3, 3, 1, 2),
      row("Run the test cycle", "Flying particles, noise, entanglement", "Guards fitted; loose clothing secured; goggles and hearing protection", 2, 4, 1, 3),
      RETURN,
    ],
  },
  COMPRESSOR: {
    label: "Pneumatic Equipment and Systems",
    scope: "Air compressors, air dryers, receivers and distribution pipework.",
    tools: ["Hand tools", "Leak detection fluid", "Pressure gauge", "Multimeter", "Replacement filters"],
    steps: [
      "Isolate the compressor electrically and depressurise the receiver and lines.",
      "Replace or clean filters; inspect the dryer and moisture traps and drain condensate.",
      "Inspect the tank, hoses and pipework for corrosion, damage and leaks.",
      "Check the motor, belts and control panel.",
      "Test the safety valve and pressure switch, then verify pressure and flow on restart.",
    ],
    ppe: ["HEARING", "GOGGLES", "SAFETY_SHOE", "GLOVES"],
    hazards: [
      ISOLATE,
      row("Depressurise the receiver and lines", "Stored pressure release, whipping hoses, flying debris", "Vent to zero and confirm on the gauge before opening anything; goggles", 3, 5, 1, 5),
      row("Change filters and drain condensate", "Hot surfaces, oil contact, slips", "Allow to cool; gloves; contain and dispose of oily condensate", 3, 3, 1, 2),
      row("Test the safety valve and restart", "Noise, sudden discharge", "Hearing protection; stand clear of the discharge; raise pressure gradually", 2, 4, 1, 3),
      RETURN,
    ],
  },
  PRESS_ROLL_SHEAR: {
    label: "Press / Threading / Drilling",
    scope: "Profile bending, column and radial drilling, and dicing and threading machines.",
    tools: ["Hand tools", "Grease gun and approved lubricants", "Dial indicator", "Multimeter", "Insulation tester"],
    steps: [
      "Stop the machine, isolate power and release hydraulic pressure.",
      "Inspect the hydraulic system, gearbox and lubrication points.",
      "Check blades, dies, spindles and alignment.",
      "Inspect the electrical cabinet, drives and controls.",
      "Carry out earthing and insulation checks, then run a test cycle.",
    ],
    ppe: ["HELMET", "GLOVES", "SAFETY_SHOE", "GOGGLES"],
    hazards: [
      ISOLATE,
      row("Release hydraulic pressure and inspect the system", "High-pressure oil injection, oil spills, raised parts falling", "Lower or block raised parts; release pressure; gloves and goggles; contain spills", 3, 5, 1, 4),
      row("Check blades, dies and spindles", "Cuts, crushing, manual handling of heavy parts", "Machine locked off; gloves; lifting aid for heavy parts", 3, 4, 1, 3),
      row("Run the test cycle", "Entanglement, crushing, swarf", "Guards fitted; one operator; area clear; loose clothing secured", 2, 4, 1, 3),
      RETURN,
    ],
  },
  FACILITY_AC: {
    label: "AC and Other Office Appliances",
    scope: "Split air conditioners, sockets and low-voltage appliances in the offices and facility.",
    tools: ["Hand tools", "Multimeter", "Fin comb", "Service hose and cleaning solution", "Stepladder"],
    steps: [
      "Isolate the unit at the breaker and confirm it is dead.",
      "Clean filters, indoor coil and drain line; clear the condensate drain.",
      "Clean the outdoor unit and check the fan, mountings and pipe insulation.",
      "Check electrical connections, then restore power and confirm cooling.",
    ],
    ppe: ["GOGGLES", "SAFETY_SHOE", "GLOVES"],
    hazards: [
      ISOLATE,
      row("Work from a ladder at indoor and outdoor units", "Fall from height, dropped tools", "Inspected stepladder on level ground; second person footing it; tools carried in a pouch", 3, 4, 1, 3),
      row("Clean coils and drains", "Cuts from fins, chemical and water contact, wet floors, mould exposure", "Gloves and goggles; protect the area below; wipe up water at once", 3, 2, 1, 2),
      RETURN,
    ],
  },
  ELECTRICAL_PANEL: {
    label: "HV Electrical Panels and Systems",
    scope: "High-voltage distribution panels and associated switchgear.",
    tools: ["Insulated hand tools", "Approved voltage detector", "Insulation tester", "Earthing set", "Torque wrench"],
    steps: [
      "Competent authorised person switches out, isolates, locks and proves the panel dead, and applies earths.",
      "Inspect busbars, terminations, insulators and enclosures for heat damage, tracking and contamination.",
      "Clean, and tighten connections to the specified torque.",
      "Carry out insulation resistance and earthing checks.",
      "Remove earths, account for tools and re-energise under the control of the authorised person.",
    ],
    ppe: ["GLOVES", "FACE_VISOR", "SAFETY_SHOE", "FR_COVERALL"],
    hazards: [
      row("Switch out, isolate and prove dead", "Electrocution, arc flash, back-feed from another source", "Authorised person only; approved detector proved before and after; lock and tag all sources; earths applied", 3, 5, 1, 5),
      row("Work inside the panel", "Contact with adjacent live parts, arc flash", "Adjacent live parts screened; insulated tools; arc-rated PPE; second person present", 3, 5, 1, 5),
      row("Insulation resistance testing", "Electric shock from test voltage", "Warn others; barrier the area; discharge after each test", 2, 4, 1, 3),
      row("Re-energise the panel", "Arc flash from a fault or left-behind tool", "Tools accounted for; earths removed and counted; stand clear; authorised person switches in", 2, 5, 1, 5),
    ],
  },
  OTHER: {
    label: "Other Workshop Machines",
    scope: "General workshop machines such as saws, lathes and marking-out tables.",
    tools: ["Hand tools", "Grease gun and approved lubricants", "Multimeter"],
    steps: [
      "Stop the machine and isolate it from the supply.",
      "Lubricate moving parts and inspect belts, blades and guards.",
      "Check alignment, fixings and electrical connections.",
      "Test the emergency stop and run a test cycle.",
    ],
    ppe: ["HELMET", "SAFETY_SHOE", "GOGGLES", "GLOVES"],
    hazards: [
      ISOLATE,
      row("Inspect blades, belts and moving parts", "Cuts, pinch points, entanglement", "Machine locked off; gloves; blades guarded", 3, 3, 1, 3),
      row("Run the test cycle", "Flying particles, entanglement, noise", "Guards fitted; loose clothing secured; goggles", 2, 4, 1, 3),
      RETURN,
    ],
  },
};
