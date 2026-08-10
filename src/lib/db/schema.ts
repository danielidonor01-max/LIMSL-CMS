// src/lib/db/schema.ts
// Drizzle ORM Schema for LIMSL CMS

import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  integer,
  real,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ─── Equipment ─────────────────────────────────────────────────────────────
export const equipment = pgTable("equipment", {
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
  // Run-hours servicing. A compressor serviced "quarterly" is serviced on the
  // same day whether it ran three shifts or sat idle, which over-services the
  // idle machine and under-services the hard-worked one.
  meterUnit: text("meter_unit"),                              // HOURS | CYCLES | KM
  currentMeter: real("current_meter"),
  meterUpdatedAt: text("meter_updated_at"),
  meterServiceInterval: real("meter_service_interval"),       // units between services
  meterAtLastService: real("meter_at_last_service"),
  // Retiring an asset removes it from every compliance denominator, so it is a
  // decision with the same weight as deferring maintenance and gets the same
  // treatment: a reason, a date, and a name against it.
  decommissionedAt: text("decommissioned_at"),
  decommissionReason: text("decommission_reason"),
  decommissionedById: text("decommissioned_by_id"),
  decommissionedByName: text("decommissioned_by_name"),
  requiresCalibration: boolean("requires_calibration").default(false),
  requiresPremob: boolean("requires_premob").default(false),
  createdAt: text("created_at").notNull().default(sql`to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`),
  updatedAt: text("updated_at").notNull().default(sql`to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`),
}, (t) => [index("equipment_asset_id_idx").on(t.assetId)]);

// ─── Equipment Documents ─────────────────────────────────────────────────────
// Per-machine document register: electrical schematics, operational manuals,
// SOPs, calibration reports, pre-mobilization (premob) reports, etc.
export const equipmentDocuments = pgTable("equipment_documents", {
  id: text("id").primaryKey(),
  equipmentId: text("equipment_id").notNull().references(() => equipment.id),
  docType: text("doc_type").notNull(), // ELECTRICAL_SCHEMATIC | OPERATIONAL_MANUAL | SOP | CALIBRATION_REPORT | PREMOB_REPORT | DATASHEET | WARRANTY | OTHER
  title: text("title").notNull(),
  fileUrl: text("file_url"), // external URL, OR the auth-gated serving path for an uploaded file
  // Uploaded-file metadata (via the storage layer, local disk or cloud).
  fileKey: text("file_key"), // opaque storage key
  fileName: text("file_name"), // original filename
  mimeType: text("mime_type"),
  fileSize: integer("file_size"), // bytes
  status: text("status").notNull().default("REQUIRED"), // REQUIRED | AVAILABLE | EXPIRED
  issuedDate: text("issued_date"),
  expiryDate: text("expiry_date"),
  revision: text("revision"),
  pdfKind: text("pdf_kind").default("UNKNOWN"), // TEXT_SELECTABLE | IMAGE_ONLY | UNKNOWN, used by the (future) schematic ingestion engine
  notes: text("notes"),
  uploadedBy: text("uploaded_by"),
  createdAt: text("created_at").notNull().default(sql`to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`),
  updatedAt: text("updated_at").notNull().default(sql`to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`),
}, (t) => [index("equipment_documents_equipment_idx").on(t.equipmentId)]);

// ─── Users ─────────────────────────────────────────────────────────────────
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  role: text("role").notNull().default("TECHNICIAN"), // SUPER_ADMIN | COO | FACTORY_MANAGER | MAINTENANCE_MANAGER | FOREMAN | QA_QC | HSE | TECHNICIAN | VIEWER
  jobTitle: text("job_title"),
  department: text("department"), // MAINTENANCE | QA_QC | HSE | FACTORY | MANAGEMENT
  phone: text("phone"),
  whatsapp: text("whatsapp"),
  preferences: text("preferences"), // JSON: per-user prefs (landing, density, notify), see src/lib/user-prefs.ts
  isActive: boolean("is_active").default(true),
  mustChangePassword: boolean("must_change_password").default(false),
  createdBy: text("created_by"),
  createdAt: text("created_at").notNull().default(sql`to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`),
});

// ─── Maintenance Schedule ───────────────────────────────────────────────────
export const maintenanceSchedule = pgTable("maintenance_schedule", {
  id: text("id").primaryKey(),
  equipmentId: text("equipment_id").notNull().references(() => equipment.id),
  year: integer("year").notNull(),
  quarter: integer("quarter"), // 1 | 2 | 3 | 4
  month: integer("month"),
  plannedDate: text("planned_date").notNull(),
  activityType: text("activity_type").notNull(), // PM | INS | CM | PRS
  taskDescription: text("task_description"),
  maintenanceFrequency: text("maintenance_frequency"),
  // The accountable person. One name, because "the maintenance team" cannot be
  // asked why a PM was missed.
  responsiblePersonId: text("responsible_person_id").references(() => users.id),
  responsiblePersonName: text("responsible_person_name"),
  // Others working the job. They are notified and can complete the work, but
  // accountability stays with the person above, which is what an auditor traces.
  assistantIds: text("assistant_ids"), // JSON array of user ids
  status: text("status").notNull().default("SCHEDULED"), // SCHEDULED | COMPLETED | OVERDUE | MISSED | RESCHEDULED
  completedDate: text("completed_date"),
  // Schedule adherence. "Completed" alone says nothing about WHEN: a PM planned
  // for January and done in June counted as fully compliant, which made the
  // headline ISO metric unfalsifiable. daysLate is stamped at completion and
  // compliance is judged against a frequency-scaled window.
  daysLate: integer("days_late"),
  // A deferral is a decision someone must own, a risk accepted, approved and
  // reviewed. Without it, deferral happens by silence and never appears in any
  // register. Status gains DEFERRED alongside SCHEDULED/COMPLETED/OVERDUE.
  deferredReason: text("deferred_reason"),
  deferredById: text("deferred_by_id"),
  deferredByName: text("deferred_by_name"),
  deferredAt: text("deferred_at"),
  deferredReviewDate: text("deferred_review_date"),
  workOrderId: text("work_order_id"),
  remarks: text("remarks"),
  createdAt: text("created_at").notNull().default(sql`to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`),
}, (t) => [index("maintenance_schedule_equipment_idx").on(t.equipmentId)]);

// ─── Work Orders ────────────────────────────────────────────────────────────
export const workOrders = pgTable("work_orders", {
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
  // Others on the job. Notified alongside the lead, but accountability for the
  // work order stays with technicianId.
  assistantIds: text("assistant_ids"), // JSON array of user ids
  supervisorId: text("supervisor_id").references(() => users.id),
  // Management authorising commencement. The work order IS that authorisation
  // at LIMSL, so it is raised as PENDING_APPROVAL and nothing downstream (a
  // method statement, a job hazard analysis, a permit, or the work itself) may
  // proceed until it is approved.
  approvedById: text("approved_by_id").references(() => users.id),
  approvedByName: text("approved_by_name"),
  approvedAt: text("approved_at"),
  rejectedReason: text("rejected_reason"),
  wmsId: text("wms_id"),
  permitId: text("permit_id"),
  cmsId: text("cms_id"), // linked corrective maintenance
  createdBy: text("created_by").references(() => users.id),
  createdAt: text("created_at").notNull().default(sql`to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`),
  updatedAt: text("updated_at").notNull().default(sql`to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`),
}, (t) => [index("work_orders_equipment_idx").on(t.equipmentId)]);

