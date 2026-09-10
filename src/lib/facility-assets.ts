// src/lib/facility-assets.ts
// The 19 office split AC units and the 4 external-calibration instruments, as
// transcribed from LIMSL's own two spreadsheets: the AC servicing schedule
// (floor-grouped, with serviced and next-service dates) and the LIMSL AC LIST
// (brand, model, power rating).
//
// Kept as data rather than inline in the seed for one reason: the seed needs a
// database and this machine has never been able to reach one. Held here it can
// be checked offline, and facility-assets.test.ts does check it, because a
// transcription error in an asset register is invisible until an auditor finds
// it.
//
// WHERE THE TWO SHEETS DISAGREE, the servicing schedule wins and the conflict
// is written into `notes` rather than resolved silently. Three disagreements
// exist and none of them can be settled from paper; they need somebody to read
// the label on the unit. See CONFLICTS at the foot of this file.

export type FacilityAsset = {
  assetId: string;
  name: string;
  category: string;
  subCategory: string;
  location: string;
  bay: string;
  oem: string;
  model: string;
  serialNumber: string;
  lastMaintenanceDate: string;
  nextMaintenanceDate: string;
  maintenanceFrequency: string;
  notes: string | null;
};

// Both sheets run on a 120-day cycle: every serviced date is exactly 120 days
// before its next-service date, on all 19 units. The schema's frequency enum
// has no 120-day step, so QUARTERLY is the nearest label and the real dates
// below carry the truth. Nothing computes from the label; the dates drive
// whether a unit is overdue.
export const AC_SERVICE_INTERVAL_DAYS = 120;

const TAG_SWAP =
  "Tag conflict: the LIMSL AC LIST sheet gives this unit the other supervisor office's tag. " +
  "Serial number agrees across both sheets, so the serial is trustworthy and the tag is not. " +
  "Verify against the label on the unit.";

