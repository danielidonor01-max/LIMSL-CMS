// src/lib/page-title.ts
// What the browser tab is called.
//
// Every page in the app inherited the root title, so all forty-odd were called
// "LIMSL CMS | Computerized Maintenance Management System". Anyone working with
// several tabs open, which is the normal way this job is done — the schedule in
// one, the work order in another, the permit in a third — was choosing between
// identical labels by memory of position. Browser history and bookmarks had the
// same problem.
//
// These are client components and cannot export Next's `metadata`, so the title
// is set on navigation instead. The labels match the sidebar exactly, because a
// page called one thing in the nav and another in the tab is worse than no
// title at all; a test cross-checks them.

export const APP_NAME = "LIMSL CMS";

// Longest prefix wins, so /audit/logs beats /audit.
const ROUTE_TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/equipment": "Equipment",
  "/documents": "Documents",
  "/procedure": "Maint. Procedure",
  "/schedule": "Schedule",
  "/work-orders": "Work Orders",
  "/corrective": "Corrective / RCA",
  "/spares": "Critical Spares",
  "/wms": "WMS",
  "/jha": "Job Hazard Analysis",
  "/permits": "Permits (PTW)",
  "/emergency": "Emergency Prep",
  "/contractors": "Contractors",
  "/audit/non-conformity": "Audit & NC",
  "/audit/risks": "Risk Register",
  "/audit/logs": "Audit Log",
  "/my-tasks": "My Work",
  "/approvals": "My Approvals",
  "/kpi": "KPI Dashboard",
  "/oem": "OEM & Warranty",
  "/calibration": "Calibration",
  "/training": "Training & Competency",
  "/reports": "Reports",
  "/settings/users": "Users",
  "/settings/import": "Data Import",
  "/settings": "App Settings",
  "/notifications": "Notifications",
  "/account": "Account",
  "/login": "Sign in",
  "/change-password": "Change Password",
  "/forgot-password": "Reset Password",
  "/reset-password": "Reset Password",
  "/offline": "Offline",
};

export function sectionTitle(pathname: string): string | null {
  if (pathname === "/") return ROUTE_TITLES["/"];

  let best: string | null = null;
  for (const [prefix, title] of Object.entries(ROUTE_TITLES)) {
    if (prefix === "/") continue;
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      if (!best || prefix.length > best.length) best = prefix;
    }
  }
  return best ? ROUTE_TITLES[best] : null;
}

// The record's own reference goes first when there is one, because with six
// tabs open the useful distinction is WO-2026-0031 against WO-2026-0044, not
// "Work Orders" against "Work Orders".
export function pageTitle(pathname: string, reference?: string | null): string {
  const section = sectionTitle(pathname);
  const parts = [reference?.trim(), section, APP_NAME].filter(Boolean);
  return parts.join(" · ");
}