// ─── PM Checklists ──────────────────────────────────────────────────────────
export const pmChecklists = pgTable("pm_checklists", {
  id: text("id").primaryKey(),
  workOrderId: text("work_order_id").notNull().references(() => workOrders.id),
  equipmentId: text("equipment_id").notNull().references(() => equipment.id),
  date: text("date").notNull(),
  // Section 2: Safety Pre-Checks
  ptwIssued: boolean("ptw_issued").default(false),
  lotoApplied: boolean("loto_applied").default(false),
  ppeWorn: boolean("ppe_worn").default(false),
  areaSafe: boolean("area_safe").default(false),
  // Sections 3-6: Inspection results as JSON
  visualInspection: text("visual_inspection"), // JSON array of {item, checkpoint, status, remarks}
  functionalTests: text("functional_tests"), // JSON
  lubrication: text("lubrication"), // JSON
  electricalChecks: text("electrical_checks"), // JSON
  calibrationMeasurements: text("calibration_measurements"), // JSON optional
  // Section 8: Findings
  observations: text("observations"),
  correctiveActionRequired: boolean("corrective_action_required").default(false),
  actionDescription: text("action_description"),
  sparePartsNeeded: text("spare_parts_needed"),
  // Section 9: Completion
  pmCompleted: boolean("pm_completed").default(false),
  nextPMDate: text("next_pm_date"),
  technicianSignature: text("technician_signature"), // base64 signature image
  supervisorSignature: text("supervisor_signature"),
  technicianName: text("technician_name"),
  supervisorName: text("supervisor_name"),
  signedAt: text("signed_at"),
  createdAt: text("created_at").notNull().default(sql`to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`),
}, (t) => [index("pm_checklists_work_order_idx").on(t.workOrderId)]);

// ─── WMS (Work Method Statements) ──────────────────────────────────────────
export const wmsDocuments = pgTable("wms_documents", {
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
  createdAt: text("created_at").notNull().default(sql`to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`),
  updatedAt: text("updated_at").notNull().default(sql`to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`),
});

// ─── Permits (PTW) ──────────────────────────────────────────────────────────
// ─── Job Hazard Analysis ─────────────────────────────────────────────────────
// The third document in the chain. HSE receives an approved Work Method
// Statement, analyses the job step by step, and that analysis is approved before
// any permit can be raised against it. It used to be three free-text boxes typed
// into the permit itself, which meant the JHA was never reviewed by anyone: it
// arrived already attached to the thing it was supposed to gate.
export const jhaDocuments = pgTable("jha_documents", {
  id: text("id").primaryKey(),
  jhaNumber: text("jha_number").notNull().unique(), // JHA-2026-XXXX
  title: text("title").notNull(),
  revision: integer("revision").notNull().default(0),
  wmsId: text("wms_id").references(() => wmsDocuments.id),
  workOrderId: text("work_order_id").references(() => workOrders.id),
  equipmentId: text("equipment_id").references(() => equipment.id),
  workArea: text("work_area"),
  // JSON array of { step, hazards, controls, residualRisk, responsible }
  steps: text("steps"),
  ppeRequired: text("ppe_required"), // JSON array of PPE keys
  emergencyArrangements: text("emergency_arrangements"),
  status: text("status").notNull().default("DRAFT"), // DRAFT | UNDER_REVIEW | APPROVED | REJECTED | SUPERSEDED
  preparedById: text("prepared_by_id").references(() => users.id),
  preparedByName: text("prepared_by_name"),
  preparedDate: text("prepared_date"),
  approvedAt: text("approved_at"),
  createdAt: text("created_at").notNull().default(sql`to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`),
}, (t) => [index("jha_wms_idx").on(t.wmsId)]);

export const permits = pgTable("permits", {
  id: text("id").primaryKey(),
  permitNumber: text("permit_number").notNull().unique(),
  // The handwritten task number in the corner of the paper form, kept so a
  // scanned permit and its record can still be matched by eye.
  taskNo: text("task_no"),
  workOrderId: text("work_order_id").references(() => workOrders.id),
  equipmentId: text("equipment_id").notNull().references(() => equipment.id),
  workDescription: text("work_description").notNull(),
  hazardsIdentified: text("hazards_identified"),
  controlMeasures: text("control_measures"),
  // Supporting documents/flow for the permit (shown to every signer):
  //  • an APPROVED Work Method Statement, and
  //  • a structured Job Hazard Analysis, JSON array of
  //    { task, hazards, controls, residualRisk }.
  wmsId: text("wms_id").references(() => wmsDocuments.id),
  jhaId: text("jha_id").references(() => jhaDocuments.id),
  jha: text("jha"), // legacy inline JHA rows, superseded by jhaId
  lotoApplied: boolean("loto_applied").default(false),
  ppeRequired: text("ppe_required"), // JSON array
  areaBarricaded: boolean("area_barricaded").default(false),

  // ── The permit face, as printed ───────────────────────────────────────────
  workTypes: text("work_types"), // JSON array: COLD_WORK | HOT_WORK | CONFINED_SPACE | EXCAVATION | ENERGIZED_SYSTEM
  facility: text("facility"),
  workArea: text("work_area"),
  zoneClassification: text("zone_classification"),
  startDate: text("start_date"),
  startTime: text("start_time"),
  durationHours: real("duration_hours"),
  workerCount: integer("worker_count"),
  permitDepartment: text("permit_department"),
  validityDays: integer("validity_days").notNull().default(7),
  // Tri-state marks keyed by checklist key: YES | NO | NA. A blank is nobody
  // having considered the line, which is not the same as crossing it out.
  documentMarks: text("document_marks"),
  precautionMarks: text("precaution_marks"),
  ppeMarks: text("ppe_marks"),
  additionalRequirements: text("additional_requirements"),

  // ── Validity & Renewal ────────────────────────────────────────────────────
  // One entry per calendar day of the validity period, keyed by date. Weekend
  // days are ordinary days here: the paper grid has a column for them.
  renewalDays: text("renewal_days"),

  // ── Handback, handover and closure ────────────────────────────────────────
  handbackOutcome: text("handback_outcome"), // COMPLETED | SUSPENDED
  handbackReason: text("handback_reason"),
  handbackByName: text("handback_by_name"),
  handbackAt: text("handback_at"),
  handovers: text("handovers"), // JSON array of { from, to, at }
  acceptedByName: text("accepted_by_name"),
  acceptedByDept: text("accepted_by_dept"),
  acceptedAt: text("accepted_at"),

  // ── Supersession ──────────────────────────────────────────────────────────
  // A permit whose week ran out with the job unfinished is closed as work
  // ongoing and continued under a successor. The pair is a chain an auditor can
  // walk in both directions.
  supersedesPermitId: text("supersedes_permit_id"),
  supersededByPermitId: text("superseded_by_permit_id"),
  closureReason: text("closure_reason"), // COMPLETED | WORK_ONGOING | CANCELLED
  closureNote: text("closure_note"),

  issuedById: text("issued_by_id").references(() => users.id),
  // The permit holder: the named, accountable person the permit is issued to. A
  // permit is not valid without one, "Maintenance Team" is not accountable to an
  // auditor, a person is. (issuedToId/issuedToName are the legacy free-text
  // fields, superseded by these; kept only so the migration stays additive.)
  permitHolderId: text("permit_holder_id").references(() => users.id),
  permitHolderName: text("permit_holder_name"),
  // Set when the work is being done by an outside company; insurance and
  // induction are verified against the contractor register before issue.
  contractorId: text("contractor_id"),
  issuedToId: text("issued_to_id").references(() => users.id),
  issuedToName: text("issued_to_name"),
  issuedDate: text("issued_date"),
  expiryDate: text("expiry_date"),
  // PENDING_APPROVAL → ACTIVE → CLOSED, or CANCELLED / EXPIRED.
  // A permit is raised as PENDING_APPROVAL and only becomes ACTIVE (i.e. work may
  // begin) once the full PTW sign-off chain is signed. It only reaches CLOSED once
  // the close-out chain is signed. Neither transition is a manual button.
  status: text("status").notNull().default("PENDING_APPROVAL"),
  approvedAt: text("approved_at"),
  closedAt: text("closed_at"),
  createdAt: text("created_at").notNull().default(sql`to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`),
});

