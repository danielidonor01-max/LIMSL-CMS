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

// Kept in lockstep with the index tuples in src/lib/db/schema.ts. Also carries
// additive column migrations (IF NOT EXISTS — idempotent, data-safe).
const INDEXES: [string, string][] = [
  ["app_settings.notification_routing", "ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS notification_routing text"],
  // Phase 1 — ISO evidence tables and columns (additive, data-safe).
  ["calibration_records.traceability", "ALTER TABLE calibration_records ADD COLUMN IF NOT EXISTS traceable_to text, ADD COLUMN IF NOT EXISTS reference_standard_id text, ADD COLUMN IF NOT EXISTS lab_name text, ADD COLUMN IF NOT EXISTS lab_accreditation_no text, ADD COLUMN IF NOT EXISTS accreditation_body text"],
  [
    "calibration_events",
    `CREATE TABLE IF NOT EXISTS calibration_events (
      id text PRIMARY KEY,
      instrument_id text NOT NULL REFERENCES calibration_records(id),
      calibration_date text NOT NULL,
      next_calibration_date text,
      as_found text, as_left text,
      verdict text NOT NULL DEFAULT 'PASS',
      readings text,
      calibrated_by text, calibrated_by_id text,
      certificate_number text, certificate_file_key text,
      traceable_to text, lab_name text, lab_accreditation_no text,
      notes text,
      created_at text NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    )`,
  ],
  ["calibration_events_instrument_idx", "CREATE INDEX IF NOT EXISTS calibration_events_instrument_idx ON calibration_events (instrument_id, calibration_date)"],
  [
    "isolation_points",
    `CREATE TABLE IF NOT EXISTS isolation_points (
      id text PRIMARY KEY,
      permit_id text NOT NULL REFERENCES permits(id),
      energy_source text NOT NULL,
      isolation_device text NOT NULL,
      lock_tag_number text,
      applied_by_name text, applied_by_id text, applied_at text,
      verified_zero_energy boolean NOT NULL DEFAULT false,
      removed_by_name text, removed_by_id text, removed_at text,
      created_at text NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    )`,
  ],
  ["isolation_points_permit_idx", "CREATE INDEX IF NOT EXISTS isolation_points_permit_idx ON isolation_points (permit_id)"],
  // Phase 4b — schedule adherence, deferral register, failure taxonomy.
  ["maintenance_schedule.adherence", "ALTER TABLE maintenance_schedule ADD COLUMN IF NOT EXISTS days_late integer, ADD COLUMN IF NOT EXISTS deferred_reason text, ADD COLUMN IF NOT EXISTS deferred_by_id text, ADD COLUMN IF NOT EXISTS deferred_by_name text, ADD COLUMN IF NOT EXISTS deferred_at text, ADD COLUMN IF NOT EXISTS deferred_review_date text"],
  ["corrective_maintenance.failure_taxonomy", "ALTER TABLE corrective_maintenance ADD COLUMN IF NOT EXISTS failure_mode text, ADD COLUMN IF NOT EXISTS detection_method text, ADD COLUMN IF NOT EXISTS component_id text"],
  // Phase 6a — critical spares register.
  [
    "spare_parts",
    `CREATE TABLE IF NOT EXISTS spare_parts (
      id text PRIMARY KEY,
      part_number text NOT NULL,
      name text NOT NULL,
      description text,
      equipment_id text,
      quantity_on_hand real NOT NULL DEFAULT 0,
      minimum_quantity real NOT NULL DEFAULT 0,
      maximum_quantity real,
      unit text DEFAULT 'ea',
      bin_location text,
      supplier_name text,
      supplier_part_number text,
      lead_time_days real,
      unit_cost real,
      currency text DEFAULT 'NGN',
      on_order boolean DEFAULT false,
      on_order_quantity real,
      expected_date text,
      notes text,
      created_at text NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      updated_at text NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    )`,
  ],
  ["spare_parts_equipment_idx", "CREATE INDEX IF NOT EXISTS spare_parts_equipment_idx ON spare_parts (equipment_id)"],
  [
    "spare_part_movements",
    `CREATE TABLE IF NOT EXISTS spare_part_movements (
      id text PRIMARY KEY,
      spare_part_id text NOT NULL,
      movement_type text NOT NULL,
      quantity real NOT NULL,
      balance_after real NOT NULL,
      reason text,
      work_order_id text,
      performed_by_id text,
      performed_by_name text,
      created_at text NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    )`,
  ],
  ["spare_movements_part_idx", "CREATE INDEX IF NOT EXISTS spare_movements_part_idx ON spare_part_movements (spare_part_id)"],
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
