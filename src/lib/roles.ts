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
  QA_QC: "QA/QC Supervisor",
  HSE: "HSE Supervisor",
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
  // No VIEWER entry on purpose. A viewer belongs to no department, and the
  // lookups all fall back to "No department" when the role is absent. It
  // previously mapped to ", ", a stray comma standing in for an em dash, which
  // every call site then had to filter out or render as a department name.
};

// Seniority ranking, used for "a manager can also sign a subordinate step".
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
  SUPER_ADMIN: "bg-ink-800 text-white border-ink-800",
  COO: "bg-violet-500/10 text-violet-700 border-violet-500/20",
  FACTORY_MANAGER: "bg-info-500/10 text-info-700 border-info-500/20",
  MAINTENANCE_MANAGER: "bg-brand-500/10 text-brand-700 border-brand-500/20",
  FOREMAN: "bg-teal-500/10 text-teal-700 border-teal-500/20",
  QA_QC: "bg-warn-500/10 text-warn-700 border-warn-500/20",
  HSE: "bg-orange-500/10 text-orange-700 border-orange-500/20",
  TECHNICIAN: "bg-ink-500/10 text-ink-600 border-ink-500/20",
  VIEWER: "bg-ink-500/10 text-ink-500 border-ink-500/20",
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
  // Fail CLOSED on roles this module doesn't know: an unrecognised step role
  // (a typo in a chain definition) must never become a step almost anyone
  // outranks, and an unrecognised user role must never outrank anything.
  const userRank = ROLE_RANK[userRole];
  const stepRank = ROLE_RANK[stepRole];
  if (userRank === undefined || stepRank === undefined) return false;
  return userRank > stepRank;
}

// ── Path-based access control ─────────────────────────────────────────────────
// Roles listed here see only the allowed path prefixes. Roles NOT listed
// (SUPER_ADMIN + management + maintenance team) have full access. Drives both the
// sidebar nav and the page-level guard so they never disagree.
export const ROLE_ALLOWED_PATHS: Record<string, string[]> = {
  // /wms: QA/QC sign every method statement as document control (WMS_CHAIN),
  // so they must be able to open the one they are asked to sign.
  QA_QC: ["/", "/my-tasks", "/incidents", "/approvals", "/equipment", "/documents", "/procedure", "/schedule", "/work-orders", "/corrective", "/wms", "/jha", "/audit", "/kpi", "/reports", "/training", "/spares", "/emergency", "/contractors"],
  HSE: ["/", "/my-tasks", "/incidents", "/approvals", "/equipment", "/procedure", "/schedule", "/work-orders", "/corrective", "/wms", "/jha", "/audit", "/calibration", "/permits", "/training", "/emergency", "/contractors"],
  VIEWER: ["/", "/equipment", "/procedure", "/reports", "/emergency"],
};

// Paths every authenticated role may reach, regardless of scope.
const UNIVERSAL_PATHS = ["/login", "/change-password", "/notifications", "/account", "/offline", "/forgot-password", "/reset-password", "/account/confirm-email"];

// Who may see and propose changes to the asset categories — the categories
// being where every machine's maintenance interval now lives. A change still
// takes the Maintenance Manager's and the QA/QC Supervisor's signatures
// before it touches anything; this is who may open the page and ask.
//
// The page sits under /settings, which is otherwise Super Admin only. The two
// approvers have to be able to open the change they are asked to sign, so
// this one page is carved out for them rather than moved out of settings.
export const ASSET_CATEGORY_ROLES = [
  "SUPER_ADMIN",
  "FACTORY_MANAGER",
  "MAINTENANCE_MANAGER",
  "QA_QC",
];