// ─── Corrective Maintenance (full lifecycle) ────────────────────────────────
export const correctiveMaintenance = pgTable("corrective_maintenance", {
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
  // Downtime metrics. downStartAt/downEndAt are full local datetimes ("YYYY-MM-DDTHH:MM")
  // marking when the machine stopped and was restored; totalDowntimeHours is derived
  // from them against the working-hours settings (production time, not wall-clock).
  downStartAt: text("down_start_at"),
  downEndAt: text("down_end_at"),
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
  // Failure taxonomy (ISO 14224-lite). Without these, every failure was one of
  // eight fault types on a machine-level record: you could not see that the
  // same contactor keeps welding shut across three welding sets, or that one
  // CNC has a recurring hydraulic-pump pattern. Two coded fields plus a link to
  // the component registry buy the entire reliability capability, a full
  // five-level hierarchy would be bloat for 33 assets.
  failureMode: text("failure_mode"), // coded, see lib/maintenance/failure-codes.ts
  detectionMethod: text("detection_method"), // OPERATOR | PM_INSPECTION | BREAKDOWN | CONDITION_MONITORING | CALIBRATION | AUDIT
  componentId: text("component_id").references(() => componentRegistry.id),
  verifiedRootCause: text("verified_root_cause"),
  // Corrective Actions
  correctiveActions: text("corrective_actions"), // JSON [{action, responsible, deadline, status}]
  preventiveActions: text("preventive_actions"), // JSON
  // Repair outcome
  partsReplaced: text("parts_replaced"),
  toolsUsed: text("tools_used"),
  immediateAction: text("immediate_action"),
  repairStatus: text("repair_status"), // FULLY_RESTORED | PARTIALLY_RESTORED | TEMPORARY_FIX | REQUIRES_EXTERNAL_EXPERT
  requiresExternalExpert: boolean("requires_external_expert").default(false),
  externalExpertDetails: text("external_expert_details"),
  // Sign-offs
  technicianSignature: text("technician_signature"),
  technicianName: text("technician_name"),
  supervisorSignature: text("supervisor_signature"),
  supervisorName: text("supervisor_name"),
  supervisorComments: text("supervisor_comments"),
  effectivenessChecked: boolean("effectiveness_checked").default(false),
  closeOutDate: text("close_out_date"),
  status: text("status").notNull().default("OPEN"), // OPEN | IN_PROGRESS | PENDING_RCA | PENDING_APPROVAL | CLOSED
  createdAt: text("created_at").notNull().default(sql`to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`),
  updatedAt: text("updated_at").notNull().default(sql`to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`),
}, (t) => [index("corrective_maintenance_equipment_idx").on(t.equipmentId)]);

// ─── KPI Records ────────────────────────────────────────────────────────────
export const kpiRecords = pgTable("kpi_records", {
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
  createdAt: text("created_at").notNull().default(sql`to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`),
});

// ─── OEM Registry ──────────────────────────────────────────────────────────
export const oemRegistry = pgTable("oem_registry", {
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
  warrantyActive: boolean("warranty_active").default(false),
  avgResponseTimeHrs: real("avg_response_time_hrs"),
  avgSpareLeadTimeDays: real("avg_spare_lead_time_days"),
  notes: text("notes"),
  createdAt: text("created_at").notNull().default(sql`to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`),
});

// ─── Contractor control (ISO 45001 8.1.4.2) ─────────────────────────────────
// A contractor register that does not stop anybody working is a spreadsheet.
// The obligation is not to hold certificates; it is to not let someone onto a
// live machine without them, so these rows gate permit issue.
// ─── Escalation state ───────────────────────────────────────────────────────
// What each person was last told, so the next digest can report the CHANGE
// rather than restating the situation. Without this the digest is stateless and
// repeats itself until people stop reading it.
export const escalationDigests = pgTable("escalation_digests", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  scope: text("scope").notNull(),          // OVERDUE | UPCOMING | BREAKDOWN | ...
  itemKeys: text("item_keys").notNull(),   // JSON array of stable per-item keys
  sentAt: text("sent_at").notNull(),
}, (t) => [uniqueIndex("escalation_digests_user_scope_uq").on(t.userId, t.scope)]);

// "Handled, waiting on a part" is not the same as ignored, and a system that
// cannot tell them apart nags the person already dealing with it.
export const escalationSnoozes = pgTable("escalation_snoozes", {
  id: text("id").primaryKey(),
  entityType: text("entity_type").notNull(), // SCHEDULE | CORRECTIVE
  entityId: text("entity_id").notNull(),
  snoozedUntil: text("snoozed_until").notNull(),
  reason: text("reason").notNull(),
  snoozedById: text("snoozed_by_id"),
  snoozedByName: text("snoozed_by_name"),
  createdAt: text("created_at").notNull().default(sql`to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`),
}, (t) => [uniqueIndex("escalation_snoozes_entity_uq").on(t.entityType, t.entityId)]);

