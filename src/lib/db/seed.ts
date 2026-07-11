// src/lib/db/seed.ts
// Seeds the database with historical data from LIMSL documents

import { db } from "./index";
import {
  equipment,
  users,
  kpiRecords,
  riskRegister,
} from "./schema";
import { nanoid } from "nanoid";

export async function seedDatabase() {
  console.log("🌱 Seeding LIMSL CMS database with historical data...");

  // ─── Users ───────────────────────────────────────────────────────────────
  const seedUsers = [
    {
      id: nanoid(),
      name: "Daniel Idonor",
      email: "daniel.idonor@limsl.com",
      role: "ADMIN" as const,
      department: "Electrical Maintenance",
      phone: "",
      whatsapp: "",
      passwordHash: "", // set via auth setup
    },
    {
      id: nanoid(),
      name: "Kingsley Iworah",
      email: "kingsley.iworah@limsl.com",
      role: "SUPERVISOR" as const,
      department: "Electrical Maintenance",
    },
    {
      id: nanoid(),
      name: "Marcel Imadojiemu",
      email: "marcel.imadojiemu@limsl.com",
      role: "TECHNICIAN" as const,
      department: "Electrical Maintenance",
    },
    {
      id: nanoid(),
      name: "Godspower Michael",
      email: "godspower.michael@limsl.com",
      role: "TECHNICIAN" as const,
      department: "Electrical Maintenance",
    },
    {
      id: nanoid(),
      name: "Kenneth Aloziem",
      email: "kenneth.aloziem@limsl.com",
      role: "MANAGEMENT" as const,
      department: "Factory Management",
    },
    {
      id: nanoid(),
      name: "Osaghale Ikpea",
      email: "osaghale.ikpea@limsl.com",
      role: "MANAGEMENT" as const,
      department: "Management",
    },
  ];

  // ─── Equipment from EQUIPMENT HISTORY LOG ──────────────────────────────
  const seedEquipment = [
    // CNC Heavy Duty
    {
      id: nanoid(), assetId: "LEE/PE/1904", name: "Stako CNC Machine", category: "CNC_HEAVY",
      location: "Workshop", oem: "STAKO", model: "STAKO", status: "BROKEN_DOWN",
      maintenanceFrequency: "QUARTERLY", criticality: "HIGH",
    },
    {
      id: nanoid(), assetId: "LEE/PE/0399", name: "Metal Gennari Vertical Lathe Machine", category: "CNC_HEAVY",
      location: "Bay 3", oem: "METAL GENNARI", model: "METAL GENNARI", status: "OPERATIONAL",
      maintenanceFrequency: "QUARTERLY", criticality: "HIGH",
    },
    {
      id: nanoid(), assetId: "LEE/PE/0587", name: "JOBS Milling and Boring Machine", category: "CNC_HEAVY",
      location: "Workshop", oem: "JOBS", model: "JOBS", status: "OPERATIONAL",
      maintenanceFrequency: "QUARTERLY", criticality: "HIGH",
    },
    // Press / Roll / Shear
    {
      id: nanoid(), assetId: "LEE/PE/0350", name: "Colgar Shearing Machine", category: "PRESS_ROLL_SHEAR",
      location: "Bay 2", oem: "COLGAR", model: "COLGAR", status: "OPERATIONAL",
      maintenanceFrequency: "QUARTERLY", criticality: "MEDIUM",
    },
    {
      id: nanoid(), assetId: "LEE/PE/0348", name: "Sertom Plate Rolling Machine (10mm-300mm)", category: "PRESS_ROLL_SHEAR",
      location: "Bay 2", oem: "SERTOM", model: "SERTOM", status: "OPERATIONAL",
      maintenanceFrequency: "QUARTERLY", criticality: "HIGH",
    },
    {
      id: nanoid(), assetId: "LEE/PE/0347", name: "RIDGA Dishing Machine", category: "PRESS_ROLL_SHEAR",
      location: "Bay 3", oem: "RIDGA", model: "RIDGA", status: "OPERATIONAL",
      maintenanceFrequency: "QUARTERLY", criticality: "HIGH",
    },
    {
      id: nanoid(), assetId: "LEE/PE/0584", name: "SERTOM PB Plate Bending End cap and Flange", category: "PRESS_ROLL_SHEAR",
      location: "Bay 3", oem: "SERTOM PB", model: "SERTOM PB", status: "OPERATIONAL",
      maintenanceFrequency: "QUARTERLY", criticality: "MEDIUM",
    },
    {
      id: nanoid(), assetId: "LEE/PE/0511", name: "GRIT Filling Machine", category: "OTHER",
      location: "Workshop", oem: "GRIT A/S", model: "GRIT A/S", status: "OPERATIONAL",
      maintenanceFrequency: "QUARTERLY", criticality: "LOW",
    },
    {
      id: nanoid(), assetId: "LEE/PE/0508", name: "Sidermac Profile Bending Machine", category: "PRESS_ROLL_SHEAR",
      location: "Bay 2", oem: "SIDERMAC", model: "SIDERMAC", status: "OPERATIONAL",
      maintenanceFrequency: "QUARTERLY", criticality: "MEDIUM",
    },
    // Welding Machines
    {
      id: nanoid(), assetId: "LEE/PE/0418", name: "Macobe/Lincoln Column Boom SAW Machine", category: "WELDING",
      location: "Bay 1", oem: "Macobe/Lincoln", model: "Macobe/Lincoln", status: "OPERATIONAL",
      maintenanceFrequency: "BI_MONTHLY", criticality: "MEDIUM",
    },
    {
      id: nanoid(), assetId: "LEE/PE/0417", name: "ESAB Column Boom Submerge Arc Welding Machine", category: "WELDING",
      location: "Bay 1", oem: "ESAB", model: "ESAB", status: "OPERATIONAL",
      maintenanceFrequency: "BI_MONTHLY", criticality: "MEDIUM",
    },
    {
      id: nanoid(), assetId: "LEE/PE/0419", name: "Siemens Welding Roller #1", category: "WELDING",
      location: "Bay 1", oem: "SIEMENS", serialNumber: "0419", status: "OPERATIONAL",
      maintenanceFrequency: "BI_MONTHLY", criticality: "LOW",
    },
    {
      id: nanoid(), assetId: "LEE/PE/0420", name: "Siemens Welding Roller #2", category: "WELDING",
      location: "Bay 1", oem: "SIEMENS", serialNumber: "0420", status: "OPERATIONAL",
      maintenanceFrequency: "BI_MONTHLY", criticality: "LOW",
    },
    {
      id: nanoid(), assetId: "LEE/PE/0421", name: "Siemens Welding Roller #3", category: "WELDING",
      location: "Bay 1", oem: "SIEMENS", serialNumber: "0421", status: "OPERATIONAL",
      maintenanceFrequency: "BI_MONTHLY", criticality: "LOW",
    },
    {
      id: nanoid(), assetId: "LEE/PE/149", name: "HB-10 Welding Positioner/Manipulator", category: "WELDING",
      location: "Bay 1", oem: "HB-10", model: "HB-10", status: "OPERATIONAL",
      maintenanceFrequency: "BI_MONTHLY", criticality: "MEDIUM",
    },
    {
      id: nanoid(), assetId: "LEE/PE/0151", name: "HB-3 Welding Positioner/Manipulator", category: "WELDING",
      location: "Bay 1", oem: "HB-3", model: "HB-3", status: "OPERATIONAL",
      maintenanceFrequency: "BI_MONTHLY", criticality: "MEDIUM",
    },
    {
      id: nanoid(), assetId: "LEE/PE/0156", name: "Gullco Beveling Machine", category: "WELDING",
      location: "Workshop", oem: "GULLCO", model: "GULLCO", status: "OPERATIONAL",
      maintenanceFrequency: "QUARTERLY", criticality: "LOW",
    },
    {
      id: nanoid(), assetId: "LEE/PE/0411", name: "G.B.C Beveling Machine", category: "WELDING",
      location: "Workshop", oem: "G.B.C", model: "G.B.C", status: "OPERATIONAL",
      maintenanceFrequency: "QUARTERLY", criticality: "LOW",
    },
    // Cranes
    {
      id: nanoid(), assetId: "LEE/PE/0159", name: "Kone 12T Overhead Crane #1", category: "CRANE",
      location: "Bay 1", bay: "Bay 1", oem: "Kone", model: "12T", serialNumber: "C1491",
      status: "OPERATIONAL", maintenanceFrequency: "BI_MONTHLY", criticality: "HIGH",
    },
    {
      id: nanoid(), assetId: "LEE/PE/0158", name: "Kone 12T Overhead Crane #2", category: "CRANE",
      location: "Bay 1", bay: "Bay 1", oem: "Kone", model: "12T", serialNumber: "C1490",
      status: "OPERATIONAL", maintenanceFrequency: "BI_MONTHLY", criticality: "HIGH",
    },
    {
      id: nanoid(), assetId: "LEE/PE/0160", name: "Kone 24T Overhead Crane #1", category: "CRANE",
      location: "Bay 2", bay: "Bay 2", oem: "Kone", model: "24T", serialNumber: "C1492",
      status: "OPERATIONAL", maintenanceFrequency: "BI_MONTHLY", criticality: "HIGH",
    },
    {
      id: nanoid(), assetId: "LEE/PE/0161", name: "Kone 24T Overhead Crane #2", category: "CRANE",
      location: "Bay 2", bay: "Bay 2", oem: "Kone", model: "24T", serialNumber: "C1493",
      status: "OPERATIONAL", maintenanceFrequency: "BI_MONTHLY", criticality: "HIGH",
    },
    {
      id: nanoid(), assetId: "LEE/PE/0475", name: "OMIS 10T Crane #1", category: "CRANE",
      location: "Bay 3", bay: "Bay 3", oem: "OMS", model: "10T", serialNumber: "19184",
      status: "OPERATIONAL", maintenanceFrequency: "BI_MONTHLY", criticality: "HIGH",
    },
    {
      id: nanoid(), assetId: "LEE/PE/0474", name: "OMIS 10T Crane #2", category: "CRANE",
      location: "Bay 3", bay: "Bay 3", oem: "OMS", model: "10T", serialNumber: "191845",
      status: "OPERATIONAL", maintenanceFrequency: "BI_MONTHLY", criticality: "HIGH",
    },
    // Lathes & Drilling
    {
      id: nanoid(), assetId: "LEE/PE/0167", name: "ZMM SLIVEN Universal Lathe Machine", category: "CNC_LIGHT",
      location: "Workshop", oem: "ZMM SLIVEN", model: "ZMM SLIVEN", status: "OPERATIONAL",
      maintenanceFrequency: "QUARTERLY", criticality: "MEDIUM",
    },
    {
      id: nanoid(), assetId: "LEE/PE/0422", name: "Metalik P050A ZMM Column Drilling Machine", category: "CNC_LIGHT",
      location: "Workshop", oem: "Metalik P050A ZMM", model: "P050A", status: "OPERATIONAL",
      maintenanceFrequency: "QUARTERLY", criticality: "LOW",
    },
    {
      id: nanoid(), assetId: "LEE/PE/0168", name: "H. Cegielski-Poznan Column Drilling Machine", category: "CNC_LIGHT",
      location: "Workshop", oem: "H.CEGIELSKI-POZNAN", model: "H.CEGIELSKI-POZNAN", status: "OPERATIONAL",
      maintenanceFrequency: "QUARTERLY", criticality: "LOW",
    },
    {
      id: nanoid(), assetId: "LEE/PE/0174", name: "PEGAS Ban Sawing Machine", category: "CNC_LIGHT",
      location: "Workshop", oem: "PEGAS", model: "PEGAS", status: "OPERATIONAL",
      maintenanceFrequency: "QUARTERLY", criticality: "LOW",
    },
    {
      id: nanoid(), assetId: "LEE/PE/0522", name: "POLI Making-out Precision Table", category: "OTHER",
      location: "Workshop", oem: "POLI", model: "POLI", status: "OPERATIONAL",
      maintenanceFrequency: "QUARTERLY", criticality: "LOW",
    },
    // Measuring Instruments
    {
      id: nanoid(), assetId: "INST-001", name: "Earth Resistance Tester", category: "MEASURING",
      location: "Maintenance Workshop", oem: "HT", model: "HT20302", serialNumber: "H12D-J051012",
      status: "OPERATIONAL", maintenanceFrequency: "SEMI_ANNUAL", criticality: "MEDIUM",
    },
    {
      id: nanoid(), assetId: "INST-002", name: "Clamp Meter", category: "MEASURING",
      location: "Maintenance Workshop", status: "OPERATIONAL",
      maintenanceFrequency: "SEMI_ANNUAL", criticality: "LOW",
    },
    {
      id: nanoid(), assetId: "INST-003", name: "Insulation Tester (Megger)", category: "MEASURING",
      location: "Maintenance Workshop", status: "OPERATIONAL",
      maintenanceFrequency: "SEMI_ANNUAL", criticality: "MEDIUM",
    },
    {
      id: nanoid(), assetId: "INST-004", name: "Multimeter", category: "MEASURING",
      location: "Maintenance Workshop", status: "OPERATIONAL",
      maintenanceFrequency: "SEMI_ANNUAL", criticality: "LOW",
    },
  ];

  // ─── Risks from MAINTENANCE RISKS AND OPPORTUNITIES LOG ───────────────
  const seedRisks = [
    {
      id: nanoid(),
      riskNumber: "RISK-001",
      identifiedRisk: "Unplanned breakdown of critical CNC machines (Vertical Lathe / JOBS Milling / Rolling Machine / Dishing and Flanging Machine)",
      type: "INTERNAL",
      affectedProcess: "Machining operations / Production scheduling / Client delivery",
      likelihood: 3, consequence: 3, impactRating: 9, riskLevel: "HIGH",
      actionToAddressRisk: "Implement structured preventive maintenance schedule; Deploy condition monitoring pilot; Maintain critical spare parts stock; Track MTBF and downtime trends",
      status: "OPEN",
    },
    {
      id: nanoid(),
      riskNumber: "RISK-002",
      identifiedRisk: "Unavailability of critical spare parts during machine failure",
      type: "INTERNAL",
      affectedProcess: "Poor forecasting, long OEM lead times, lack of criticality-based stocking",
      likelihood: 3, consequence: 4, impactRating: 12, riskLevel: "HIGH",
      actionToAddressRisk: "Develop critical spare parts list; Define reorder levels; Annual spare forecasting; Link spare inventory to machine criticality",
      status: "OPEN",
    },
    {
      id: nanoid(),
      riskNumber: "RISK-003",
      identifiedRisk: "Electrical Panel Failure Risk",
      type: "INTERNAL",
      affectedProcess: "Machine operation / Electrical safety compliance",
      likelihood: 3, consequence: 3, impactRating: 9, riskLevel: "HIGH",
      actionToAddressRisk: "Quarterly thermographic inspection; Torque tightening schedule; Load balancing analysis; Install temperature monitoring",
      status: "OPEN",
    },
    {
      id: nanoid(),
      riskNumber: "RISK-004",
      identifiedRisk: "Failure of crane lifting components or the control system",
      type: "INTERNAL",
      affectedProcess: "Material handling / Fabrication workflow / Safety",
      likelihood: 3, consequence: 3, impactRating: 9, riskLevel: "HIGH",
      actionToAddressRisk: "Annual load testing; Quarterly inspection; Compliance certification; Operator competency validation",
      status: "OPEN",
    },
    {
      id: nanoid(),
      riskNumber: "RISK-005",
      identifiedRisk: "Air compressor failure affecting multiple machines",
      type: "INTERNAL",
      affectedProcess: "Factory pneumatic systems / Multiple machines",
      likelihood: 3, consequence: 3, impactRating: 9, riskLevel: "HIGH",
      actionToAddressRisk: "Install vibration & temperature monitoring; Maintain backup redundancy plan; Track operating hours & service intervals",
      status: "OPEN",
    },
    {
      id: nanoid(),
      riskNumber: "RISK-006",
      identifiedRisk: "Skill gap in advanced diagnostics and condition monitoring",
      type: "INTERNAL",
      affectedProcess: "Limited advanced diagnostic capability, dependence on OEM",
      likelihood: 3, consequence: 3, impactRating: 9, riskLevel: "HIGH",
      actionToAddressRisk: "Structured training plan; OEM technical training; Competency matrix tracking; Internal technical knowledge transfer",
      status: "OPEN",
    },
  ];

  // ─── Historical KPI Data (from Maintenance KPI Dashboard) ────────────
  const seedKPI = [
    {
      id: nanoid(), month: "2026-01", equipmentName: "CNC Machines", assetId: "LEE/PE/001",
      mtbf: 420, mttr: 3.2, pmCompliance: 0.96, inspectionCompliance: 0.98,
      availability: 0.94, maintenanceCost: 3200000, downtimeHours: 38,
      remark: "Spindle bearing issue",
    },
    {
      id: nanoid(), month: "2026-01", equipmentName: "Stako Machine", assetId: "LEE/PE/1904",
      mtbf: 700, mttr: 7, pmCompliance: 1.0, inspectionCompliance: 0.9,
      availability: 0.97, maintenanceCost: 3200000, downtimeHours: 20,
      remark: "Operator lacks experience, power fluctuation",
    },
  ];

  try {
    // Insert users
    await db.insert(users).values(seedUsers).onConflictDoNothing();
    console.log(`✅ Inserted ${seedUsers.length} users`);

    // Insert equipment
    await db.insert(equipment).values(seedEquipment).onConflictDoNothing();
    console.log(`✅ Inserted ${seedEquipment.length} equipment records`);

    // Insert risks
    await db.insert(riskRegister).values(seedRisks).onConflictDoNothing();
    console.log(`✅ Inserted ${seedRisks.length} risk records`);

    // Insert historical KPI data
    await db.insert(kpiRecords).values(seedKPI).onConflictDoNothing();
    console.log(`✅ Inserted ${seedKPI.length} KPI records`);

    console.log("🎉 Database seeding complete!");
  } catch (error) {
    console.error("❌ Seeding failed:", error);
    throw error;
  }
}
