// src/app/api/admin/db-maintenance/route.ts
// One-click performance-index migration, run by the Super Admin from Settings.
// Exists because schema changes are normally applied from a developer machine
// (drizzle-kit push) — this lets the DEPLOYED app bring its own database up to
// date. Every statement is CREATE INDEX IF NOT EXISTS: idempotent, safe to run
// repeatedly, never touches data.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { auditLog } from "@/lib/db/schema";
import { requireRoles } from "@/lib/authz";
import { SETTINGS_WRITE_ROLES } from "@/lib/roles";

// Kept in lockstep with the index tuples in src/lib/db/schema.ts.
const INDEXES: [string, string][] = [
  ["equipment_asset_id_idx", "CREATE INDEX IF NOT EXISTS equipment_asset_id_idx ON equipment (asset_id)"],
  ["equipment_documents_equipment_idx", "CREATE INDEX IF NOT EXISTS equipment_documents_equipment_idx ON equipment_documents (equipment_id)"],
  ["maintenance_schedule_equipment_idx", "CREATE INDEX IF NOT EXISTS maintenance_schedule_equipment_idx ON maintenance_schedule (equipment_id)"],
  ["work_orders_equipment_idx", "CREATE INDEX IF NOT EXISTS work_orders_equipment_idx ON work_orders (equipment_id)"],
  ["pm_checklists_work_order_idx", "CREATE INDEX IF NOT EXISTS pm_checklists_work_order_idx ON pm_checklists (work_order_id)"],
  ["corrective_maintenance_equipment_idx", "CREATE INDEX IF NOT EXISTS corrective_maintenance_equipment_idx ON corrective_maintenance (equipment_id)"],
  ["audit_log_user_action_idx", "CREATE INDEX IF NOT EXISTS audit_log_user_action_idx ON audit_log (user_id, action, timestamp)"],
  ["component_registry_equipment_idx", "CREATE INDEX IF NOT EXISTS component_registry_equipment_idx ON component_registry (equipment_id)"],
  ["diagnostic_guides_equipment_idx", "CREATE INDEX IF NOT EXISTS diagnostic_guides_equipment_idx ON diagnostic_guides (equipment_id)"],
  ["non_conformities_equipment_idx", "CREATE INDEX IF NOT EXISTS non_conformities_equipment_idx ON non_conformities (equipment_id)"],
  ["permits_work_order_idx", "CREATE INDEX IF NOT EXISTS permits_work_order_idx ON permits (work_order_id)"],
];

export async function POST() {
  const gate = await requireRoles(SETTINGS_WRITE_ROLES);
  if (gate.res) return gate.res;

  const applied: string[] = [];
  const failed: { name: string; error: string }[] = [];
  for (const [name, stmt] of INDEXES) {
    try {
      await db.execute(sql.raw(stmt));
      applied.push(name);
    } catch (err) {
      failed.push({ name, error: err instanceof Error ? err.message.slice(0, 120) : "failed" });
    }
  }

  await db.insert(auditLog).values({
    id: nanoid(),
    userId: gate.actor?.id ?? null,
    userName: gate.actor?.name ?? "Admin",
    action: "UPDATE",
    entityType: "settings",
    entityId: "db-maintenance",
    entityDescription: `Performance indexes applied: ${applied.length} ok${failed.length ? `, ${failed.length} failed` : ""}`,
  });

  return NextResponse.json({ applied, failed, ok: failed.length === 0 });
}