// ─── Password reset ─────────────────────────────────────────────────────────
// The token is stored HASHED. A reset table holding usable tokens is a table
// that hands out accounts to anyone who can read it, a database dump, a rogue
// backup, a support engineer with a console. What we keep is a digest we can
// compare against, and the only copy of the real token is the one in the email.
export const passwordResets = pgTable("password_resets", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  tokenHash: text("token_hash").notNull(),
  expiresAt: text("expires_at").notNull(),
  usedAt: text("used_at"),
  requestedIp: text("requested_ip"),
  createdAt: text("created_at").notNull().default(sql`to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`),
}, (t) => [index("password_resets_user_idx").on(t.userId)]);

// Changing the sign-in address is verified at the NEW address before it takes
// effect. Without that, one typo replaces the only route back into the account:
// password recovery emails the address on file, so a wrong address is not an
// inconvenience, it is a lockout with no self-service fix.
export const emailChangeRequests = pgTable("email_change_requests", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  newEmail: text("new_email").notNull(),
  tokenHash: text("token_hash").notNull(),
  expiresAt: text("expires_at").notNull(),
  usedAt: text("used_at"),
  createdAt: text("created_at").notNull().default(sql`to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`),
}, (t) => [index("email_change_user_idx").on(t.userId)]);

export const contractors = pgTable("contractors", {
  id: text("id").primaryKey(),
  companyName: text("company_name").notNull(),
  tradeSpecialty: text("trade_specialty"),
  contactPerson: text("contact_person"),
  phone: text("phone"),
  email: text("email"),
  insuranceProvider: text("insurance_provider"),
  insurancePolicyNumber: text("insurance_policy_number"),
  insuranceExpiryDate: text("insurance_expiry_date"),
  insuranceCoverAmount: text("insurance_cover_amount"),
  inductionDate: text("induction_date"),
  inductionValidUntil: text("induction_valid_until"),
  inductionByName: text("induction_by_name"),
  status: text("status").notNull().default("ACTIVE"),          // ACTIVE | SUSPENDED
  suspensionReason: text("suspension_reason"),
  notes: text("notes"),
  createdAt: text("created_at").notNull().default(sql`to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`),
  updatedAt: text("updated_at").notNull().default(sql`to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`),
});

// Individuals. A new hire sent to site by an otherwise compliant contractor is
// exactly the case a company-level record misses.
export const contractorPersonnel = pgTable("contractor_personnel", {
  id: text("id").primaryKey(),
  contractorId: text("contractor_id").notNull().references(() => contractors.id),
  name: text("name").notNull(),
  jobTitle: text("job_title"),
  inductionDate: text("induction_date"),
  inductionValidUntil: text("induction_valid_until"),
  competencyNotes: text("competency_notes"),
  createdAt: text("created_at").notNull().default(sql`to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`),
}, (t) => [index("contractor_personnel_contractor_idx").on(t.contractorId)]);

// ─── Emergency preparedness (ISO 45001 8.2) ─────────────────────────────────
// The register exists to stop "we have forty fire extinguishers" standing in for
// "forty working fire extinguishers". Readiness, not headcount, is the number.
export const emergencyEquipment = pgTable("emergency_equipment", {
  id: text("id").primaryKey(),
  tagNumber: text("tag_number").notNull(),
  type: text("type").notNull(),
  location: text("location").notNull(),
  description: text("description"),
  manufacturer: text("manufacturer"),
  serialNumber: text("serial_number"),
  capacity: text("capacity"),                                   // e.g. "9 kg", "6 L"
  installedDate: text("installed_date"),
  lastInspectionDate: text("last_inspection_date"),
  inspectionIntervalDays: real("inspection_interval_days"),
  // Charge/refill expiry for extinguishers, use-by for first-aid consumables,
  // battery/pad expiry for an AED.
  expiryDate: text("expiry_date"),
  status: text("status").notNull().default("SERVICEABLE"),      // SERVICEABLE | DEFECTIVE | MISSING | REMOVED
  notes: text("notes"),
  createdAt: text("created_at").notNull().default(sql`to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`),
  updatedAt: text("updated_at").notNull().default(sql`to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`),
}, (t) => [index("emergency_equipment_type_idx").on(t.type)]);

// Each inspection kept as its own row. Overwriting the last-inspected date is
// what destroys the evidence trail an auditor actually asks to see.
export const emergencyInspections = pgTable("emergency_inspections", {
  id: text("id").primaryKey(),
  equipmentId: text("equipment_id").notNull().references(() => emergencyEquipment.id),
  inspectionDate: text("inspection_date").notNull(),
  verdict: text("verdict").notNull().default("PASS"),           // PASS | FAIL
  findings: text("findings"),
  actionTaken: text("action_taken"),
  inspectedById: text("inspected_by_id"),
  inspectedByName: text("inspected_by_name"),
  createdAt: text("created_at").notNull().default(sql`to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`),
}, (t) => [index("emergency_inspections_equipment_idx").on(t.equipmentId)]);

// Drill log. A drill that surfaced problems and closed none of them taught the
// organisation nothing, so deficiencies and their actions live on the record.
export const emergencyDrills = pgTable("emergency_drills", {
  id: text("id").primaryKey(),
  drillType: text("drill_type").notNull(),
  drillDate: text("drill_date").notNull(),
  location: text("location"),
  scenario: text("scenario"),
  participantCount: real("participant_count"),
  evacuationMinutes: real("evacuation_minutes"),
  observations: text("observations"),
  deficiencies: text("deficiencies"),
  correctiveActions: text("corrective_actions"),
  conductedById: text("conducted_by_id"),
  conductedByName: text("conducted_by_name"),
  createdAt: text("created_at").notNull().default(sql`to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`),
});

// ─── Condition monitoring ───────────────────────────────────────────────────
// A measurement point on a machine, "motor drive-end bearing", "main panel
// busbar", with the two thresholds that make a reading actionable.
export const conditionPoints = pgTable("condition_points", {
  id: text("id").primaryKey(),
  equipmentId: text("equipment_id").notNull().references(() => equipment.id),
  name: text("name").notNull(),
  kind: text("kind").notNull(),                    // TEMPERATURE | VIBRATION | CURRENT | ...
  unit: text("unit"),
  alertLimit: real("alert_limit"),
  alarmLimit: real("alarm_limit"),
  intervalDays: real("interval_days"),
  lastReadingDate: text("last_reading_date"),
  notes: text("notes"),
  createdAt: text("created_at").notNull().default(sql`to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`),
}, (t) => [index("condition_points_equipment_idx").on(t.equipmentId)]);

export const conditionReadings = pgTable("condition_readings", {
  id: text("id").primaryKey(),
  pointId: text("point_id").notNull().references(() => conditionPoints.id),
  value: real("value").notNull(),
  takenOn: text("taken_on").notNull(),
  verdict: text("verdict").notNull(),
  notes: text("notes"),
  takenById: text("taken_by_id"),
  takenByName: text("taken_by_name"),
  createdAt: text("created_at").notNull().default(sql`to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`),
}, (t) => [index("condition_readings_point_idx").on(t.pointId)]);

