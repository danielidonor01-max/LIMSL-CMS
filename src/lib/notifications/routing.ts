// src/lib/notifications/routing.ts
// Admin-managed notification routing: which event kinds are sent at all, and
// which ROLES receive the role-targeted ones. Stored as JSON on the settings
// row; absent entries fall back to the code defaults used at each call site,
// so routing is an OVERLAY — turning an event off silences it everywhere,
// setting roles replaces the default audience. Personally-targeted
// notifications (your sign-off step, a WO assigned to you) keep their explicit
// recipient; routing can only disable them, never re-address them.
import { db } from "@/lib/db";
import { appSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export type EventRouting = { enabled: boolean; roles: string[] | null };
export type RoutingMap = Record<string, EventRouting>;

// The catalogue the Settings UI renders. defaultRoles is documentation of the
// code default (shown as placeholder chips), not enforcement.
export const NOTIFY_EVENTS: Array<{
  event: string;
  label: string;
  desc: string;
  personal: boolean;
  defaultRoles: string[] | null;
}> = [
  { event: "BREAKDOWN", label: "Breakdown reported", desc: "A corrective fault is logged against a machine", personal: false, defaultRoles: ["MAINTENANCE_MANAGER", "FOREMAN", "HSE"] },
  { event: "ESCALATION", label: "Escalation digests", desc: "Overdue/due-soon maintenance, lapsed permits, calibration & training expiry", personal: false, defaultRoles: ["MAINTENANCE_MANAGER", "FOREMAN", "FACTORY_MANAGER", "QA_QC", "HSE"] },
  { event: "PTW_SIGN_REQUEST", label: "Permit sign-off requests", desc: "A Permit-to-Work step is ready for signature", personal: false, defaultRoles: null },
  { event: "WMS_SIGN_REQUEST", label: "WMS sign-off requests", desc: "A Work Method Statement step is ready for signature", personal: false, defaultRoles: null },
  { event: "PM_SIGN_REQUEST", label: "PM sign-off requests", desc: "A PM checklist approval step is ready", personal: false, defaultRoles: null },
  { event: "PROCEDURE_SIGN_REQUEST", label: "Procedure sign-off requests", desc: "A procedure revision step is ready", personal: false, defaultRoles: null },
  { event: "GENERAL", label: "General & assignments", desc: "Work-order assignments, rejections and other direct notices", personal: true, defaultRoles: null },
];

export async function getRouting(): Promise<RoutingMap> {
  try {
    const [row] = await db.select().from(appSettings).where(eq(appSettings.id, "singleton")).limit(1);
    if (!row?.notificationRouting) return {};
    const parsed = JSON.parse(row.notificationRouting);
    return parsed && typeof parsed === "object" ? (parsed as RoutingMap) : {};
  } catch {
    return {};
  }
}

export async function saveRouting(map: RoutingMap): Promise<void> {
  await db
    .update(appSettings)
    .set({ notificationRouting: JSON.stringify(map), updatedAt: new Date().toISOString() })
    .where(eq(appSettings.id, "singleton"));
}

// Apply the overlay to one dispatch. Returns null when the event is disabled.
export function applyRouting(
  routing: RoutingMap,
  event: string,
  roles: string[] | undefined,
  userIds: string[] | undefined,
): { roles?: string[]; userIds?: string[] } | null {
  const r = routing[event];
  if (!r) return { roles, userIds };
  if (r.enabled === false) return null;
  // Role-audience override applies only to role-targeted sends.
  if (r.roles && r.roles.length > 0 && roles && roles.length > 0) {
    return { roles: r.roles, userIds };
  }
  return { roles, userIds };
}