export function canAccessPath(role: string | null | undefined, pathname: string): boolean {
  if (!role) return true; // unauthenticated is handled by middleware
  if (UNIVERSAL_PATHS.includes(pathname)) return true;
  // Administration lives under /settings, even "full access" roles must not
  // reach it by direct URL. Mirrors SETTINGS_WRITE_ROLES, which gates the
  // settings API routes.
  if (pathname === "/settings/categories" || pathname.startsWith("/settings/categories/")) {
    return ASSET_CATEGORY_ROLES.includes(role);
  }
  if (pathname === "/settings" || pathname.startsWith("/settings/")) {
    return SETTINGS_WRITE_ROLES.includes(role);
  }
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

// Roles permitted to RAISE (issue) a Permit-to-Work. HSE is the issuing
// authority, they raise the permit and assign a holder. Super Admin can act on
// their behalf.
export const PERMIT_ISSUE_ROLES = ["SUPER_ADMIN", "HSE"];

// Roles permitted to act on an existing permit (cancel). Same as the issuing
// authority, the issuer owns the permit lifecycle.
export const PERMIT_WRITE_ROLES = ["SUPER_ADMIN", "HSE"];

// Roles permitted to RENEW a permit for a further day. The AHS block on the
// paper form is the Maintenance Manager. A foreman may renew a day he is
// supervising, and Super Admin covers an absence, but a technician cannot
// authorise another day of his own work.
export const PERMIT_RENEW_ROLES = [
  "SUPER_ADMIN",
  "FACTORY_MANAGER",
  "MAINTENANCE_MANAGER",
  "FOREMAN",
  "HSE",
];

// Roles permitted to ACCEPT a hand-back, taking the equipment back into custody
// and closing the permit. Handing back is the working party's act and follows
// MAINTENANCE_WRITE_ROLES; accepting it is the receiving authority's, so a
// foreman cannot both hand back his own job and accept it.
export const PERMIT_ACCEPT_ROLES = [
  "SUPER_ADMIN",
  "FACTORY_MANAGER",
  "MAINTENANCE_MANAGER",
  "HSE",
];

// Roles permitted to propose a revision of the maintenance procedure. Document
// control sits with QA/QC under ISO 9001; Super Admin covers an absence.
export const PROCEDURE_CONTROL_ROLES = ["SUPER_ADMIN", "QA_QC"];

// Who may be named as the person carrying out a work order. A job is done by
// the people who hold the tools; naming a manager as the doer would make the
// approval chain sign off on itself.
export const WORK_ORDER_ASSIGNEE_ROLES = ["TECHNICIAN", "FOREMAN"];

// Who may put somebody ELSE's name against a job.
//
// MAINTENANCE_WRITE_ROLES includes TECHNICIAN, because a technician has to be
// able to raise a work order, move a date they cannot meet, and record a
// deferral against their own name. Assigning is not in that family: it decides
// who carries the job, and therefore who carries the consequence, which is a
// supervisory act at LIMSL and everywhere else.
//
// Left alone, the schedule offered every technician an "Assign" control that
// reassigned the accountable person for any activity on the plan, and the route
// behind it accepted the write, because both were reading the maintenance-write
// list. That is the failure this list exists to prevent, and it is the one an
// auditor finds rather than a user: nothing on screen said it was wrong.
// Who decides that a reported breakdown will actually be repaired, which is
// the act that hands it to the Foreman to resource.
//
// LIMSL call this person the final signature manager, and in the corrective
// chain that is the Factory Manager, who also holds the close-out signature on
// the same record. Deliberately narrower than WORK_ASSIGN_ROLES: a Foreman
// resources the repair, he does not authorise it to himself.
export const REPAIR_AUTHORISE_ROLES = ["SUPER_ADMIN", "FACTORY_MANAGER"];

// Who may authorise a ROUTINE repair — one below the threshold, meaning not a
// critical fault and not on a machine the register calls critical. There the
// Maintenance Manager or the Foreman can agree the repair goes ahead
// themselves; waiting for the Factory Manager to approve a routine repair is
// the kind of control that gets worked around. Critical work still needs
// REPAIR_AUTHORISE_ROLES.
export const REPAIR_AUTHORISE_ROUTINE_ROLES = [
  "SUPER_ADMIN",
  "FACTORY_MANAGER",
  "MAINTENANCE_MANAGER",
  "FOREMAN",
];

export const WORK_ASSIGN_ROLES = [
  "SUPER_ADMIN",
  "FACTORY_MANAGER",
  "MAINTENANCE_MANAGER",
  "FOREMAN",
];

// Who may be named as the supervisor verifying a completed PM checklist. The
// technician performs, somebody above him verifies, which is the whole point of
// the second signature.
export const PM_SUPERVISOR_ROLES = ["FOREMAN", "MAINTENANCE_MANAGER", "FACTORY_MANAGER"];

// Who may take a spare part off the register entirely.
//
// Narrower than MAINTENANCE_WRITE_ROLES, which covers issuing and receiving
// stock — the everyday stores work a technician does. Removing the part itself
// is not stores work; it edits what the register says LIMSL holds, and the
// route refuses it outright for any part with movement history.
export const SPARES_DELETE_ROLES = [
  "SUPER_ADMIN",
  "FACTORY_MANAGER",
  "MAINTENANCE_MANAGER",
];

// Roles permitted to manage the training & competency records.
export const TRAINING_WRITE_ROLES = [
  "SUPER_ADMIN",
  "FACTORY_MANAGER",
  "MAINTENANCE_MANAGER",
  "QA_QC",
];

// Roles permitted to write compliance records, non-conformities, risk register,
// and to trigger the compliance auto-detect scan. Owned by QA/QC and HSE together
// with the management chain.
export const COMPLIANCE_WRITE_ROLES = [
  "SUPER_ADMIN",
  "FACTORY_MANAGER",
  "MAINTENANCE_MANAGER",
  "QA_QC",
  "HSE",
];

// Roles permitted to change organisation-wide app settings (working hours,
// production calendar). Administration is the Super Admin's domain.
export const SETTINGS_WRITE_ROLES = ["SUPER_ADMIN"];

// ── Notification audiences ───────────────────────────────────────────────────
// Who hears about an operational event. These were five separate hardcoded
// arrays at the call sites plus a sixth copy in the Settings UI used only for
// display, so the audience shown to an admin could differ from the audience
// that actually received the message, and nothing would report the difference.
//
// SUPER_ADMIN is included deliberately. At LIMSL the account is held by the lead
// maintenance supervisor and engineer, so it is an operational role and not only
// an administrative one, and the system already lets that person sign any step
// in any chain. Being able to act on everything while being told about nothing
// was the contradiction these lists are correcting.
export const BREAKDOWN_NOTIFY_ROLES = [
  "SUPER_ADMIN",
  "MAINTENANCE_MANAGER",
  "FOREMAN",
  "HSE",
];

// A safety incident is HSE's to investigate, but the Factory Manager owns the
// close-out because incidents carry legal weight, so both are told at once. The
// Maintenance Manager is here because most incidents in a fabrication workshop
// happen on or around a machine somebody has to take out of service.
// Reporting is open to every authenticated user; investigating is not. The
// person who saw the event is rarely the person who should be attributing its
// root cause, and on a record that can end up in front of a regulator that
// separation is the point.
export const INCIDENT_INVESTIGATE_ROLES = [
  "SUPER_ADMIN",
  "HSE",
  "FACTORY_MANAGER",
  "MAINTENANCE_MANAGER",
  "COO",
];

export const INCIDENT_NOTIFY_ROLES = [
  "SUPER_ADMIN",
  "HSE",
  "FACTORY_MANAGER",
  "MAINTENANCE_MANAGER",
];

export const MAINTENANCE_ESCALATION_ROLES = [
  "SUPER_ADMIN",
  "MAINTENANCE_MANAGER",
  "FOREMAN",
  "FACTORY_MANAGER",
];

// Calibration and competency expiry, QA/QC owns the record, maintenance owns
// the instrument.
export const COMPLIANCE_ESCALATION_ROLES = [
  "SUPER_ADMIN",
  "MAINTENANCE_MANAGER",
  "QA_QC",
];

// Roles permitted to draft a Job Hazard Analysis. HSE owns it: the JHA is the
// point where safety examines the method statement maintenance wrote, and a
// department that analyses its own work is not analysing it.
export const JHA_WRITE_ROLES = ["SUPER_ADMIN", "HSE"];

// Roles that participate in a Work Method Statement (prepare/review/approve).
export const WMS_WRITE_ROLES = [
  "SUPER_ADMIN",
  "FACTORY_MANAGER",
  "MAINTENANCE_MANAGER",
  "FOREMAN",
  "HSE",
];