// Every meter reading, so the usage rate is observed rather than assumed.
export const meterReadings = pgTable("meter_readings", {
  id: text("id").primaryKey(),
  equipmentId: text("equipment_id").notNull().references(() => equipment.id),
  reading: real("reading").notNull(),
  readingDate: text("reading_date").notNull(),
  // A replaced meter reads lower than the last one; recorded explicitly so the
  // drop is never mistaken for a data-entry error, or for negative usage.
  isReset: boolean("is_reset").default(false),
  notes: text("notes"),
  recordedById: text("recorded_by_id"),
  recordedByName: text("recorded_by_name"),
  createdAt: text("created_at").notNull().default(sql`to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`),
}, (t) => [index("meter_readings_equipment_idx").on(t.equipmentId)]);

// ─── Critical spares ────────────────────────────────────────────────────────
// AWAITING_PARTS was a status the system could set and count as downtime, with
// nothing behind it: no record of which part, whether it was on order, or
// whether one should have been on the shelf. For a critical machine, a spare
// sitting below its minimum is a predicted outage with a known length, the
// supplier's lead time, and that is the only thing here worth building.
export const spareParts = pgTable("spare_parts", {
  id: text("id").primaryKey(),
  partNumber: text("part_number").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  // The machine this part is held for. Null means a general workshop consumable.
  equipmentId: text("equipment_id").references(() => equipment.id),
  quantityOnHand: real("quantity_on_hand").notNull().default(0),
  minimumQuantity: real("minimum_quantity").notNull().default(0),
  maximumQuantity: real("maximum_quantity"),
  unit: text("unit").default("ea"),
  binLocation: text("bin_location"),
  supplierName: text("supplier_name"),
  supplierPartNumber: text("supplier_part_number"),
  // How long the machine stays down if this part is not on the shelf.
  leadTimeDays: real("lead_time_days"),
  unitCost: real("unit_cost"),
  currency: text("currency").default("NGN"),
  onOrder: boolean("on_order").default(false),
  onOrderQuantity: real("on_order_quantity"),
  expectedDate: text("expected_date"),
  notes: text("notes"),
  createdAt: text("created_at").notNull().default(sql`to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`),
  updatedAt: text("updated_at").notNull().default(sql`to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`),
}, (t) => [index("spare_parts_equipment_idx").on(t.equipmentId)]);

// Every stock change, with who and why. A stock figure nobody can explain is a
// stock figure nobody trusts.
export const sparePartMovements = pgTable("spare_part_movements", {
  id: text("id").primaryKey(),
  sparePartId: text("spare_part_id").notNull().references(() => spareParts.id),
  movementType: text("movement_type").notNull(), // ISSUE | RECEIPT | ADJUSTMENT
  quantity: real("quantity").notNull(),          // signed: negative issues stock
  balanceAfter: real("balance_after").notNull(),
  reason: text("reason"),
  workOrderId: text("work_order_id").references(() => workOrders.id),
  performedById: text("performed_by_id"),
  performedByName: text("performed_by_name"),
  createdAt: text("created_at").notNull().default(sql`to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`),
}, (t) => [index("spare_movements_part_idx").on(t.sparePartId)]);

export const oemInterventions = pgTable("oem_interventions", {
  id: text("id").primaryKey(),
  oemId: text("oem_id").references(() => oemRegistry.id),
  equipmentId: text("equipment_id").references(() => equipment.id),
  interventionDate: text("intervention_date").notNull(),
  problemDescription: text("problem_description"),
  warrantyStatus: text("warranty_status"), // IN | OUT
  oemNotified: boolean("oem_notified").default(false),
  responseTimeHrs: real("response_time_hrs"),
  resolutionSummary: text("resolution_summary"),
  closed: boolean("closed").default(false),
  createdAt: text("created_at").notNull().default(sql`to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`),
});

// ─── Calibration ────────────────────────────────────────────────────────────
export const calibrationRecords = pgTable("calibration_records", {
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
  // ISO 9001 7.1.5.2(a): measurement traceability. "Calibrated by: Ade" is not
  // traceability, the standard the instrument was measured against, and the
  // accredited body that did it, are the evidence an auditor asks for.
  traceableTo: text("traceable_to"), // e.g. "NMI / NIST via ref std SN-4471"
  referenceStandardId: text("reference_standard_id"),
  labName: text("lab_name"),
  labAccreditationNo: text("lab_accreditation_no"),
  accreditationBody: text("accreditation_body"), // e.g. UKAS, NACL, DAkkS
  createdAt: text("created_at").notNull().default(sql`to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`),
});

// Every calibration EVENT, retained forever. calibration_records is the
// instrument master; rolling an instrument forward used to UPDATE that row,
// overwriting the previous date, certificate and result, so a 3-year history
// could never be produced (ISO 9001 7.5.3 + 7.1.5.2). Events are append-only.
export const calibrationEvents = pgTable(
  "calibration_events",
  {
    id: text("id").primaryKey(),
    instrumentId: text("instrument_id").notNull().references(() => calibrationRecords.id),
    calibrationDate: text("calibration_date").notNull(),
    nextCalibrationDate: text("next_calibration_date"),
    // 7.1.5.2: as-found is what proves whether PREVIOUS results were valid.
    asFound: text("as_found"), // IN_TOLERANCE | OUT_OF_TOLERANCE | NOT_CHECKED
    asLeft: text("as_left"), // IN_TOLERANCE | ADJUSTED | REJECTED
    verdict: text("verdict").notNull().default("PASS"), // PASS | FAIL
    readings: text("readings"), // JSON [{point, nominal, measured, tolerance}]
    calibratedBy: text("calibrated_by"),
    calibratedById: text("calibrated_by_id"),
    certificateNumber: text("certificate_number"),
    certificateFileKey: text("certificate_file_key"), // stored via lib/storage
    traceableTo: text("traceable_to"),
    labName: text("lab_name"),
    labAccreditationNo: text("lab_accreditation_no"),
    notes: text("notes"),
    createdAt: text("created_at").notNull().default(sql`to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`),
  },
  (t) => [index("calibration_events_instrument_idx").on(t.instrumentId, t.calibrationDate)],
);

