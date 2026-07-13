// src/lib/roles.ts
// Canonical role model for the LIMSL maintenance ecosystem. The system revolves
// around the Maintenance team, QA/QC, and HSE, with an approval chain up through
// Foreman → Maintenance Manager → Factory Manager → COO, and a Super Admin who
// administers user accounts.

export const ROLES = [
  "SUPER_ADMIN",
  "COO",
  "FACTORY_MANAGER",
  "MAINTENANCE_MANAGER",
  "FOREMAN",
  "QA_QC",
  "HSE",
  "TECHNICIAN",
  "VIEWER",
] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  COO: "Chief Operating Officer",
  FACTORY_MANAGER: "Factory Manager",
  MAINTENANCE_MANAGER: "Maintenance Manager",
  FOREMAN: "Foreman",
  QA_QC: "QA/QC Officer",
  HSE: "HSE Officer",
  TECHNICIAN: "Maintenance Technician",
  VIEWER: "Viewer",
};

// Department each role belongs to (for the org context).
export const ROLE_DEPARTMENT: Record<string, string> = {
  SUPER_ADMIN: "MANAGEMENT",
  COO: "MANAGEMENT",
  FACTORY_MANAGER: "FACTORY",
  MAINTENANCE_MANAGER: "MAINTENANCE",
  FOREMAN: "MAINTENANCE",
  QA_QC: "QA_QC",
  HSE: "HSE",
  TECHNICIAN: "MAINTENANCE",
  VIEWER: "—",
};

// Seniority ranking — used for "a manager can also sign a subordinate step".
export const ROLE_RANK: Record<string, number> = {
  TECHNICIAN: 1,
  FOREMAN: 2,
  QA_QC: 3,
  HSE: 3,
  MAINTENANCE_MANAGER: 4,
  FACTORY_MANAGER: 5,
  COO: 6,
  SUPER_ADMIN: 99,
  VIEWER: 0,
};

export const ROLE_BADGE: Record<string, string> = {
  SUPER_ADMIN: "bg-slate-800 text-white border-slate-800",
  COO: "bg-violet-500/10 text-violet-700 border-violet-500/20",
  FACTORY_MANAGER: "bg-sky-500/10 text-sky-700 border-sky-500/20",
  MAINTENANCE_MANAGER: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
  FOREMAN: "bg-teal-500/10 text-teal-700 border-teal-500/20",
  QA_QC: "bg-amber-500/10 text-amber-700 border-amber-500/20",
  HSE: "bg-orange-500/10 text-orange-700 border-orange-500/20",
  TECHNICIAN: "bg-slate-500/10 text-slate-600 border-slate-500/20",
  VIEWER: "bg-slate-500/10 text-slate-500 border-slate-500/20",
};

export const isSuperAdmin = (role?: string | null) => role === "SUPER_ADMIN";

// Super Admin manages user accounts.
export const canManageUsers = (role?: string | null) => role === "SUPER_ADMIN";

// Whether a user with `userRole` may sign a step requiring `stepRole`.
// Exact match; a Super Admin may sign/override any step; a strictly more senior
// role in the same chain may also sign (e.g. Maintenance Manager covers Foreman).
export function canSignStep(userRole: string | null | undefined, stepRole: string): boolean {
  if (!userRole) return false;
  if (userRole === "SUPER_ADMIN") return true;
  if (userRole === stepRole) return true;
  return (ROLE_RANK[userRole] ?? 0) > (ROLE_RANK[stepRole] ?? 0);
}

// ── Path-based access control ─────────────────────────────────────────────────
// Roles listed here see only the allowed path prefixes. Roles NOT listed
// (SUPER_ADMIN + management + maintenance team) have full access. Drives both the
// sidebar nav and the page-level guard so they never disagree.
export const ROLE_ALLOWED_PATHS: Record<string, string[]> = {
  QA_QC: ["/", "/equipment", "/documents", "/procedure", "/schedule", "/work-orders", "/corrective", "/audit", "/kpi", "/reports", "/training"],
  HSE: ["/", "/equipment", "/procedure", "/schedule", "/work-orders", "/corrective", "/wms", "/audit", "/calibration", "/permits", "/training"],
  VIEWER: ["/", "/equipment", "/procedure", "/reports"],
};

export function canAccessPath(role: string | null | undefined, pathname: string): boolean {
  if (!role) return true; // unauthenticated is handled by middleware
  if (pathname === "/login") return true;
  const allowed = ROLE_ALLOWED_PATHS[role];
  if (!allowed) return true; // full-access roles
  return allowed.some((p) => (p === "/" ? pathname === "/" : pathname === p || pathname.startsWith(`${p}/`)));
}

// Roles permitted to create/modify maintenance work (WOs, equipment, PM
// checklists, corrective records). QA/QC and HSE participate via sign-off, not
// direct maintenance writes.
export const MAINTENANCE_WRITE_ROLES = [
  "SUPER_ADMIN",
  "FACTORY_MANAGER",
  "MAINTENANCE_MANAGER",
  "FOREMAN",
  "TECHNICIAN",
];

// Roles permitted to issue / close a Permit-to-Work. Safety documents are owned
// by HSE together with the maintenance supervisory chain.
export const PERMIT_WRITE_ROLES = [
  "SUPER_ADMIN",
  "FACTORY_MANAGER",
  "MAINTENANCE_MANAGER",
  "FOREMAN",
  "HSE",
];

// Roles permitted to manage the training & competency records.
export const TRAINING_WRITE_ROLES = [
  "SUPER_ADMIN",
  "FACTORY_MANAGER",
  "MAINTENANCE_MANAGER",
  "QA_QC",
];
