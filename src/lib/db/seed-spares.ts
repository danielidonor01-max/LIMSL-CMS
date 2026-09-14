// src/lib/db/seed-spares.ts
import { db } from "./index";
import { spareParts, equipment } from "./schema";
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";

export async function seedCriticalSpares() {
  console.log("🌱 Seeding critical spares...");

  // Find equipment IDs if they exist by assetId
  const allEquipment = await db.select({ id: equipment.id, assetId: equipment.assetId }).from(equipment);
  const findEq = (assetId: string) => allEquipment.find((e) => e.assetId === assetId)?.id ?? null;

  const stakoId = findEq("LEE/PE/1904") || "eq-stako-1904";
  const gennariId = findEq("LEE/PE/0399") || "eq-gennari-0399";
  const jobsId = findEq("LEE/PE/0587") || "eq-jobs-0587";
  const colgarId = findEq("LEE/PE/0350");
  const sertomId = findEq("LEE/PE/0348");

  const sparesList = [
    {
      id: nanoid(),
      partNumber: "ENC-STK-01",
      name: "X-Axis Optical Rotary Encoder (Heidenhain)",
      description: "Critical positioning encoder for Stako CNC gantry feed drive.",
      equipmentId: stakoId,
      quantityOnHand: 0, // Below minimum: triggers "Parts below minimum" & exposure days
      minimumQuantity: 1,
      maximumQuantity: 3,
      unit: "ea",
      binLocation: "BIN-E04",
      supplierName: "Heidenhain Industrial Controls",
      supplierPartNumber: "ROD 486-1024",
      leadTimeDays: 14,
      unitCost: 450000,
      currency: "NGN",
      onOrder: true,
      onOrderQuantity: 1,
      expectedDate: "2026-09-28",
      notes: "Urgent PO #PO-2026-089 placed with supplier",
    },
    {
      id: nanoid(),
      partNumber: "BRG-STK-7208",
      name: "Angular Contact Spindle Bearings (Matched Pair)",
      description: "Precision spindle bearings for main cutting head.",
      equipmentId: stakoId,
      quantityOnHand: 2,
      minimumQuantity: 2,
      maximumQuantity: 4,
      unit: "set",
      binLocation: "BIN-M12",
      supplierName: "SKF Nigeria Ltd",
      supplierPartNumber: "7208-B-XL-2RS-TVP",
      leadTimeDays: 21,
      unitCost: 185000,
      currency: "NGN",
      onOrder: false,
      notes: "Keep in climate-controlled cabinet until installation",
    },
    {
      id: nanoid(),
      partNumber: "FLT-HYD-10U",
      name: "10-Micron High-Pressure Hydraulic Filter Element",
      description: "Hydraulic power unit return-line filter cartridge.",
      equipmentId: stakoId,
      quantityOnHand: 1,
      minimumQuantity: 3,
      maximumQuantity: 6,
      unit: "ea",
      binLocation: "BIN-H01",
      supplierName: "Hydraflow Systems",
      supplierPartNumber: "HF-010-P",
      leadTimeDays: 7,
      unitCost: 42000,
      currency: "NGN",
      onOrder: true,
      onOrderQuantity: 5,
      expectedDate: "2026-09-20",
    },
    {
      id: nanoid(),
      partNumber: "SEAL-GEN-120",
      name: "Main Chuck Hydraulic Cylinder Seal Kit",
      description: "Nitrile/PTFE hydraulic seal replacement kit for Gennari vertical chuck.",
      equipmentId: gennariId,
      quantityOnHand: 1,
      minimumQuantity: 2,
      maximumQuantity: 4,
      unit: "kit",
      binLocation: "BIN-H08",
      supplierName: "Parker Hannifin",
      supplierPartNumber: "PK-CYL-120-SK",
      leadTimeDays: 10,
      unitCost: 78000,
      currency: "NGN",
      onOrder: false,
    },
    {
      id: nanoid(),
      partNumber: "SOL-24V-D03",
      name: "Directional Control Solenoid Valve (24V DC)",
      description: "4-way 3-position directional valve for table clamping circuit.",
      equipmentId: gennariId,
      quantityOnHand: 3,
      minimumQuantity: 2,
      maximumQuantity: 5,
      unit: "ea",
      binLocation: "BIN-E09",
      supplierName: "Bosch Rexroth",
      supplierPartNumber: "4WE6D6X/EG24N9K4",
      leadTimeDays: 5,
      unitCost: 125000,
      currency: "NGN",
      onOrder: false,
    },
    {
      id: nanoid(),
      partNumber: "BLT-TIM-H150",
      name: "Spindle Synchronous Timing Belt H150",
      description: "Heavy-duty polyurethane timing belt for JOBS milling head transmission.",
      equipmentId: jobsId,
      quantityOnHand: 1,
      minimumQuantity: 2,
      maximumQuantity: 4,
      unit: "ea",
      binLocation: "BIN-M05",
      supplierName: "Gates PowerGrip",
      supplierPartNumber: "300-H-150",
      leadTimeDays: 12,
      unitCost: 65000,
      currency: "NGN",
      onOrder: false,
    },
    {
      id: nanoid(),
      partNumber: "SW-PROX-M18",
      name: "Inductive Proximity Sensor M18 PNP NO",
      description: "Bed limit switch sensor for JOBS boring axis travel limits.",
      equipmentId: jobsId,
      quantityOnHand: 4,
      minimumQuantity: 2,
      maximumQuantity: 8,
      unit: "ea",
      binLocation: "BIN-E02",
      supplierName: "IFM Electronic",
      supplierPartNumber: "IG5401",
      leadTimeDays: 3,
      unitCost: 38000,
      currency: "NGN",
      onOrder: false,
    },
    {
      id: nanoid(),
      partNumber: "BLD-COL-0350",
      name: "Colgar Shear Upper Blade Set (3100mm)",
      description: "Hardened tool-steel upper cutting blade set for Colgar guillotine shear.",
      equipmentId: colgarId,
      quantityOnHand: 1,
      minimumQuantity: 1,
      maximumQuantity: 2,
      unit: "set",
      binLocation: "RACK-HVY-02",
      supplierName: "Colgar International",
      supplierPartNumber: "BLD-3100-HCHCR",
      leadTimeDays: 30,
      unitCost: 980000,
      currency: "NGN",
      onOrder: false,
    },
    {
      id: nanoid(),
      partNumber: "SEAL-SRT-300",
      name: "Sertom Plate Roll Hydraulic Piston Seals (300mm)",
      description: "Heavy duty Chevron packing set for main roll bending cylinders.",
      equipmentId: sertomId,
      quantityOnHand: 2,
      minimumQuantity: 2,
      maximumQuantity: 4,
      unit: "set",
      binLocation: "BIN-H15",
      supplierName: "Sertom Parts Division",
      supplierPartNumber: "SRT-CHP-300",
      leadTimeDays: 25,
      unitCost: 340000,
      currency: "NGN",
      onOrder: false,
    },
    {
      id: nanoid(),
      partNumber: "LUB-ISO-VG68",
      name: "Mobil DTE 26 Hydraulic Oil (20L Drum)",
      description: "Anti-wear hydraulic fluid for machine tool hydraulic systems.",
      equipmentId: null, // General workshop stock
      quantityOnHand: 6,
      minimumQuantity: 4,
      maximumQuantity: 12,
      unit: "drum",
      binLocation: "OIL-BAY-01",
      supplierName: "TotalEnergies Lubricants",
      supplierPartNumber: "MOB-DTE-26-20L",
      leadTimeDays: 2,
      unitCost: 95000,
      currency: "NGN",
      onOrder: false,
    },
    {
      id: nanoid(),
      partNumber: "FUS-690V-32A",
      name: "Bussmann High Speed Fuse 690V 32A",
      description: "Semiconductor protection cartridge fuse for motor drive panels.",
      equipmentId: null,
      quantityOnHand: 8,
      minimumQuantity: 6,
      maximumQuantity: 20,
      unit: "ea",
      binLocation: "BIN-E01",
      supplierName: "Eaton Electrical",
      supplierPartNumber: "170M1562",
      leadTimeDays: 4,
      unitCost: 18000,
      currency: "NGN",
      onOrder: false,
    }
  ];

  for (const item of sparesList) {
    // Check if partNumber exists
    const existing = await db.select().from(spareParts).where(eq(spareParts.partNumber, item.partNumber));
    if (existing.length === 0) {
      await db.insert(spareParts).values(item);
    }
  }

  console.log(`✅ Seeded ${sparesList.length} critical spares!`);
}

if (require.main === module) {
  seedCriticalSpares()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
