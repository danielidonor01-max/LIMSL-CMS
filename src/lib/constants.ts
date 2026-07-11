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
  OTHER: "Other",
};

export const EQUIPMENT_STATUS_LABELS: Record<string, string> = {
  OPERATIONAL: "Operational",
  UNDER_MAINTENANCE: "Under Maintenance",
  BROKEN_DOWN: "Broken Down",
  AWAITING_PARTS: "Awaiting Parts",
  DECOMMISSIONED: "Decommissioned",
};

export const EQUIPMENT_STATUS_BADGE: Record<string, string> = {
  OPERATIONAL: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  UNDER_MAINTENANCE: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  BROKEN_DOWN: "bg-rose-500/10 text-rose-600 border-rose-500/20",
  AWAITING_PARTS: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  DECOMMISSIONED: "bg-slate-500/10 text-slate-500 border-slate-500/20",
};

// ─── Maintenance schedule ───────────────────────────────────────────────────
export const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  PM: "Preventive Maintenance",
  INS: "Compliance Inspection",
  CM: "Corrective Maintenance",
  PRS: "Preservative Maintenance",
};

export const ACTIVITY_TYPE_BADGE: Record<string, string> = {
  PM: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  INS: "bg-sky-500/10 text-sky-600 border-sky-500/20",
  CM: "bg-rose-500/10 text-rose-600 border-rose-500/20",
  PRS: "bg-violet-500/10 text-violet-700 border-violet-500/20",
};

export const SCHEDULE_STATUS_LABELS: Record<string, string> = {
  SCHEDULED: "Scheduled",
  COMPLETED: "Completed",
  OVERDUE: "Overdue",
  MISSED: "Missed",
  RESCHEDULED: "Rescheduled",
};

export const SCHEDULE_STATUS_BADGE: Record<string, string> = {
  SCHEDULED: "bg-sky-500/10 text-sky-600 border-sky-500/20",
  COMPLETED: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  OVERDUE: "bg-rose-500/10 text-rose-600 border-rose-500/20",
  MISSED: "bg-rose-500/10 text-rose-600 border-rose-500/20",
  RESCHEDULED: "bg-amber-500/10 text-amber-600 border-amber-500/20",
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
  PREVENTIVE: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  CORRECTIVE: "bg-rose-500/10 text-rose-600 border-rose-500/20",
  INSPECTION: "bg-sky-500/10 text-sky-600 border-sky-500/20",
  EMERGENCY: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  CALIBRATION: "bg-violet-500/10 text-violet-700 border-violet-500/20",
};

export const WO_STATUS_LABELS: Record<string, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  PENDING_APPROVAL: "Pending Approval",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export const WO_STATUS_BADGE: Record<string, string> = {
  OPEN: "bg-sky-500/10 text-sky-600 border-sky-500/20",
  IN_PROGRESS: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  PENDING_APPROVAL: "bg-violet-500/10 text-violet-700 border-violet-500/20",
  COMPLETED: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  CANCELLED: "bg-slate-500/10 text-slate-500 border-slate-500/20",
};

export const PRIORITY_LABELS: Record<string, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  CRITICAL: "Critical",
};

export const PRIORITY_BADGE: Record<string, string> = {
  LOW: "bg-slate-500/10 text-slate-500 border-slate-500/20",
  MEDIUM: "bg-sky-500/10 text-sky-600 border-sky-500/20",
  HIGH: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  CRITICAL: "bg-rose-500/10 text-rose-600 border-rose-500/20",
};

// Option lists for <select> inputs
export const WO_TYPE_OPTIONS = Object.keys(WO_TYPE_LABELS);
export const PRIORITY_OPTIONS = Object.keys(PRIORITY_LABELS);

export const QUARTER_LABELS: Record<number, string> = {
  1: "Q1 (Jan–Mar)",
  2: "Q2 (Apr–Jun)",
  3: "Q3 (Jul–Sep)",
  4: "Q4 (Oct–Dec)",
};

export const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