export const AC_UNITS: FacilityAsset[] = [
  // ── Ground floor ────────────────────────────────────────────────────────
  {
    assetId: "LEE/OE/2232",
    name: "Split AC, Reception",
    category: "FACILITY_AC",
    subCategory: "2HP split unit",
    location: "Reception",
    bay: "Ground Floor",
    oem: "Hisense",
    model: "AF20SC1",
    serialNumber: "6926597765013",
    lastMaintenanceDate: "2025-09-30",
    nextMaintenanceDate: "2026-01-28",
    maintenanceFrequency: "QUARTERLY",
    notes: null,
  },
  {
    assetId: "LEE/OE/2184",
    name: "Split AC, QA/QC Office",
    category: "FACILITY_AC",
    subCategory: "1.5HP split unit",
    location: "QA/QC Office",
    bay: "Ground Floor",
    oem: "Panasonic",
    model: "CS-YC12MKF",
    serialNumber: "2424886795",
    lastMaintenanceDate: "2025-09-30",
    nextMaintenanceDate: "2026-01-28",
    maintenanceFrequency: "QUARTERLY",
    notes: null,
  },
  {
    assetId: "LEE/OE/2187",
    name: "Split AC, Welders Supervisor Office",
    category: "FACILITY_AC",
    subCategory: "1.5HP split unit",
    location: "Welders Supervisor Office",
    bay: "Ground Floor",
    oem: "Panasonic",
    model: "CS-PV127TKH-1",
    serialNumber: "3762555764",
    lastMaintenanceDate: "2025-09-30",
    nextMaintenanceDate: "2026-01-28",
    maintenanceFrequency: "QUARTERLY",
    notes: null,
  },
  {
    assetId: "LEE/OE/1809",
    name: "Split AC, Kitchen (Ground Floor)",
    category: "FACILITY_AC",
    subCategory: "1.5HP split unit",
    location: "Kitchen (Ground Floor)",
    bay: "Ground Floor",
    oem: "Midea",
    model: "MSMA-12CR",
    // Transcribed exactly as printed, letter O and digit 0 mixed. Left as-is:
    // a serial is evidence, and silently "correcting" one breaks the match to
    // the physical plate.
    serialNumber: "321513943038208O83O370",
    lastMaintenanceDate: "2025-09-30",
    nextMaintenanceDate: "2026-01-28",
    maintenanceFrequency: "QUARTERLY",
    notes: "Serial number as printed on the sheet mixes letter O and digit 0. Verify against the nameplate.",
  },
  {
    assetId: "LEE/OE/2188",
    name: "Split AC, Engineering Office",
    category: "FACILITY_AC",
    subCategory: "2HP split unit",
    location: "Engineering Office",
    bay: "Ground Floor",
    oem: "Hisense",
    model: "AST18TG1",
    serialNumber: "6946087347581",
    lastMaintenanceDate: "2025-10-01",
    nextMaintenanceDate: "2026-01-29",
    maintenanceFrequency: "QUARTERLY",
    notes: null,
  },
  {
    assetId: "LEE/OE/1839",
    name: "Split AC, Store",
    category: "FACILITY_AC",
    subCategory: "1.5HP split unit",
    location: "Store",
    bay: "Ground Floor",
    oem: "Panasonic",
    model: "CS-YC12MKF",
    serialNumber: "2424868578",
    lastMaintenanceDate: "2025-10-01",
    nextMaintenanceDate: "2026-01-29",
    maintenanceFrequency: "QUARTERLY",
    notes: null,
  },
  {
    assetId: "LEE/OE/2183",
    name: "Split AC, Electrical Supervisor Office",
    category: "FACILITY_AC",
    subCategory: "1.5HP split unit",
    location: "Electrical Supervisor Office",
    bay: "Ground Floor",
    oem: "Panasonic",
    model: "CS-YC12MKF",
    serialNumber: "2424883670",
    lastMaintenanceDate: "2025-10-01",
    nextMaintenanceDate: "2026-01-29",
    maintenanceFrequency: "QUARTERLY",
    notes: null,
  },
  {
    assetId: "LEE/OE/2185",
    name: "Split AC, Female Changing Room",
    category: "FACILITY_AC",
    subCategory: "1.5HP split unit",
    location: "Female Changing Room",
    bay: "Ground Floor",
    oem: "Panasonic",
    model: "CS-YC12MKF",
    serialNumber: "2424868707",
    lastMaintenanceDate: "2025-10-01",
    nextMaintenanceDate: "2026-01-29",
    maintenanceFrequency: "QUARTERLY",
    notes: null,
  },
  {
    assetId: "LEE/OE/2186",
    name: "Split AC, Male Changing Room",
    category: "FACILITY_AC",
    subCategory: "1.5HP split unit",
    location: "Male Changing Room",
    bay: "Ground Floor",
    oem: "Panasonic",
    model: "CS-YC12MKF",
    serialNumber: "2424883973",
    lastMaintenanceDate: "2025-10-01",
    nextMaintenanceDate: "2026-01-29",
    maintenanceFrequency: "QUARTERLY",
    notes: null,
  },

  // ── Top floor ───────────────────────────────────────────────────────────
  {
    assetId: "LEE/OE/2180",
    name: "Split AC, HSE Office",
    category: "FACILITY_AC",
    subCategory: "1.5HP split unit",
    location: "HSE Office",
    bay: "Top Floor",
    oem: "Panasonic",
    model: "CS-YC12MKF",
    serialNumber: "2424882983",
    lastMaintenanceDate: "2025-10-02",
    nextMaintenanceDate: "2026-01-30",
    maintenanceFrequency: "QUARTERLY",
    notes: null,
  },
  {
    assetId: "LEE/OE/2179",
    name: "Split AC, Workshop Supervisor Office",
    category: "FACILITY_AC",
    subCategory: "1.5HP split unit",
    location: "Workshop Supervisor Office",
    bay: "Top Floor",
    oem: "Panasonic",
    model: "CS-PC12QKH",
    serialNumber: "3472238482",
    lastMaintenanceDate: "2025-10-02",
    nextMaintenanceDate: "2026-01-30",
    maintenanceFrequency: "QUARTERLY",
    notes: `${TAG_SWAP} The AC LIST gives this unit LEE/OE/2178.`,
  },
  {
    assetId: "LEE/OE/2182",
    name: "Split AC, Admin Office",
    category: "FACILITY_AC",
    subCategory: "2HP split unit",
    location: "Admin Office",
    bay: "Top Floor",
    oem: "LG",
    model: "S4NC18TZCAA",
    serialNumber: "304CTYQ41666",
    lastMaintenanceDate: "2025-10-02",
    nextMaintenanceDate: "2026-01-30",
    maintenanceFrequency: "QUARTERLY",
    notes: null,
  },
  {
    assetId: "LEE/OE/2178",
    name: "Split AC, Factory Manager Office",
    category: "FACILITY_AC",
    subCategory: "2HP split unit",
    location: "Factory Manager Office",
    bay: "Top Floor",
    oem: "LG",
    model: "S4NC18TZCAA",
    serialNumber: "304CTEA41652",
    lastMaintenanceDate: "2025-10-02",
    nextMaintenanceDate: "2026-01-30",
    maintenanceFrequency: "QUARTERLY",
    notes: `${TAG_SWAP} The AC LIST gives this unit LEE/OE/2179.`,
  },
  {
    assetId: "LEE/OE/2177",
    name: "Split AC, ICT Office",
    category: "FACILITY_AC",
    subCategory: "1.5HP split unit",
    location: "ICT Office",
    bay: "Top Floor",
    oem: "Hisense",
    model: "AST12TG",
    serialNumber: "6946081347581",
    lastMaintenanceDate: "2025-10-03",
    nextMaintenanceDate: "2026-01-31",
    maintenanceFrequency: "QUARTERLY",
    notes: null,
  },
  {
    assetId: "LEE/OE/2189",
    name: "Split AC, Client Room",
    category: "FACILITY_AC",
    subCategory: "1.5HP split unit",
    location: "Client Room",
    bay: "Top Floor",
    oem: "Panasonic",
    model: "CS-YC12MKF",
    serialNumber: "2424882974",
    lastMaintenanceDate: "2025-10-03",
    nextMaintenanceDate: "2026-01-31",
    maintenanceFrequency: "QUARTERLY",
    notes: null,
  },
  {
    assetId: "LEE/OE/1840",
    name: "Split AC, Class Room",
    category: "FACILITY_AC",
    subCategory: "1.5HP split unit",
    location: "Class Room",
    bay: "Top Floor",
    oem: "Panasonic",
    model: "CS-YC12MKF",
    serialNumber: "2424868425",
    lastMaintenanceDate: "2025-10-03",
    nextMaintenanceDate: "2026-01-31",
    maintenanceFrequency: "QUARTERLY",
    notes:
      "Tag conflict: the LIMSL AC LIST gives this unit LEE/PE/1840, the servicing schedule gives LEE/OE/1840. " +
      "PE is the production-machine series, so OE is taken as correct. Verify against the label on the unit.",
  },
  {
    assetId: "LEE/OE/2181",
    name: "Split AC, Kitchen (Top Floor)",
    category: "FACILITY_AC",
    subCategory: "1.5HP split unit",
    location: "Kitchen (Top Floor)",
    bay: "Top Floor",
    oem: "Panasonic",
    model: "CS-PC12QKH",
    serialNumber: "3472238455",
    lastMaintenanceDate: "2025-10-03",
    nextMaintenanceDate: "2026-01-31",
    maintenanceFrequency: "QUARTERLY",
    notes: null,
  },
  {
    assetId: "LEE/OE/2233",
    name: "Split AC, Conference Room (1 of 2)",
    category: "FACILITY_AC",
    subCategory: "2HP split unit",
    location: "Conference Room",
    bay: "Top Floor",
    oem: "Hisense",
    model: "AST18TG1",
    serialNumber: "6946087357733",
    lastMaintenanceDate: "2025-10-04",
    nextMaintenanceDate: "2026-02-01",
    maintenanceFrequency: "QUARTERLY",
    notes:
      "Both conference-room units are recorded against serial 6946087357733 on the source sheets. " +
      "Two units cannot share a serial, so one is a transcription error. Read both nameplates.",
  },
  {
    assetId: "LEE/OE/2234",
    name: "Split AC, Conference Room (2 of 2)",
    category: "FACILITY_AC",
    subCategory: "2HP split unit",
    location: "Conference Room",
    bay: "Top Floor",
    oem: "Hisense",
    model: "AST18TG1",
    serialNumber: "6946087357733",
    lastMaintenanceDate: "2025-10-04",
    nextMaintenanceDate: "2026-02-01",
    maintenanceFrequency: "QUARTERLY",
    notes:
      "Both conference-room units are recorded against serial 6946087357733 on the source sheets. " +
      "Two units cannot share a serial, so one is a transcription error. Read both nameplates.",
  },
];