// ISO 45001 8.1.2: an isolation is a list of energy sources made safe, each
// with a lock/tag and a named person who applied and removed it. It was one
// boolean (permits.lotoApplied), indefensible for a shop with electrical,
// hydraulic, pneumatic, stored and gravitational energy on the same machine.
export const isolationPoints = pgTable(
  "isolation_points",
  {
    id: text("id").primaryKey(),
    permitId: text("permit_id").notNull().references(() => permits.id),
    energySource: text("energy_source").notNull(), // ELECTRICAL | HYDRAULIC | PNEUMATIC | MECHANICAL | THERMAL | CHEMICAL | GRAVITY | STORED
    isolationDevice: text("isolation_device").notNull(), // e.g. "MCB DB-3/12", "Valve V-207"
    lockTagNumber: text("lock_tag_number"),
    appliedByName: text("applied_by_name"),
    appliedById: text("applied_by_id"),
    appliedAt: text("applied_at"),
    verifiedZeroEnergy: boolean("verified_zero_energy").notNull().default(false),
    removedByName: text("removed_by_name"),
    removedById: text("removed_by_id"),
    removedAt: text("removed_at"),
    createdAt: text("created_at").notNull().default(sql`to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`),
  },
  (t) => [index("isolation_points_permit_idx").on(t.permitId)],
);

// ─── Non-Conformities ────────────────────────────────────────────────────────
export const nonConformities = pgTable("non_conformities", {
  id: text("id").primaryKey(),
  ncNumber: text("nc_number").notNull().unique(),
  // MISSED_PM | KPI_BREACH | SAFETY_INCIDENT | OVERDUE_CA | OVERDUE_CALIBRATION
  // | CALIBRATION_FAILURE (instrument found out of tolerance, distinct from
  // being merely overdue; triggers the 7.1.5.2 validity assessment) | AUDIT_FINDING
  type: text("type").notNull(),
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
  autoDetected: boolean("auto_detected").default(false),
  createdAt: text("created_at").notNull().default(sql`to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`),
  updatedAt: text("updated_at").notNull().default(sql`to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`),
});

// ─── Audit Log ───────────────────────────────────────────────────────────────
export const auditLog = pgTable("audit_log", {
  id: text("id").primaryKey(),
  userId: text("user_id"),
  userName: text("user_name"),
  action: text("action").notNull(), // CREATE | UPDATE | DELETE | APPROVE | REJECT | SIGN | LOGIN | LOGOUT
  entityType: text("entity_type").notNull(), // equipment | work_order | wms | permit | corrective_maintenance | etc.
  entityId: text("entity_id"),
  entityDescription: text("entity_description"),
  changes: text("changes"), // JSON diff of what changed
  ipAddress: text("ip_address"),
  timestamp: text("timestamp").notNull().default(sql`to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`),
}, (t) => [index("audit_log_user_action_idx").on(t.userId, t.action, t.timestamp)]);

// ─── Risk Register ───────────────────────────────────────────────────────────
export const riskRegister = pgTable("risk_register", {
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
  createdAt: text("created_at").notNull().default(sql`to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`),
  updatedAt: text("updated_at").notNull().default(sql`to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`),
});

// ─── Training Records ─────────────────────────────────────────────────────────
export const trainingRecords = pgTable("training_records", {
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
  certificateIssued: boolean("certificate_issued").default(false),
  certificateUrl: text("certificate_url"),
  status: text("status").default("PLANNED"), // PLANNED | AWAITING_APPROVAL | COMPLETED | CANCELLED
  createdAt: text("created_at").notNull().default(sql`to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`),
});

// ─── Competency Matrix ────────────────────────────────────────────────────────
// Maps a person to a skill area with an assessed proficiency level and an
// optional re-certification (expiry) date. Drives the training gap analysis.
export const competencyMatrix = pgTable("competency_matrix", {
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
  createdAt: text("created_at").notNull().default(sql`to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`),
  updatedAt: text("updated_at").notNull().default(sql`to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`),
});

// ─── Notifications (outbox + in-app inbox) ────────────────────────────────────
// One row per person per notifiable event. It is BOTH the in-app inbox (shown to
// `userId`) and the delivery outbox (WhatsApp). Recorded regardless of whether an
// external channel is configured, so alerts are never silently lost and there is
// an audit trail. deliveryStatus is honest, QUEUED until actually sent.
export const notifications = pgTable(
  "notifications",
  {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id), // recipient (in-app inbox)
  event: text("event").notNull(), // PTW_SIGN_REQUEST | WMS_SIGN_REQUEST | BREAKDOWN | PROCEDURE_SIGN_REQUEST | PM_SIGN_REQUEST | GENERAL
  title: text("title").notNull(),
  body: text("body").notNull(),
  linkPath: text("link_path"), // in-app deep link, e.g. /permits/<id>
  relatedEntityType: text("related_entity_type"),
  relatedEntityId: text("related_entity_id"),
  readAt: text("read_at"), // null = unread in the in-app inbox
  // WhatsApp delivery
  channel: text("channel").notNull().default("WHATSAPP"), // WHATSAPP | EMAIL | INAPP
  recipientContact: text("recipient_contact"), // the resolved WhatsApp number
  deliveryStatus: text("delivery_status").notNull().default("QUEUED"), // QUEUED | SENT | FAILED | SKIPPED
  providerMessageId: text("provider_message_id"),
  deliveryError: text("delivery_error"),
  sentAt: text("sent_at"),
  createdAt: text("created_at").notNull().default(sql`to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`),
  },
  // The inbox is polled per user on every bell refresh.
  (t) => [index("notifications_user_idx").on(t.userId, t.readAt)],
);

// ─── Schematic Diagrams ──────────────────────────────────────────────────────
export const schematicDiagrams = pgTable("schematic_diagrams", {
  id: text("id").primaryKey(),
  equipmentId: text("equipment_id").notNull().references(() => equipment.id),
  title: text("title").notNull(), // e.g. Main Control Panel Wiring
  type: text("type").notNull(), // ELECTRICAL | HYDRAULIC | PNEUMATIC | ASSEMBLY
  sheetNumber: text("sheet_number"),
  fileUrl: text("file_url").notNull(),
  uploadedAt: text("uploaded_at").notNull().default(sql`to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`),
});

// ─── Component Registry (BOM) ────────────────────────────────────────────────
export const componentRegistry = pgTable("component_registry", {
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
  // Exact schematic location (P2-lite): which document/page the component sits
  // on, with its bounding box in PDF points (top-left origin), resolution-
  // independent, so the viewer maps it onto any rendered size. Null for
  // registry entries that only carry a textual schematicReference.
  schematicDocId: text("schematic_doc_id").references(() => equipmentDocuments.id),
  schematicPage: integer("schematic_page"),
  bboxX: real("bbox_x"),
  bboxY: real("bbox_y"),
  bboxW: real("bbox_w"),
  bboxH: real("bbox_h"),
}, (t) => [index("component_registry_equipment_idx").on(t.equipmentId)]);

// ─── Diagnostic Guides & Hints ────────────────────────────────────────────────
export const diagnosticGuides = pgTable("diagnostic_guides", {
  id: text("id").primaryKey(),
  equipmentId: text("equipment_id").notNull().references(() => equipment.id),
  symptom: text("symptom").notNull(), // e.g. X-Axis Overcurrent
  errorCode: text("error_code"), // e.g. E-041
  componentTag: text("component_tag"), // associated component
  probableCause: text("probable_cause").notNull(),
  diagnosticSteps: text("diagnostic_steps").notNull(), // JSON string array of steps
  resolutionAction: text("resolution_action"),
  successCount: integer("success_count").default(0),
  createdAt: text("created_at").notNull().default(sql`to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`),
}, (t) => [index("diagnostic_guides_equipment_idx").on(t.equipmentId)]);

