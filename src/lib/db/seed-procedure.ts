// src/lib/db/seed-procedure.ts
// Seeds the controlled Equipment & System Maintenance Procedure (Rev 3) with the
// text reproduced from the original LIMSL document. Idempotent.

import { db } from "./index";
import { procedureRevisions, users } from "./schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

const CONTENT = String.raw`# EQUIPMENT AND SYSTEM MAINTENANCE PROCEDURE

**Document No.:** LIMSL-MAIN-PROC-001  **Revision:** 3
**Owner:** Maintenance Department  **Oversight:** Quality Control Unit
**Compliance:** ISO 9001:2015, ISO 45001, ASME VIII Div I, ASME IX, NBIC

## TABLE OF CONTENTS
1.0 INTRODUCTION
2.0 PURPOSE
3.0 SCOPE
4.0 TERMS AND DEFINITIONS
5.0 RESPONSIBILITIES
6.0 EXECUTION PROCESS
  6.1 Overview of the Maintenance Management Process
  6.2 Preventive Maintenance Process (Scheduled Maintenance)
  6.3 Corrective Maintenance Process (Breakdown / Unscheduled Repairs)
  6.4 Predictive Maintenance Process (Condition-Based Maintenance)
  6.5 Calibration Process
  6.6 Inspection Process
  6.7 Documentation and Record Control
  6.8 Installation, Commissioning, and Handover Support
  6.9 Maintenance Key Performance Indicators (KPI Framework)
  6.10 Annual Maintenance Planning and Budgeting
  6.11 OEM Interfacing and Spare Parts Management
  6.12 Safety, Permit-to-Work, and Lockout–Tagout (LOTO)
  6.13 Continuous Improvement and Change Control
  6.14 Equipment Change Management Process
7.0 Inspection & Special Inspections
8.0 Calibration and Metrology
9.0 Spare Parts, Inventory, and Procurement Management
10.0 Budgeting and Resource Planning
11.0 Training and Competency Management
12.0 RACI and Interdepartmental Interfaces
13.0 Forms and Templates
14.0 Equipment & Machine Key Performance Indicators (KPI Framework)
15.0 References

## 1.0 INTRODUCTION
This Equipment and System Maintenance Procedure establishes the standardized process for maintaining all machinery, electrical systems, fabrication equipment, and critical infrastructure within LIMSL's production and manufacturing facility. As a fabrication and engineering company, LIMSL operates a diverse range of equipment, including welding machines, CNC systems, material-forming machines, overhead cranes, air compressors, and electrical protection systems requiring consistent maintenance, inspection, calibration, and compliance oversight to ensure safe, reliable, and efficient operations.

This document is controlled under LIMSL's Quality Management System, with ownership assigned to the Maintenance Department and oversight by the Quality Control Unit. It is subject to periodic review, updating, and approval through the company's formal document control and revision management process to ensure alignment with operational needs, regulatory requirements, and continuous improvement objectives. Ensuring the integrity, reliability, and safety of these machines is essential for operational continuity, product quality, and compliance with international standards such as ISO 9001:2015, ASME VIII div I, and other application codes and standards.

This procedure outlines the standardized approach LIMSL follows for maintaining, inspecting, installing, monitoring, and supporting all equipment and systems within the facility.

## 2.0 PURPOSE
The purpose of this procedure is to define a consistent, comprehensive, and systematic approach to the maintenance, inspection, and calibration of LIMSL's equipment and systems. It aims to ensure operational reliability, equipment safety, compliance with statutory and OEM requirements, and optimal performance of all machinery and electrical infrastructure. Additionally, this procedure establishes clear roles, responsibilities, and reporting mechanisms, integrates performance monitoring through key performance indicators (KPIs), and supports continuous improvement and effective resource planning across all maintenance activities — minimizing capital loss which comes in the form of cost of equipment replacement, man hour loss, and drop in production rate.

## 3.0 SCOPE
This procedure applies to all equipment, systems, and infrastructure within LIMSL's production, fabrication, and office facilities. It covers machinery used in manufacturing and fabrication, including welding machines, CNC lathes and mills, press brakes, shears, rolling machines, band saws, grinders, beveling machines, cold cutters, pipe and column welding machines, and overhead cranes; as well as supporting systems such as air compressors, air conditioning units in offices, and low-voltage (LV) electrical wiring and distribution infrastructure within the buildings.

### 3.1 Equipment and Systems Covered
- Production and fabrication machinery (welding, CNC, bending, cutting, rolling, grinding, etc.)
- Overhead cranes and lifting equipment
- Air compressors and pneumatic systems
- Electrical systems: LV distribution boards, wiring, surge and lightning protection, earthing systems
- Measuring instruments and calibration tools
- HVAC systems (office air conditioning units)

### 3.2 Activities Covered
- Scheduled and unscheduled maintenance (preventive, corrective, and condition-based)
- Inspection and monitoring of equipment and electrical safety systems
- Calibration of measuring tools, welding machines, and overhead cranes
- Installation, commissioning, and setup of machinery and supporting systems
- Documentation, reporting, and performance tracking via KPIs

### 3.3 Departments Involved
- Maintenance Department (planning, execution, and reporting)
- Production / Operations Department (equipment operation and support)
- Quality Department (compliance, audits, calibration)
- HSE Department (safety inspections, permits, and LOTO procedures)
- Procurement / Finance (spare parts, budget management)
- OEM or external service providers for specialized maintenance or calibration

## 4.0 TERMS AND DEFINITIONS
- **ISO (International Organization for Standardization):** An international body that develops and publishes standards for quality, safety, efficiency, and best practices.
- **LIMSL:** LEE International Machinery and Services Limited.
- **PM (Preventive Maintenance):** Scheduled maintenance performed to prevent failures and prolong equipment life.
- **CM (Corrective Maintenance):** Maintenance carried out to restore a failed item to an operational state.
- **CBM (Condition-Based / Predictive Maintenance):** Maintenance triggered by monitored condition indicators (vibration, temperature, current).
- **PTW (Permit-to-Work):** A formal authorisation required before commencing defined maintenance activities.
- **LOTO (Lock-Out / Tag-Out):** The isolation and control of hazardous energy during maintenance.
- **RCA (Root Cause Analysis):** A structured investigation to determine the underlying cause of a failure.
- **KPI (Key Performance Indicator):** A measurable value used to evaluate maintenance performance.
- **OEM (Original Equipment Manufacturer):** The manufacturer of the equipment or its components.

## 5.0 RESPONSIBILITIES
- **Top Management (MD):** Provides strategic direction and approves resources for maintenance activities; ensures maintenance objectives align with organizational and quality objectives.
- **Factory Management / COO:** Acts as the operational link between production and maintenance; reviews maintenance performance, escalates issues, and supports planning and coordination.
- **Maintenance Manager / Electrical Maintenance Supervisor:** Responsible for electrical maintenance planning and execution; supervision of technicians and trainees; compliance with safety, permit-to-work, and isolation procedures; verification of completed maintenance work; maintenance reporting and KPI performance. Serves as the primary point of contact between maintenance, production, HSE, and management.
- **Foreman:** Coordinates day-to-day maintenance execution and verifies technicians' completed work before it proceeds for approval.
- **QA/QC Officer:** Owns document control; verifies records and compliance with ISO 9001:2015; authorises procedure changes and calibration traceability.
- **HSE Officer:** Enforces safety inspections, permits (PTW), and LOTO; signs off on the safety of maintenance work and Work Method Statements.
- **Technicians / Instrumentation Technician:** Execute maintenance, repairs, inspections, calibration, and installations; follow approved work orders, safety procedures, and checklists; record maintenance activities in approved templates.
- **Apprentice / Trainee:** Perform maintenance tasks under supervision and receive structured on-the-job training.

## 6.0 EXECUTION PROCESS
This section outlines the standardized process flow for all maintenance, calibration, installation, and inspection activities at LIMSL. It is designed to operate as an independent, auditable system that supports equipment reliability, safety, traceability, and operational efficiency.

- **6.1 Overview of the Maintenance Management Process** — the end-to-end flow from planning through execution, verification, and record control.
- **6.2 Preventive Maintenance Process** — scheduled tasks from the Annual Master Plan executed against machine-specific checklists, with PTW/LOTO and sign-off.
- **6.3 Corrective Maintenance Process** — breakdown reporting (CMRF), fault identification, RCA (5 Whys / Fishbone / FTA / FMEA), corrective actions, and close-out.
- **6.4 Predictive Maintenance Process** — condition monitoring (vibration, temperature, current) to anticipate failures.
- **6.5 Calibration Process** — calibration of measuring tools and welding/lifting equipment with traceable certificates.
- **6.6 Inspection Process** — compliance and routine inspections.
- **6.7 Documentation and Record Control** — every activity recorded with a controlled document number and retained.
- **6.8 Installation, Commissioning, and Handover Support** — 7-stage commissioning checklist with sign-off.
- **6.9 Maintenance KPI Framework** — 22 KPIs across Reliability, Maintenance, Cost, Safety, and Utilization.
- **6.10 Annual Maintenance Planning and Budgeting.**
- **6.11 OEM Interfacing and Spare Parts Management.**
- **6.12 Safety, Permit-to-Work, and Lockout–Tagout (LOTO).**
- **6.13 Continuous Improvement and Change Control.**
- **6.14 Equipment Change Management Process.**

## 12.0 RACI AND INTERDEPARTMENTAL INTERFACES
Maintenance activities are executed by the Maintenance Team and interface with QA/QC (compliance, audits, calibration, document control), HSE (permits, LOTO, safety inspections), Production/Operations (equipment operation), Procurement/Finance (spares, budget), and OEMs (specialised service). The RACI matrix defines Responsible, Accountable, Consulted, and Informed parties for each maintenance objective.

## 15.0 REFERENCES
- ISO 9001:2015 — Quality Management Systems
- ISO 45001 — Occupational Health and Safety
- ASME VIII Div I, ASME IX, NBIC — applicable design and inspection codes
- OEM equipment manuals and maintenance schedules
- LIMSL Annual Maintenance Master Schedule (LIMSL-MAIN-PLN-013)
- LIMSL Corrective Maintenance & RCA forms (LIMSL-MAIN-015 to 018)

---
*This is a controlled document. Any amendment requires QA/QC authorisation and sign-off by the Maintenance Manager, Factory Manager, and COO before it becomes effective.*`;

export async function seedProcedure() {
  console.log("📘 Seeding Equipment Maintenance Procedure (Rev 3)...");
  const existing = await db.select({ id: procedureRevisions.id }).from(procedureRevisions);
  if (existing.length > 0) {
    console.log(`ℹ️  Procedure already has ${existing.length} revision(s) — skipping.`);
    return;
  }
  const [daniel] = await db.select().from(users).where(eq(users.email, "daniel.idonor@limsl.com")).limit(1);
  await db.insert(procedureRevisions).values({
    id: nanoid(),
    code: "LIMSL-MAIN-PROC-001",
    title: "Equipment and System Maintenance Procedure",
    revision: 3,
    contentMarkdown: CONTENT,
    changeSummary: "Baseline controlled revision (Rev 3) migrated from the original document.",
    status: "APPROVED",
    preparedById: daniel?.id ?? null,
    preparedByName: daniel?.name ?? "Daniel Idonor",
    effectiveDate: new Date().toISOString().slice(0, 10),
    approvedAt: new Date().toISOString(),
  });
  console.log("✅ Procedure Rev 3 seeded (APPROVED)");
}

seedProcedure()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("❌ Procedure seed failed:", e);
    process.exit(1);
  });
