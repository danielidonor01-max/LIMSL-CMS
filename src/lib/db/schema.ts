// src/lib/db/schema.ts
// Drizzle ORM Schema for LIMSL CMS

import { sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  real,
} from "drizzle-orm/sqlite-core";

// ─── Equipment ─────────────────────────────────────────────────────────────
export const equipment = sqliteTable("equipment", {
  id: text("id").primaryKey(), // nanoid
  assetId: text("asset_id").notNull().unique(), // LEE/PE/XXXX
  name: text("name").notNull(),
  category: text("category").notNull(), // CNC_LIGHT | CNC_HEAVY | WELDING | CRANE | COMPRESSOR | ELECTRICAL_PANEL | EARTHING | FACILITY_AC | MEASURING | PRESS_ROLL_SHEAR | OTHER
  subCategory: text("sub_category"),
  location: text("location"), // Bay 1 | Bay 2 | Bay 3 | Office | Workshop
  bay: text("bay"),
  oem: text("oem"),
  model: text("model"),
  serialNumber: text("serial_number"),
  commissioningDate: text("commissioning_date"), // ISO date string
  warrantyExpiry: text("warranty_expiry"),
  status: text("status").notNull().default("OPERATIONAL"), // OPERATIONAL | UNDER_MAINTENANCE | BROKEN_DOWN | AWAITING_PARTS | DECOMMISSIONED
  lastMaintenanceDate: text("last_maintenance_date"),
  lastUsedDate: text("last_used_date"),
  nextMaintenanceDate: text("next_maintenance_date"),
  maintenanceFrequency: text("maintenance_frequency"), // MONTHLY | BI_MONTHLY | QUARTERLY | SEMI_ANNUAL | ANNUAL
  qrCode: text("qr_code"), // base64 data URL
  photoUrl: text("photo_url"),
  notes: text("notes"),
  criticality: text("criticality").default("MEDIUM"), // LOW | MEDIUM | HIGH | CRITICAL
  requiresCalibration: integer("requires_calibration", { mode: "boolean" }).default(false),
  requiresPremob: integer("requires_premob", { mode: "boolean" }).default(false),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

// ─── Equipment Documents ─────────────────────────────────────────────────────
// Per-machine document register: electrical schematics, operational manuals,
// SOPs, calibration reports, pre-mobilization (premob) reports, etc.
export const equipmentDocuments = sqliteTable("equipment_documents", {
  id: text("id").primaryKey(),
  equipmentId: text("equipment_id").notNull().references(() => equipment.id),
  docType: text("doc_type").notNull(), // ELECTRICAL_SCHEMATIC | OPERATIONAL_MANUAL | SOP | CALIBRATION_REPORT | PREMOB_REPORT | DATASHEET | WARRANTY | OTHER
  title: text("title").notNull(),
  fileUrl: text("file_url"),
  status: text("status").notNull().default("REQUIRED"), // REQUIRED | AVAILABLE | EXPIRED
  issuedDate: text("issued_date"),
  expiryDate: text("expiry_date"),
  revision: text("revision"),
  pdfKind: text("pdf_kind").default("UNKNOWN"), // TEXT_SELECTABLE | IMAGE_ONLY | UNKNOWN — used by the (future) schematic ingestion engine
  notes: text("notes"),
  uploadedBy: text("uploaded_by"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

// ─── Users ─────────────────────────────────────────────────────────────────
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  role: text("role").notNull().default("TECHNICIAN"), // SUPER_ADMIN | COO | FACTORY_MANAGER | MAINTENANCE_MANAGER | FOREMAN | QA_QC | HSE | TECHNICIAN | VIEWER
  jobTitle: text("job_title"),
  department: text("department"), // MAINTENANCE | QA_QC | HSE | FACTORY | MANAGEMENT
  phone: text("phone"),
  whatsapp: text("whatsapp"),
  isActive: integer("is_active", { mode: "boolean" }).default(true),
  mustChangePassword: integer("must_change_password", { mode: "boolean" }).default(false),
  createdBy: text("created_by"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

// ─── Maintenance Schedule ───────────────────────────────────────────────────
export const maintenanceSchedule = sqliteTable("maintenance_schedule", {
  id: text("id").primaryKey(),
  equipmentId: text("equipment_id").notNull().references(() => equipment.id),
  year: integer("year").notNull(),
  quarter: integer("quarter"), // 1 | 2 | 3 | 4
  month: integer("month"),
  plannedDate: text("planned_date").notNull(),
  activityType: text("activity_type").notNull(), // PM | INS | CM | PRS
  taskDescription: text("task_description"),
  maintenanceFrequency: text("maintenance_frequency"),
  responsiblePersonId: text("responsible_person_id").references(() => users.id),
  responsiblePersonName: text("responsible_person_name"),
  status: text("status").notNull().default("SCHEDULED"), // SCHEDULED | COMPLETED | OVERDUE | MISSED | RESCHEDULED
  completedDate: text("completed_date"),
  workOrderId: text("work_order_id"),
  remarks: text("remarks"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

// ─── Work Orders ────────────────────────────────────────────────────────────
export const workOrders = sqliteTable("work_orders", {
  id: text("id").primaryKey(),
  workOrderNumber: text("work_order_number").notNull().unique(), // WO-2026-XXXX
  type: text("type").notNull(), // PREVENTIVE | CORRECTIVE | INSPECTION | EMERGENCY | CALIBRATION
  equipmentId: text("equipment_id").notNull().references(() => equipment.id),
  scheduleId: text("schedule_id").references(() => maintenanceSchedule.id),
  priority: text("priority").notNull().default("MEDIUM"), // LOW | MEDIUM | HIGH | CRITICAL
  status: text("status").notNull().default("OPEN"), // OPEN | IN_PROGRESS | PENDING_APPROVAL | COMPLETED | CANCELLED
  title: text("title").notNull(),
  description: text("description"),
  plannedDate: text("planned_date"),
  startDate: text("start_date"),
  completionDate: text("completion_date"),
  estimatedDuration: real("estimated_duration"), // hours
  actualDuration: real("actual_duration"), // hours
  technicianId: text("technician_id").references(() => users.id),
  technicianName: text("technician_name"),
  supervisorId: text("supervisor_id").references(() => users.id),
  wmsId: text("wms_id"),
  permitId: text("permit_id"),
  cmsId: text("cms_id"), // linked corrective maintenance
  createdBy: text("created_by").references(() => users.id),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

// ─── PM Checklists ──────────────────────────────────────────────────────────
export const pmChecklists = sqliteTable("pm_checklists", {
  id: text("id").primaryKey(),
  workOrderId: text("work_order_id").notNull().references(() => workOrders.id),
  equipmentId: text("equipment_id").notNull().references(() => equipment.id),
  date: text("date").notNull(),
  // Section 2: Safety Pre-Checks
  ptwIssued: integer("ptw_issued", { mode: "boolean" }).default(false),
  lotoApplied: integer("loto_applied", { mode: "boolean" }).default(false),
  ppeWorn: integer("ppe_worn", { mode: "boolean" }).default(false),
  areaSafe: integer("area_safe", { mode: "boolean" }).default(false),
  // Sections 3-6: Inspection results as JSON
  visualInspection: text("visual_inspection"), // JSON array of {item, checkpoint, status, remarks}
  functionalTests: text("functional_tests"), // JSON
  lubrication: text("lubrication"), // JSON
  electricalChecks: text("electrical_checks"), // JSON
  calibrationMeasurements: text("calibration_measurements"), // JSON optional
  // Section 8: Findings
  observations: text("observations"),
  correctiveActionRequired: integer("corrective_action_required", { mode: "boolean" }).default(false),
  actionDescription: text("action_description"),
  sparePartsNeeded: text("spare_parts_needed"),
  // Section 9: Completion
  pmCompleted: integer("pm_completed", { mode: "boolean" }).default(false),
  nextPMDate: text("next_pm_date"),
  technicianSignature: text("technician_signature"), // base64 signature image
  supervisorSignature: text("supervisor_signature"),
  technicianName: text("technician_name"),
  supervisorName: text("supervisor_name"),
  signedAt: text("signed_at"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

// ─── WMS (Work Method Statements) ──────────────────────────────────────────
export const wmsDocuments = sqliteTable("wms_documents", {
  id: text("id").primaryKey(),
  wmsNumber: text("wms_number").notNull().unique(), // WMS-2026-XXXX
  title: text("title").notNull(),
  revision: integer("revision").notNull().default(0),
  machinesScope: text("machines_scope"), // JSON array of equipment names
  equipmentIds: text("equipment_ids"), // JSON array
  purpose: text("purpose"),
  scope: text("scope"),
  mobilization: text("mobilization"),
  equipmentAndTools: text("equipment_and_tools"), // JSON array
  materials: text("materials"), // JSON array
  safetyRequirements: text("safety_requirements"),
  methodology: text("methodology"),
  workProcedureSteps: text("work_procedure_steps"), // JSON array A-G steps
  hseRequirements: text("hse_requirements"),
  qualityControlRequirements: text("quality_control_requirements"),
  emergencyRequirements: text("emergency_requirements"),
  references: text("references"), // JSON array
  status: text("status").notNull().default("DRAFT"), // DRAFT | UNDER_REVIEW | APPROVED | REJECTED | SUPERSEDED
  preparedById: text("prepared_by_id").references(() => users.id),
  preparedByName: text("prepared_by_name"),
  preparedBySignature: text("prepared_by_signature"),
  preparedDate: text("prepared_date"),
  reviewedById: text("reviewed_by_id").references(() => users.id),
  reviewedByName: text("reviewed_by_name"),
  reviewedBySignature: text("reviewed_by_signature"),
  reviewedDate: text("reviewed_date"),
  approvedById: text("approved_by_id").references(() => users.id),
  approvedByName: text("approved_by_name"),
  approvedBySignature: text("approved_by_signature"),
  approvedDate: text("approved_date"),
  rejectionReason: text("rejection_reason"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

// ─── Permits (PTW) ──────────────────────────────────────────────────────────
export const permits = sqliteTable("permits", {
  id: text("id").primaryKey(),
  permitNumber: text("permit_number").notNull().unique(),
  workOrderId: text("work_order_id").references(() => workOrders.id),
  equipmentId: text("equipment_id").notNull().references(() => equipment.id),
  workDescription: text("work_description").notNull(),
  hazardsIdentified: text("hazards_identified"),
  controlMeasures: text("control_measures"),
  lotoApplied: integer("loto_applied", { mode: "boolean" }).default(false),
  ppeRequired: text("ppe_required"), // JSON array
  areaBarricaded: integer("area_barricaded", { mode: "boolean" }).default(false),
  issuedById: text("issued_by_id").references(() => users.id),
  issuedToId: text("issued_to_id").references(() => users.id),
  issuedToName: text("issued_to_name"),
  issuedDate: text("issued_date"),
  expiryDate: text("expiry_date"),
  status: text("status").notNull().default("ACTIVE"), // ACTIVE | EXPIRED | CANCELLED | CLOSED
  closedAt: text("closed_at"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

// ─── Corrective Maintenance (full lifecycle) ────────────────────────────────
export const correctiveMaintenance = sqliteTable("corrective_maintenance", {
  id: text("id").primaryKey(),
  cmrfNumber: text("cmrf_number").notNull().unique(), // LIMSL-MAIN-015 ref
  breakdownId: text("breakdown_id").unique(), // LIMSL-MAIN-016 ref
  rcaId: text("rca_id").unique(), // LIMSL-MAIN-017 ref
  catId: text("cat_id"), // LIMSL-MAIN-018 ref
  workOrderId: text("work_order_id").references(() => workOrders.id),
  equipmentId: text("equipment_id").notNull().references(() => equipment.id),
  reportedById: text("reported_by_id").references(() => users.id),
  reportedByName: text("reported_by_name"),
  reportedDate: text("reported_date").notNull(),
  // Fault Classification
  faultType: text("fault_type"), // ELECTRICAL | MECHANICAL | HYDRAULIC | PNEUMATIC | CONTROL | STRUCTURAL | SAFETY | UNKNOWN
  urgency: text("urgency").notNull().default("MEDIUM"), // CRITICAL | HIGH | MEDIUM | LOW
  faultDescription: text("fault_description"),
  operatingStatusAtFailure: text("operating_status_at_failure"), // RUNNING | IDLE | STARTUP | SHUTDOWN
  observedFault: text("observed_fault"),
  errorCodes: text("error_codes"),
  environmentalCondition: text("environmental_condition"),
  photos: text("photos"), // JSON array of file URLs
  // Downtime metrics
  reportedTime: text("reported_time"),
  technicianArrivalTime: text("technician_arrival_time"),
  repairStartTime: text("repair_start_time"),
  repairCompletedTime: text("repair_completed_time"),
  restoredToServiceTime: text("restored_to_service_time"),
  totalDowntimeHours: real("total_downtime_hours"),
  productionImpact: text("production_impact"),
  // RCA
  evidenceCollected: text("evidence_collected"), // JSON (photos, logs, readings)
  rcaTool: text("rca_tool"), // FIVE_WHYS | FISHBONE | FTA | FMEA | PROCESS_MAPPING
  rcaAnalysis: text("rca_analysis"), // JSON structured analysis
  rootCauseCategory: text("root_cause_category"), // MECHANICAL | ELECTRICAL | HUMAN | PROCEDURAL | ENVIRONMENTAL | DESIGN
  verifiedRootCause: text("verified_root_cause"),
  // Corrective Actions
  correctiveActions: text("corrective_actions"), // JSON [{action, responsible, deadline, status}]
  preventiveActions: text("preventive_actions"), // JSON
  // Repair outcome
  partsReplaced: text("parts_replaced"),
  toolsUsed: text("tools_used"),
  immediateAction: text("immediate_action"),
  repairStatus: text("repair_status"), // FULLY_RESTORED | PARTIALLY_RESTORED | TEMPORARY_FIX | REQUIRES_EXTERNAL_EXPERT
  requiresExternalExpert: integer("requires_external_expert", { mode: "boolean" }).default(false),
  externalExpertDetails: text("external_expert_details"),
  // Sign-offs
  technicianSignature: text("technician_signature"),
  technicianName: text("technician_name"),
  supervisorSignature: text("supervisor_signature"),
  supervisorName: text("supervisor_name"),
  supervisorComments: text("supervisor_comments"),
  effectivenessChecked: integer("effectiveness_checked", { mode: "boolean" }).default(false),
  closeOutDate: text("close_out_date"),
  status: text("status").notNull().default("OPEN"), // OPEN | IN_PROGRESS | PENDING_RCA | PENDING_APPROVAL | CLOSED
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

// ─── KPI Records ────────────────────────────────────────────────────────────
export const kpiRecords = sqliteTable("kpi_records", {
  id: text("id").primaryKey(),
  month: text("month").notNull(), // YYYY-MM
  equipmentId: text("equipment_id").references(() => equipment.id),
  equipmentName: text("equipment_name"),
  assetId: text("asset_id"),
  // Reliability KPIs
  mtbf: real("mtbf"), // hours
  failureRate: real("failure_rate"),
  breakdownFrequency: integer("breakdown_frequency"),
  repeatFailureRate: real("repeat_failure_rate"),
  availability: real("availability"), // 0-1
  // Maintenance KPIs
  mttr: real("mttr"), // hours
  maintenanceBacklog: real("maintenance_backlog"), // man-hours
  pmCompliance: real("pm_compliance"), // 0-1
  inspectionCompliance: real("inspection_compliance"), // 0-1
  // Cost KPIs
  maintenanceCost: real("maintenance_cost"), // NGN
  downtimeCost: real("downtime_cost"),
  productionRevenue: real("production_revenue"),
  // Utilization KPIs
  utilizationRate: real("utilization_rate"), // 0-1
  downtimeHours: real("downtime_hours"),
  remark: text("remark"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

// ─── OEM Registry ──────────────────────────────────────────────────────────
export const oemRegistry = sqliteTable("oem_registry", {
  id: text("id").primaryKey(),
  equipmentId: text("equipment_id").notNull().references(() => equipment.id),
  vendorName: text("vendor_name").notNull(),
  contactPerson: text("contact_person"),
  phone: text("phone"),
  email: text("email"),
  country: text("country"),
  warrantyStart: text("warranty_start"),
  warrantyEnd: text("warranty_end"),
  warrantyScope: text("warranty_scope"),
  warrantyActive: integer("warranty_active", { mode: "boolean" }).default(false),
  avgResponseTimeHrs: real("avg_response_time_hrs"),
  avgSpareLeadTimeDays: real("avg_spare_lead_time_days"),
  notes: text("notes"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

export const oemInterventions = sqliteTable("oem_interventions", {
  id: text("id").primaryKey(),
  oemId: text("oem_id").references(() => oemRegistry.id),
  equipmentId: text("equipment_id").references(() => equipment.id),
  interventionDate: text("intervention_date").notNull(),
  problemDescription: text("problem_description"),
  warrantyStatus: text("warranty_status"), // IN | OUT
  oemNotified: integer("oem_notified", { mode: "boolean" }).default(false),
  responseTimeHrs: real("response_time_hrs"),
  resolutionSummary: text("resolution_summary"),
  closed: integer("closed", { mode: "boolean" }).default(false),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

// ─── Calibration ────────────────────────────────────────────────────────────
export const calibrationRecords = sqliteTable("calibration_records", {
  id: text("id").primaryKey(),
  instrumentName: text("instrument_name").notNull(),
  equipmentId: text("equipment_id").references(() => equipment.id),
  serialNumber: text("serial_number"),
  make: text("make"),
  model: text("model"),
  lastCalibrationDate: text("last_calibration_date"),
  nextCalibrationDate: text("next_calibration_date"),
  calibrationInterval: integer("calibration_interval"), // days
  calibratedBy: text("calibrated_by"),
  certificateNumber: text("certificate_number"),
  certificateUrl: text("certificate_url"),
  status: text("status").default("CURRENT"), // CURRENT | DUE_SOON | OVERDUE | OUT_OF_SERVICE
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

// ─── Non-Conformities ────────────────────────────────────────────────────────
export const nonConformities = sqliteTable("non_conformities", {
  id: text("id").primaryKey(),
  ncNumber: text("nc_number").notNull().unique(),
  type: text("type").notNull(), // MISSED_PM | KPI_BREACH | SAFETY_INCIDENT | OVERDUE_CA | OVERDUE_CALIBRATION | AUDIT_FINDING
  severity: text("severity").notNull().default("MEDIUM"), // LOW | MEDIUM | HIGH | CRITICAL
  detectedDate: text("detected_date").notNull(),
  detectedBy: text("detected_by"),
  relatedEntityType: text("related_entity_type"), // equipment | work_order | kpi | corrective_maintenance
  relatedEntityId: text("related_entity_id"),
  equipmentId: text("equipment_id").references(() => equipment.id),
  description: text("description").notNull(),
  rootCause: text("root_cause"),
  correctiveAction: text("corrective_action"),
  responsiblePersonId: text("responsible_person_id").references(() => users.id),
  targetDate: text("target_date"),
  closeOutDate: text("close_out_date"),
  status: text("status").notNull().default("OPEN"), // OPEN | IN_PROGRESS | CLOSED
  evidence: text("evidence"), // JSON array
  autoDetected: integer("auto_detected", { mode: "boolean" }).default(false),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

// ─── Audit Log ───────────────────────────────────────────────────────────────
export const auditLog = sqliteTable("audit_log", {
  id: text("id").primaryKey(),
  userId: text("user_id"),
  userName: text("user_name"),
  action: text("action").notNull(), // CREATE | UPDATE | DELETE | APPROVE | REJECT | SIGN | LOGIN | LOGOUT
  entityType: text("entity_type").notNull(), // equipment | work_order | wms | permit | corrective_maintenance | etc.
  entityId: text("entity_id"),
  entityDescription: text("entity_description"),
  changes: text("changes"), // JSON diff of what changed
  ipAddress: text("ip_address"),
  timestamp: text("timestamp").notNull().default(sql`(datetime('now'))`),
});

// ─── Risk Register ───────────────────────────────────────────────────────────
export const riskRegister = sqliteTable("risk_register", {
  id: text("id").primaryKey(),
  riskNumber: text("risk_number").notNull(),
  identifiedRisk: text("identified_risk").notNull(),
  type: text("type").default("INTERNAL"), // INTERNAL | EXTERNAL
  associatedRisks: text("associated_risks"),
  affectedProcess: text("affected_process"),
  likelihood: integer("likelihood").notNull(), // 1-5
  consequence: integer("consequence").notNull(), // 1-5
  impactRating: integer("impact_rating").notNull(), // likelihood × consequence
  riskLevel: text("risk_level"), // LOW | MEDIUM | HIGH | CRITICAL
  improvementMeasure: text("improvement_measure"),
  actionToAddressRisk: text("action_to_address_risk"),
  status: text("status").default("OPEN"), // OPEN | IN_PROGRESS | CLOSED
  responsibleProcess: text("responsible_process"),
  proposedDate: text("proposed_date"),
  actualDateAddressed: text("actual_date_addressed"),
  evaluationDate: text("evaluation_date"),
  evaluationStatus: text("evaluation_status"),
  opportunity: text("opportunity"),
  opportunityAction: text("opportunity_action"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

// ─── Training Records ─────────────────────────────────────────────────────────
export const trainingRecords = sqliteTable("training_records", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id),
  employeeName: text("employee_name"),
  trainingTitle: text("training_title").notNull(),
  category: text("category"), // HSE | TECHNICAL | OEM
  type: text("type"), // INTERNAL | EXTERNAL | OEM
  trainer: text("trainer"),
  targetGroup: text("target_group"),
  plannedDate: text("planned_date"),
  actualDate: text("actual_date"),
  duration: text("duration"),
  certificateIssued: integer("certificate_issued", { mode: "boolean" }).default(false),
  certificateUrl: text("certificate_url"),
  status: text("status").default("PLANNED"), // PLANNED | AWAITING_APPROVAL | COMPLETED | CANCELLED
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

// ─── Competency Matrix ────────────────────────────────────────────────────────
// Maps a person to a skill area with an assessed proficiency level and an
// optional re-certification (expiry) date. Drives the training gap analysis.
export const competencyMatrix = sqliteTable("competency_matrix", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id),
  employeeName: text("employee_name").notNull(),
  role: text("role"), // snapshot of role at assessment
  skillArea: text("skill_area").notNull(), // e.g. Electrical Fault Diagnosis, Hydraulics, LOTO/PTW
  category: text("category"), // TECHNICAL | HSE | QA_QC | OEM
  level: integer("level").notNull().default(0), // 0 None · 1 Aware · 2 Competent · 3 Proficient · 4 Expert
  requiredLevel: integer("required_level").default(2),
  assessedBy: text("assessed_by"),
  assessedDate: text("assessed_date"),
  expiryDate: text("expiry_date"), // recertification due date, if any
  notes: text("notes"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

// ─── Schematic Diagrams ──────────────────────────────────────────────────────
export const schematicDiagrams = sqliteTable("schematic_diagrams", {
  id: text("id").primaryKey(),
  equipmentId: text("equipment_id").notNull().references(() => equipment.id),
  title: text("title").notNull(), // e.g. Main Control Panel Wiring
  type: text("type").notNull(), // ELECTRICAL | HYDRAULIC | PNEUMATIC | ASSEMBLY
  sheetNumber: text("sheet_number"),
  fileUrl: text("file_url").notNull(),
  uploadedAt: text("uploaded_at").notNull().default(sql`(datetime('now'))`),
});

// ─── Component Registry (BOM) ────────────────────────────────────────────────
export const componentRegistry = sqliteTable("component_registry", {
  id: text("id").primaryKey(),
  equipmentId: text("equipment_id").notNull().references(() => equipment.id),
  componentTag: text("component_tag").notNull(), // e.g. CB-12, SOL-3, PLC-IN-1
  name: text("name").notNull(), // e.g. Circuit Breaker, Solenoid Valve
  type: text("type").notNull(), // ELECTRICAL | HYDRAULIC | PNEUMATIC | CONTROL | MECHANICAL
  location: text("location"), // e.g. Main Cabinet Panel A
  schematicReference: text("schematic_reference"), // e.g. Sheet 4, Zone C2
  manufacturer: text("manufacturer"),
  modelNumber: text("model_number"),
  technicalSpecs: text("technical_specs"), // JSON string
  status: text("status").default("OPERATIONAL"), // OPERATIONAL | FAULTY | REPLACED
});

// ─── Diagnostic Guides & Hints ────────────────────────────────────────────────
export const diagnosticGuides = sqliteTable("diagnostic_guides", {
  id: text("id").primaryKey(),
  equipmentId: text("equipment_id").notNull().references(() => equipment.id),
  symptom: text("symptom").notNull(), // e.g. X-Axis Overcurrent
  errorCode: text("error_code"), // e.g. E-041
  componentTag: text("component_tag"), // associated component
  probableCause: text("probable_cause").notNull(),
  diagnosticSteps: text("diagnostic_steps").notNull(), // JSON string array of steps
  resolutionAction: text("resolution_action"),
  successCount: integer("success_count").default(0),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

// ─── Multi-level Sign-offs ───────────────────────────────────────────────────
// A configurable approval chain attached to any signable entity (PM checklist,
// corrective maintenance, WMS…). Each row is one step in the chain for one role.
export const signoffs = sqliteTable("signoffs", {
  id: text("id").primaryKey(),
  entityType: text("entity_type").notNull(), // PM_CHECKLIST | CORRECTIVE | WMS | WORK_ORDER
  entityId: text("entity_id").notNull(),
  stepOrder: integer("step_order").notNull(), // 1-based position in the chain
  role: text("role").notNull(), // required role for this step
  roleLabel: text("role_label").notNull(), // e.g. "Performed by", "Verified by", "Approved by"
  required: integer("required", { mode: "boolean" }).notNull().default(true),
  status: text("status").notNull().default("PENDING"), // PENDING | SIGNED | REJECTED
  signedById: text("signed_by_id").references(() => users.id),
  signedByName: text("signed_by_name"),
  signedByRole: text("signed_by_role"),
  signatureData: text("signature_data"), // base64 drawn signature
  comments: text("comments"),
  signedAt: text("signed_at"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

// ─── Schematic Ingestion Jobs (engine scaffolding — disabled until configured) ─
// Queue of schematic PDFs awaiting AI extraction of components / nets / zones.
// Runs only when SCHEMATIC_INGESTION_ENABLED and a provider (e.g. Anthropic) is
// configured; otherwise jobs sit in PENDING for future processing.
export const schematicIngestionJobs = sqliteTable("schematic_ingestion_jobs", {
  id: text("id").primaryKey(),
  equipmentId: text("equipment_id").notNull().references(() => equipment.id),
  documentId: text("document_id").references(() => equipmentDocuments.id),
  fileUrl: text("file_url"),
  pdfKind: text("pdf_kind").default("UNKNOWN"), // TEXT_SELECTABLE | IMAGE_ONLY | UNKNOWN
  provider: text("provider").default("NONE"), // NONE | ANTHROPIC | DOCUMENT_AI | MANUAL
  status: text("status").notNull().default("PENDING"), // PENDING | QUEUED | PROCESSING | NEEDS_REVIEW | CONFIRMED | FAILED | SKIPPED
  attempts: integer("attempts").default(0),
  extractedData: text("extracted_data"), // JSON: {components:[{tag,type,sheet,zone,connectsTo[]}], nets:[]}
  reviewedById: text("reviewed_by_id").references(() => users.id),
  error: text("error"),
  requestedById: text("requested_by_id").references(() => users.id),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

// ─── Equipment Maintenance Procedure (controlled document + revisions) ────────
// The ISO-9001 controlled procedure. Every change is a new revision that must be
// authorised by QA/QC and signed off by Maintenance Manager, Factory Manager and
// COO before it becomes the effective (APPROVED) revision. History is retained.
export const procedureRevisions = sqliteTable("procedure_revisions", {
  id: text("id").primaryKey(),
  code: text("code").notNull().default("LIMSL-MAIN-PROC-001"),
  title: text("title").notNull(),
  revision: integer("revision").notNull(), // 1, 2, 3 …
  contentMarkdown: text("content_markdown").notNull(),
  changeSummary: text("change_summary"),
  status: text("status").notNull().default("DRAFT"), // DRAFT | PENDING_APPROVAL | APPROVED | SUPERSEDED | REJECTED
  preparedById: text("prepared_by_id").references(() => users.id),
  preparedByName: text("prepared_by_name"),
  effectiveDate: text("effective_date"),
  approvedAt: text("approved_at"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

// Type exports
export type Equipment = typeof equipment.$inferSelect;
export type NewEquipment = typeof equipment.$inferInsert;
export type WorkOrder = typeof workOrders.$inferSelect;
export type NewWorkOrder = typeof workOrders.$inferInsert;
export type CorrectiveMaintenance = typeof correctiveMaintenance.$inferSelect;
export type KpiRecord = typeof kpiRecords.$inferSelect;
export type WmsDocument = typeof wmsDocuments.$inferSelect;
export type NonConformity = typeof nonConformities.$inferSelect;
export type EquipmentDocument = typeof equipmentDocuments.$inferSelect;
export type NewEquipmentDocument = typeof equipmentDocuments.$inferInsert;
export type Signoff = typeof signoffs.$inferSelect;
export type NewSignoff = typeof signoffs.$inferInsert;
export type SchematicIngestionJob = typeof schematicIngestionJobs.$inferSelect;
export type User = typeof users.$inferSelect;
export type ProcedureRevision = typeof procedureRevisions.$inferSelect;
export type NewProcedureRevision = typeof procedureRevisions.$inferInsert;
export type SchematicDiagram = typeof schematicDiagrams.$inferSelect;
export type ComponentRegistry = typeof componentRegistry.$inferSelect;
export type DiagnosticGuide = typeof diagnosticGuides.$inferSelect;
export type TrainingRecord = typeof trainingRecords.$inferSelect;
export type NewTrainingRecord = typeof trainingRecords.$inferInsert;
export type CompetencyMatrix = typeof competencyMatrix.$inferSelect;
export type NewCompetencyMatrix = typeof competencyMatrix.$inferInsert;