// ── Externally calibrated instruments (rows 54-57 of the LIMS log) ─────────
// These carry no LEE tag on the source sheet, meaning they are untagged in the
// workshop. The seed assigns the next free number in the PE series and prints
// what it assigned, so the instruments can be labelled to match.
export type CalibratedInstrument = {
  name: string;
  oem: string;
  model: string;
  serialNumber: string;
  lastCalibrationDate: string;
  nextCalibrationDate: string;
  calibrationInterval: number;
  calibratedBy: string;
  notes: string | null;
};

const SHARED_SERIAL =
  "Serial 06001052 is recorded against two different instruments on the source sheet. " +
  "One is a transcription error. Read both instrument labels.";

export const CALIBRATED_INSTRUMENTS: CalibratedInstrument[] = [
  {
    name: "True RMS Multimeter, Fluke 179",
    oem: "Fluke",
    model: "179",
    serialNumber: "46320710",
    lastCalibrationDate: "2026-07-25",
    nextCalibrationDate: "2027-07-24",
    calibrationInterval: 364,
    calibratedBy: "External",
    notes: null,
  },
  {
    name: "TRMS Clamp Meter, Fluke 376 FC",
    oem: "Fluke",
    model: "376 FC",
    serialNumber: "06001052",
    lastCalibrationDate: "2026-07-25",
    nextCalibrationDate: "2027-07-24",
    calibrationInterval: 364,
    calibratedBy: "External",
    notes: SHARED_SERIAL,
  },
  {
    name: "Earth Resistance Tester, Habotest HT20302",
    oem: "Habotest",
    model: "HT20302",
    serialNumber: "H12D-J051012",
    lastCalibrationDate: "2024-09-02",
    nextCalibrationDate: "2025-03-01",
    calibrationInterval: 180,
    calibratedBy: "External",
    notes:
      "Calibration expired 1 March 2025. Readings taken with this instrument since that date " +
      "are not traceable, which is what ISO 9001 7.1.5.2 asks about.",
  },
  {
    name: "Clamp Meter, Mastech MS2001",
    oem: "Mastech",
    model: "MS2001",
    serialNumber: "06001052",
    lastCalibrationDate: "2026-07-25",
    nextCalibrationDate: "2027-07-24",
    calibrationInterval: 364,
    calibratedBy: "External",
    notes: SHARED_SERIAL,
  },
];

// Everything the paperwork could not settle, in one list, so it can be printed,
// walked round the building and ticked off rather than living in a comment.
export const CONFLICTS = [
  "LEE/OE/2178 and LEE/OE/2179: the two sheets swap these tags between the Workshop Supervisor and Factory Manager offices. Serial numbers agree, tags do not.",
  "LEE/OE/1840 (Class Room): the AC LIST calls it LEE/PE/1840, which is the production-machine series.",
  "LEE/OE/2233 and LEE/OE/2234 (Conference Room): both units carry serial 6946087357733.",
  "Fluke 376 FC and Mastech MS2001: both instruments carry serial 06001052.",
  "LEE/OE/1809 (Kitchen, Ground Floor): serial mixes letter O and digit 0.",
] as const;
