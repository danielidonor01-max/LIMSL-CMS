// src/lib/constants.ts
// Shared Phase 2 labels, option lists, and Tailwind badge classes.
// Kept additive (new file) so it never collides with Phase 1 work.

// ─── Equipment ──────────────────────────────────────────────────────────────
export const EQUIPMENT_CATEGORY_LABELS: Record<string, string> = {
  CNC_LIGHT: "CNC Light Duty",
  CNC_HEAVY: "CNC Heavy Duty",
  PRESS_ROLL_SHEAR: "Press / Roll / Shear",
  WELDING: "Welding Machines",
  CRANE: "Cranes & Lifting",
  COMPRESSOR: "Air Compressors",
  ELECTRICAL_PANEL: "Electrical Panels",
  EARTHING: "Earthing & Lightning",
  FACILITY_AC: "Facility AC / LV",
  MEASURING: "Measuring Instruments",
  SYSTEM: "Facility Systems",
  OTHER: "Other",
};

export const DEFAULT_CATEGORY_START_DATES: Record<string, string> = {
  CNC_HEAVY: "2026-01-14",
  CRANE: "2026-01-20",
  PRESS_ROLL_SHEAR: "2026-01-26",
  OTHER: "2026-01-27",
  FACILITY_AC: "2026-02-09",
  COMPRESSOR: "2026-02-12",
  WELDING: "2026-02-16",
  SYSTEM: "2026-02-01",
  MEASURING: "2026-03-03",
  CNC_LIGHT: "2026-03-10",
  ELECTRICAL_PANEL: "2026-03-18",
  EARTHING: "2026-04-22",
};

export const DEFAULT_CATEGORY_FREQUENCIES: Record<string, string> = {
  CNC_HEAVY: "QUARTERLY",
  CRANE: "BI_MONTHLY",
  PRESS_ROLL_SHEAR: "QUARTERLY",
  OTHER: "QUARTERLY",
  FACILITY_AC: "BI_MONTHLY",
  COMPRESSOR: "QUARTERLY",
  WELDING: "BI_MONTHLY",
  SYSTEM: "QUARTERLY",
  MEASURING: "SEMI_ANNUAL",
  CNC_LIGHT: "QUARTERLY",
  ELECTRICAL_PANEL: "QUARTERLY",
  EARTHING: "ANNUAL",
};

export const EQUIPMENT_STATUS_LABELS: Record<string, string> = {
  OPERATIONAL: "Operational",
  UNDER_MAINTENANCE: "Under Maintenance",
  BROKEN_DOWN: "Broken Down",
  AWAITING_PARTS: "Awaiting Parts",
  DECOMMISSIONED: "Decommissioned",
};

export const EQUIPMENT_STATUS_BADGE: Record<string, string> = {
  OPERATIONAL: "bg-brand-500/10 text-brand-700 border-brand-500/20",
  UNDER_MAINTENANCE: "bg-warn-500/10 text-warn-700 border-warn-500/20",
  BROKEN_DOWN: "bg-danger-500/10 text-danger-700 border-danger-500/20",
  AWAITING_PARTS: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  DECOMMISSIONED: "bg-ink-500/10 text-ink-500 border-ink-500/20",
};

// Criticality is a business judgement, so it is spelled out rather than shown as
// an enum: "HIGH" tells a new foreman nothing about what to do differently.
export const CRITICALITY_LABELS: Record<string, string> = {
  CRITICAL: "Critical, production stops",
  HIGH: "High, major disruption",
  MEDIUM: "Medium, work-around exists",
  LOW: "Low, little impact",
};

export const CRITICALITY_SHORT: Record<string, string> = {
  CRITICAL: "Critical",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
};

// The registry hand-rolled this and had no branch for CRITICAL, so the most
// important level rendered in the same grey as the least.
export const CRITICALITY_BADGE: Record<string, string> = {
  CRITICAL: "bg-danger-500/10 text-danger-700 border-danger-500/20",
  HIGH: "bg-orange-500/10 text-orange-700 border-orange-500/20",
  MEDIUM: "bg-warn-500/10 text-warn-700 border-warn-500/20",
  LOW: "bg-ink-500/10 text-ink-600 border-ink-500/20",
};

export const FREQUENCY_LABELS: Record<string, string> = {
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  BI_MONTHLY: "Every 2 months",
  QUARTERLY: "Quarterly",
  SEMI_ANNUAL: "Every 6 months",
  ANNUAL: "Annually",
};

// ─── Maintenance schedule ───────────────────────────────────────────────────
export const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  PM: "Preventive Maintenance",
  INS: "Compliance Inspection",
  CM: "Corrective Maintenance",
  PRS: "Preservative Maintenance",
};

export const ACTIVITY_TYPE_BADGE: Record<string, string> = {
  PM: "bg-brand-500/10 text-brand-700 border-brand-500/20",
  INS: "bg-info-500/10 text-info-700 border-info-500/20",
  CM: "bg-danger-500/10 text-danger-700 border-danger-500/20",
  PRS: "bg-violet-500/10 text-violet-700 border-violet-500/20",
};

export const SCHEDULE_STATUS_LABELS: Record<string, string> = {
  SCHEDULED: "Scheduled",
  COMPLETED: "Completed",
  OVERDUE: "Overdue",
  MISSED: "Missed",
  RESCHEDULED: "Rescheduled",
  DEFERRED: "Deferred",
};

