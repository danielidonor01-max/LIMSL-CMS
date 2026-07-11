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
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

// ─── Users ─────────────────────────────────────────────────────────────────
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  role: text("role").notNull().default("TECHNICIAN"), // ADMIN | SUPERVISOR | TECHNICIAN | MANAGEMENT | QA_QC | VIEWER
  department: text("department"),
  phone: text("phone"),
  whatsapp: text("whatsapp"),
  isActive: integer("is_active", { mode: "boolean" }).default(true),
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

// Type exports
export type Equipment = typeof equipment.$inferSelect;
export type NewEquipment = typeof equipment.$inferInsert;
export type WorkOrder = typeof workOrders.$inferSelect;
export type NewWorkOrder = typeof workOrders.$inferInsert;
export type CorrectiveMaintenance = typeof correctiveMaintenance.$inferSelect;
export type KpiRecord = typeof kpiRecords.$inferSelect;
export type WmsDocument = typeof wmsDocuments.$inferSelect;
export type NonConformity = typeof nonConformities.$inferSelect;