// ─── Multi-level Sign-offs ───────────────────────────────────────────────────
// A configurable approval chain attached to any signable entity (PM checklist,
// corrective maintenance, WMS…). Each row is one step in the chain for one role.
export const signoffs = pgTable(
  "signoffs",
  {
    id: text("id").primaryKey(),
    entityType: text("entity_type").notNull(), // PM_CHECKLIST | CORRECTIVE | WMS | WORK_ORDER
    entityId: text("entity_id").notNull(),
    stepOrder: integer("step_order").notNull(), // 1-based position in the chain
    role: text("role").notNull(), // required role for this step
    roleLabel: text("role_label").notNull(), // e.g. "Performed by", "Verified by", "Approved by"
    required: boolean("required").notNull().default(true),
    // Most steps name a ROLE. A few name a PERSON: the permit holder signs the
    // permit issued to him, and no other technician can sign it for him. Left
    // null the step behaves exactly as before.
    signerUserId: text("signer_user_id").references(() => users.id),
    signerUserName: text("signer_user_name"),
    status: text("status").notNull().default("PENDING"), // PENDING | SIGNED | REJECTED
    signedById: text("signed_by_id").references(() => users.id),
    signedByName: text("signed_by_name"),
    signedByRole: text("signed_by_role"),
    // A step signed by someone other than the role it names, a Super Admin
    // stepping in, or a manager covering an absent junior. The chain's intent
    // still stands: this is an exception, so it is recorded AS an exception with
    // a stated reason, rather than looking identical to a normal signature.
    // Working out that signedByRole ≠ role after the fact is not a control.
    isOverride: boolean("is_override").default(false),
    overrideReason: text("override_reason"),
    signatureData: text("signature_data"), // base64 drawn signature
    comments: text("comments"),
    signedAt: text("signed_at"),
    createdAt: text("created_at").notNull().default(sql`to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`),
  },
  // The unique index is both the duplicate-chain guard (two concurrent
  // ensureSignoffChain calls can no longer both insert a chain) and the lookup
  // index for the app's hottest query, getSignoffChain(entityType, entityId).
  (t) => [uniqueIndex("signoffs_entity_step_uq").on(t.entityType, t.entityId, t.stepOrder)],
);

// Per-series atomic counters backing document numbers (WO-2026-0031 etc.).
// Numbers must NEVER be derived from count() or a max() scan, concurrent
// creates collide, and count-based numbering reuses numbers after deletion.
export const docCounters = pgTable("doc_counters", {
  series: text("series").primaryKey(), // e.g. "WO-2026", "PTW-2026"
  value: integer("value").notNull().default(0),
});

// ─── Schematic Ingestion Jobs (engine scaffolding, disabled until configured) ─
// Queue of schematic PDFs awaiting AI extraction of components / nets / zones.
// Runs only when SCHEMATIC_INGESTION_ENABLED and a provider (e.g. Anthropic) is
// configured; otherwise jobs sit in PENDING for future processing.
export const schematicIngestionJobs = pgTable("schematic_ingestion_jobs", {
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
  createdAt: text("created_at").notNull().default(sql`to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`),
  updatedAt: text("updated_at").notNull().default(sql`to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`),
});

// ─── Equipment Maintenance Procedure (controlled document + revisions) ────────
// The ISO-9001 controlled procedure. Every change is a new revision that must be
// authorised by QA/QC and signed off by Maintenance Manager, Factory Manager and
// COO before it becomes the effective (APPROVED) revision. History is retained.
export const procedureRevisions = pgTable("procedure_revisions", {
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
  createdAt: text("created_at").notNull().default(sql`to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`),
  updatedAt: text("updated_at").notNull().default(sql`to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`),
});

// ─── App Settings ────────────────────────────────────────────────────────────
// Single-row (id = "singleton") organisation settings, administered by the Super
// Admin. The working-hours window drives production-time downtime accounting and
// the availability/MTBF baseline, see src/lib/worktime.ts. Never hardcode these.
export const appSettings = pgTable("app_settings", {
  id: text("id").primaryKey().default("singleton"),
  workDayStart: text("work_day_start").notNull().default("08:00"), // "HH:MM"
  workDayEnd: text("work_day_end").notNull().default("17:00"),
  lunchStart: text("lunch_start").default("12:00"),
  lunchEnd: text("lunch_end").default("13:00"),
  workingDays: text("working_days").notNull().default("[1,2,3,4,5]"), // JSON weekday nums, 0=Sun..6=Sat
  weekendOvertime: boolean("weekend_overtime").notNull().default(false),
  // JSON {event: {enabled, roles|null}}, admin overrides for who gets what;
  // null/absent event = code defaults (see lib/notifications/routing.ts).
  notificationRouting: text("notification_routing"),
  escalationPolicy: text("escalation_policy"),
  updatedById: text("updated_by_id"),
  updatedByName: text("updated_by_name"),
  updatedAt: text("updated_at").notNull().default(sql`to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`),
});

// ─── Document Chunks ─────────────────────────────────────────────────────────
// Retrieval corpus for the troubleshooting module (P0 of the troubleshooting
// engine, see docs/TROUBLESHOOTING-ENGINE.md §2.2). Text documents (manuals,
// SOPs) and the approved maintenance procedure are chunked here; a GIN
// full-text index makes them searchable from /diagnose. equipmentId NULL means
// plant-wide (e.g. the maintenance procedure applies to every machine).
export const documentChunks = pgTable(
  "document_chunks",
  {
    id: text("id").primaryKey(),
    equipmentId: text("equipment_id").references(() => equipment.id),
    documentId: text("document_id").references(() => equipmentDocuments.id),
    sourceType: text("source_type").notNull(), // DOCUMENT | PROCEDURE
    sourceLabel: text("source_label").notNull(), // e.g. "Operating Manual. Stako CNC" / "Maintenance Procedure Rev 2"
    chunkIndex: integer("chunk_index").notNull(),
    heading: text("heading"),
    pageStart: integer("page_start"),
    pageEnd: integer("page_end"),
    content: text("content").notNull(),
    tokenEstimate: integer("token_estimate"),
    createdAt: text("created_at").notNull().default(sql`to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`),
  },
  (t) => [
    index("document_chunks_fts_idx").using("gin", sql`to_tsvector('english', ${t.content})`),
    index("document_chunks_equipment_idx").on(t.equipmentId),
    index("document_chunks_document_idx").on(t.documentId),
  ],
);