export const SCHEDULE_STATUS_BADGE: Record<string, string> = {
  SCHEDULED: "bg-info-500/10 text-info-700 border-info-500/20",
  COMPLETED: "bg-brand-500/10 text-brand-700 border-brand-500/20",
  OVERDUE: "bg-danger-500/10 text-danger-700 border-danger-500/20",
  MISSED: "bg-danger-500/10 text-danger-700 border-danger-500/20",
  RESCHEDULED: "bg-warn-500/10 text-warn-700 border-warn-500/20",
  DEFERRED: "bg-violet-500/10 text-violet-700 border-violet-500/20",
};

// ─── Permits ────────────────────────────────────────────────────────────────
// CLOSED_LATE arrived with the lapsed-permit close-out and was missing from the
// page-local badge map, so it rendered with no colour classes at all.
export const PERMIT_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  PENDING_APPROVAL: "Awaiting approval",
  ACTIVE: "Active",
  CLOSED: "Closed",
  CLOSED_LATE: "Closed after expiry",
  CLOSED_WORK_ONGOING: "Closed, work ongoing",
  EXPIRED: "Expired, not closed",
  CANCELLED: "Cancelled",
};

export const PERMIT_STATUS_BADGE: Record<string, string> = {
  DRAFT: "bg-info-500/10 text-info-700 border-info-500/20",
  PENDING_APPROVAL: "bg-warn-500/10 text-warn-700 border-warn-500/20",
  ACTIVE: "bg-brand-500/10 text-brand-700 border-brand-500/20",
  CLOSED: "bg-ink-500/10 text-ink-600 border-ink-500/20",
  CLOSED_LATE: "bg-orange-500/10 text-orange-700 border-orange-500/20",
  CLOSED_WORK_ONGOING: "bg-info-500/10 text-info-700 border-info-500/20",
  EXPIRED: "bg-danger-500/10 text-danger-700 border-danger-500/20",
  CANCELLED: "bg-ink-500/10 text-ink-500 border-ink-500/20",
};

// ─── Controlled documents ───────────────────────────────────────────────────
export const DOC_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  PENDING_APPROVAL: "Awaiting approval",
  APPROVED: "Approved",
  SUPERSEDED: "Superseded",
  REJECTED: "Rejected",
};

// ─── Work method statements ─────────────────────────────────────────────────
// The record page and the library each drew their own pill and printed the raw
// column value inside it, so the safety document that gates a permit announced
// itself as "UNDER_REVIEW".
export const WMS_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  UNDER_REVIEW: "Under review",
  APPROVED: "Approved",
  REJECTED: "Returned",
  SUPERSEDED: "Superseded",
};

export const WMS_STATUS_BADGE: Record<string, string> = {
  DRAFT: "bg-ink-500/10 text-ink-600 border-ink-500/20",
  UNDER_REVIEW: "bg-warn-500/10 text-warn-700 border-warn-500/20",
  APPROVED: "bg-brand-500/10 text-brand-700 border-brand-500/20",
  REJECTED: "bg-danger-500/10 text-danger-700 border-danger-500/20",
  SUPERSEDED: "bg-ink-500/10 text-ink-500 border-ink-500/20",
};

// ─── Work orders ────────────────────────────────────────────────────────────
export const WO_TYPE_LABELS: Record<string, string> = {
  PREVENTIVE: "Preventive",
  CORRECTIVE: "Corrective",
  INSPECTION: "Inspection",
  EMERGENCY: "Emergency",
  CALIBRATION: "Calibration",
};

export const WO_TYPE_BADGE: Record<string, string> = {
  PREVENTIVE: "bg-brand-500/10 text-brand-700 border-brand-500/20",
  CORRECTIVE: "bg-danger-500/10 text-danger-700 border-danger-500/20",
  INSPECTION: "bg-info-500/10 text-info-700 border-info-500/20",
  EMERGENCY: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  CALIBRATION: "bg-violet-500/10 text-violet-700 border-violet-500/20",
};

export const WO_STATUS_LABELS: Record<string, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  PENDING_APPROVAL: "Pending Approval",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  REJECTED: "Rejected",
};

export const WO_STATUS_BADGE: Record<string, string> = {
  OPEN: "bg-info-500/10 text-info-700 border-info-500/20",
  IN_PROGRESS: "bg-warn-500/10 text-warn-700 border-warn-500/20",
  PENDING_APPROVAL: "bg-violet-500/10 text-violet-700 border-violet-500/20",
  COMPLETED: "bg-brand-500/10 text-brand-700 border-brand-500/20",
  CANCELLED: "bg-ink-500/10 text-ink-500 border-ink-500/20",
  REJECTED: "bg-danger-500/10 text-danger-700 border-danger-500/20",
};

export const PRIORITY_LABELS: Record<string, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  CRITICAL: "Critical",
};

export const PRIORITY_BADGE: Record<string, string> = {
  LOW: "bg-ink-500/10 text-ink-500 border-ink-500/20",
  MEDIUM: "bg-info-500/10 text-info-700 border-info-500/20",
  HIGH: "bg-warn-500/10 text-warn-700 border-warn-500/20",
  CRITICAL: "bg-danger-500/10 text-danger-700 border-danger-500/20",
};

// Option lists for <select> inputs
export const WO_TYPE_OPTIONS = Object.keys(WO_TYPE_LABELS);
export const PRIORITY_OPTIONS = Object.keys(PRIORITY_LABELS);

export const QUARTER_LABELS: Record<number, string> = {
  1: "Q1 (Jan-Mar)",
  2: "Q2 (Apr-Jun)",
  3: "Q3 (Jul-Sep)",
  4: "Q4 (Oct-Dec)",
};

export const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