// ─── Schematic Tiles ─────────────────────────────────────────────────────────
// P1 of the troubleshooting engine (docs/TROUBLESHOOTING-ENGINE.md §2.3): each
// schematic PDF page is rendered at high DPI and cut into overlapping tiles so
// dense sheets stay legible (full sheets exceed vision/display resolution).
// level 0 = downscaled whole-page preview, 1 = standard tile grid,
// 2 = reserved for the dense-region second pass (P2). Coordinates are pixels in
// the rendered page space (pageWidth × pageHeight at `dpi`), so any point maps
// deterministically to the tile containing it.
export const schematicTiles = pgTable(
  "schematic_tiles",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id").notNull().references(() => equipmentDocuments.id),
    equipmentId: text("equipment_id").notNull().references(() => equipment.id),
    page: integer("page").notNull(), // 1-based PDF page
    tileKey: text("tile_key").notNull(), // p{page}_preview | p{page}_r{row}_c{col}
    level: integer("level").notNull().default(1),
    x: integer("x").notNull(),
    y: integer("y").notNull(),
    w: integer("w").notNull(),
    h: integer("h").notNull(),
    pageWidth: integer("page_width").notNull(), // rendered page size at `dpi`
    pageHeight: integer("page_height").notNull(),
    dpi: integer("dpi").notNull(),
    fileKey: text("file_key").notNull(), // storage key of the PNG crop
    createdAt: text("created_at").notNull().default(sql`to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`),
  },
  (t) => [
    index("schematic_tiles_document_idx").on(t.documentId, t.page),
    index("schematic_tiles_equipment_idx").on(t.equipmentId),
  ],
);

// ─── API Credentials ─────────────────────────────────────────────────────────
// Provider API keys managed from CMS Settings (Super Admin). Keys are stored
// AES-256-GCM-encrypted with a key derived from AUTH_SECRET (src/lib/crypto.ts)
// and are never returned to the client, only `keyHint` (last 4 chars) is.
// Environment variables (e.g. GEMINI_API_KEY) override the DB when set, so
// hosted deployments can keep secrets in platform env if preferred.
export const apiCredentials = pgTable("api_credentials", {
  provider: text("provider").primaryKey(), // GEMINI | ANTHROPIC | ...
  encryptedKey: text("encrypted_key").notNull(), // iv:tag:ciphertext (base64)
  keyHint: text("key_hint").notNull(), // masked preview, e.g. "AIza…f3k9"
  enabled: boolean("enabled").notNull().default(true),
  updatedById: text("updated_by_id"),
  updatedByName: text("updated_by_name"),
  updatedAt: text("updated_at").notNull().default(sql`to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`),
});

// ─── Equipment Log (digital-twin history) ───────────────────────────────────
// The lifetime event log for a machine: PMs, CMs, inspections, accidents,
// transfers, diagnoses, status changes, notes. Populated automatically by the
// maintenance flows AND manually. The history timeline merges these explicit
// entries with events derived from the source tables (work orders, NCs, docs).
export const equipmentLog = pgTable(
  "equipment_log",
  {
    id: text("id").primaryKey(),
    equipmentId: text("equipment_id").notNull().references(() => equipment.id),
    category: text("category").notNull(), // PM | CM | INSPECTION | ACCIDENT | TRANSFER | DIAGNOSIS | STATUS | NOTE | CALIBRATION | DOCUMENT | OTHER
    title: text("title").notNull(),
    detail: text("detail"),
    refType: text("ref_type"), // work_order | corrective_maintenance | diagnosis_session | ...
    refId: text("ref_id"),
    href: text("href"), // in-app deep link
    source: text("source").notNull().default("MANUAL"), // AUTO | MANUAL
    performedById: text("performed_by_id"),
    performedByName: text("performed_by_name"),
    occurredAt: text("occurred_at").notNull(), // when the event happened (ISO)
    metadata: text("metadata"), // JSON
    createdAt: text("created_at").notNull().default(sql`to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`),
  },
  (t) => [index("equipment_log_equipment_idx").on(t.equipmentId)],
);

// ─── Diagnosis Sessions ──────────────────────────────────────────────────────
// A guided (chat-style) AI troubleshooting session: the running conversation,
// the technician's step-by-step feedback, and the outcome. Created only once a
// technician chooses to log the fault and proceed, and it feeds the machine
// log + the diagnostic-guide learning loop on resolution.
export const diagnosisSessions = pgTable(
  "diagnosis_sessions",
  {
    id: text("id").primaryKey(),
    equipmentId: text("equipment_id").notNull().references(() => equipment.id),
    logId: text("log_id"), // the equipment_log DIAGNOSIS entry
    symptom: text("symptom").notNull(),
    status: text("status").notNull().default("OPEN"), // OPEN | RESOLVED | ABANDONED
    messages: text("messages").notNull().default("[]"), // JSON [{role,content,steps?,images?,ts}]
    resolvedCause: text("resolved_cause"),
    resolutionNote: text("resolution_note"),
    startedById: text("started_by_id"),
    startedByName: text("started_by_name"),
    createdAt: text("created_at").notNull().default(sql`to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`),
    updatedAt: text("updated_at").notNull().default(sql`to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`),
  },
  (t) => [index("diagnosis_sessions_equipment_idx").on(t.equipmentId)],
);

// Type exports
export type Equipment = typeof equipment.$inferSelect;
export type NewEquipment = typeof equipment.$inferInsert;
export type WorkOrder = typeof workOrders.$inferSelect;
export type NewWorkOrder = typeof workOrders.$inferInsert;
export type CorrectiveMaintenance = typeof correctiveMaintenance.$inferSelect;
export type KpiRecord = typeof kpiRecords.$inferSelect;
export type WmsDocument = typeof wmsDocuments.$inferSelect;
export type EscalationDigest = typeof escalationDigests.$inferSelect;
export type EscalationSnooze = typeof escalationSnoozes.$inferSelect;
export type EmailChangeRequest = typeof emailChangeRequests.$inferSelect;
export type Contractor = typeof contractors.$inferSelect;
export type NewContractor = typeof contractors.$inferInsert;
export type ContractorPerson = typeof contractorPersonnel.$inferSelect;
export type EmergencyEquipment = typeof emergencyEquipment.$inferSelect;
export type NewEmergencyEquipment = typeof emergencyEquipment.$inferInsert;
export type EmergencyInspection = typeof emergencyInspections.$inferSelect;
export type EmergencyDrill = typeof emergencyDrills.$inferSelect;
export type ConditionPoint = typeof conditionPoints.$inferSelect;
export type ConditionReading = typeof conditionReadings.$inferSelect;
export type MeterReading = typeof meterReadings.$inferSelect;
export type SparePart = typeof spareParts.$inferSelect;
export type NewSparePart = typeof spareParts.$inferInsert;
export type SparePartMovement = typeof sparePartMovements.$inferSelect;
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
export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
export type AppSettings = typeof appSettings.$inferSelect;
export type NewAppSettings = typeof appSettings.$inferInsert;
