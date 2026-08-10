// src/app/api/admin/db-maintenance/route.ts
// One-click performance-index migration, run by the Super Admin from Settings.
// Exists because schema changes are normally applied from a developer machine
// (drizzle-kit push), this lets the DEPLOYED app bring its own database up to
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
// additive column migrations (IF NOT EXISTS, idempotent, data-safe).
const INDEXES: [string, string][] = [
  ["app_settings.notification_routing", "ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS notification_routing text"],
  ["app_settings.escalation_policy", "ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS escalation_policy text"],
  [
    "escalation_digests",
    `CREATE TABLE IF NOT EXISTS escalation_digests (
      id text PRIMARY KEY,
      user_id text NOT NULL,
      scope text NOT NULL,
      item_keys text NOT NULL,
      sent_at text NOT NULL
    )`,
  ],
  ["escalation_digests_user_scope_uq", "CREATE UNIQUE INDEX IF NOT EXISTS escalation_digests_user_scope_uq ON escalation_digests (user_id, scope)"],
  [
    "escalation_snoozes",
    `CREATE TABLE IF NOT EXISTS escalation_snoozes (
      id text PRIMARY KEY,
      entity_type text NOT NULL,
      entity_id text NOT NULL,
      snoozed_until text NOT NULL,
      reason text NOT NULL,
      snoozed_by_id text,
      snoozed_by_name text,
      created_at text NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    )`,
  ],
  ["escalation_snoozes_entity_uq", "CREATE UNIQUE INDEX IF NOT EXISTS escalation_snoozes_entity_uq ON escalation_snoozes (entity_type, entity_id)"],
  // Phase 1, ISO evidence tables and columns (additive, data-safe).
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
  // Phase 4b, schedule adherence, deferral register, failure taxonomy.
  ["maintenance_schedule.adherence", "ALTER TABLE maintenance_schedule ADD COLUMN IF NOT EXISTS days_late integer, ADD COLUMN IF NOT EXISTS deferred_reason text, ADD COLUMN IF NOT EXISTS deferred_by_id text, ADD COLUMN IF NOT EXISTS deferred_by_name text, ADD COLUMN IF NOT EXISTS deferred_at text, ADD COLUMN IF NOT EXISTS deferred_review_date text"],
  ["corrective_maintenance.failure_taxonomy", "ALTER TABLE corrective_maintenance ADD COLUMN IF NOT EXISTS failure_mode text, ADD COLUMN IF NOT EXISTS detection_method text, ADD COLUMN IF NOT EXISTS component_id text"],
  [
    "password_resets",
    `CREATE TABLE IF NOT EXISTS password_resets (
      id text PRIMARY KEY,
      user_id text NOT NULL,
      token_hash text NOT NULL,
      expires_at text NOT NULL,
      used_at text,
      requested_ip text,
      created_at text NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    )`,
  ],
  [
    "email_change_requests",
    `CREATE TABLE IF NOT EXISTS email_change_requests (
      id text PRIMARY KEY,
      user_id text NOT NULL,
      new_email text NOT NULL,
      token_hash text NOT NULL,
      expires_at text NOT NULL,
      used_at text,
      created_at text NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    )`,
  ],
  ["equipment.decommission", "ALTER TABLE equipment ADD COLUMN IF NOT EXISTS decommissioned_at text, ADD COLUMN IF NOT EXISTS decommission_reason text, ADD COLUMN IF NOT EXISTS decommissioned_by_id text, ADD COLUMN IF NOT EXISTS decommissioned_by_name text"],
  ["assignees", "ALTER TABLE maintenance_schedule ADD COLUMN IF NOT EXISTS assistant_ids text"],
  ["work_orders.assistants", "ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS assistant_ids text"],
  ["email_change_user_idx", "CREATE INDEX IF NOT EXISTS email_change_user_idx ON email_change_requests (user_id)"],
  ["email_change_token_idx", "CREATE INDEX IF NOT EXISTS email_change_token_idx ON email_change_requests (token_hash)"],
  ["password_resets_user_idx", "CREATE INDEX IF NOT EXISTS password_resets_user_idx ON password_resets (user_id)"],
  ["password_resets_token_idx", "CREATE INDEX IF NOT EXISTS password_resets_token_idx ON password_resets (token_hash)"],
  // Sign-off overrides, a step signed by someone other than the role it names.
  ["signoffs.override", "ALTER TABLE signoffs ADD COLUMN IF NOT EXISTS is_override boolean DEFAULT false, ADD COLUMN IF NOT EXISTS override_reason text"],
  // A step bound to one named person rather than to a role: the permit holder
  // signs the permit issued to him, nobody signs it for him.
  ["signoffs.signer", "ALTER TABLE signoffs ADD COLUMN IF NOT EXISTS signer_user_id text, ADD COLUMN IF NOT EXISTS signer_user_name text"],
  // Management authorising commencement, recorded on the work order itself.
  ["work_orders.approval", "ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS approved_by_id text, ADD COLUMN IF NOT EXISTS approved_by_name text, ADD COLUMN IF NOT EXISTS approved_at text, ADD COLUMN IF NOT EXISTS rejected_reason text"],
  // The Work Method Statement names the work order it was drafted against. The
  // column existed and nothing ever wrote to it.
  ["wms_documents.work_order", "ALTER TABLE wms_documents ADD COLUMN IF NOT EXISTS work_order_id text"],
  // Job Hazard Analysis as its own approved document, third in the chain.
  [
    "jha_documents",
    `CREATE TABLE IF NOT EXISTS jha_documents (
      id text PRIMARY KEY,
      jha_number text NOT NULL UNIQUE,
      title text NOT NULL,
      revision integer NOT NULL DEFAULT 0,
      wms_id text,
      work_order_id text,
      equipment_id text,
      work_area text,
      steps text,
      ppe_required text,
      emergency_arrangements text,
      status text NOT NULL DEFAULT 'DRAFT',
      prepared_by_id text,
      prepared_by_name text,
      prepared_date text,
      approved_at text,
      created_at text NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    )`,
  ],
  ["jha_wms_idx", "CREATE INDEX IF NOT EXISTS jha_wms_idx ON jha_documents (wms_id)"],
  // The permit face as printed, plus the daily renewal grid, handback, handover,
  // work acceptance and the supersession link.
  [
    "permits.paper_form",
    `ALTER TABLE permits
       ADD COLUMN IF NOT EXISTS task_no text,
       ADD COLUMN IF NOT EXISTS jha_id text,
       ADD COLUMN IF NOT EXISTS work_types text,
       ADD COLUMN IF NOT EXISTS facility text,
       ADD COLUMN IF NOT EXISTS work_area text,
       ADD COLUMN IF NOT EXISTS zone_classification text,
       ADD COLUMN IF NOT EXISTS start_date text,
       ADD COLUMN IF NOT EXISTS start_time text,
       ADD COLUMN IF NOT EXISTS duration_hours real,
       ADD COLUMN IF NOT EXISTS worker_count integer,
       ADD COLUMN IF NOT EXISTS permit_department text,
       ADD COLUMN IF NOT EXISTS validity_days integer NOT NULL DEFAULT 7,
       ADD COLUMN IF NOT EXISTS document_marks text,
       ADD COLUMN IF NOT EXISTS precaution_marks text,
       ADD COLUMN IF NOT EXISTS ppe_marks text,
       ADD COLUMN IF NOT EXISTS additional_requirements text,
       ADD COLUMN IF NOT EXISTS renewal_days text,
       ADD COLUMN IF NOT EXISTS handback_outcome text,
       ADD COLUMN IF NOT EXISTS handback_reason text,
       ADD COLUMN IF NOT EXISTS handback_by_name text,
       ADD COLUMN IF NOT EXISTS handback_at text,
       ADD COLUMN IF NOT EXISTS handovers text,
       ADD COLUMN IF NOT EXISTS accepted_by_name text,
       ADD COLUMN IF NOT EXISTS accepted_by_dept text,
       ADD COLUMN IF NOT EXISTS accepted_at text,
       ADD COLUMN IF NOT EXISTS supersedes_permit_id text,
       ADD COLUMN IF NOT EXISTS superseded_by_permit_id text,
       ADD COLUMN IF NOT EXISTS closure_reason text,
       ADD COLUMN IF NOT EXISTS closure_note text`,
  ],
  ["permits_supersedes_idx", "CREATE INDEX IF NOT EXISTS permits_supersedes_idx ON permits (supersedes_permit_id)"],
  // Phase 6f, condition monitoring.
  [
    "condition_points",
    `CREATE TABLE IF NOT EXISTS condition_points (
      id text PRIMARY KEY,
      equipment_id text NOT NULL,
      name text NOT NULL,
      kind text NOT NULL,
      unit text,
      alert_limit real,
      alarm_limit real,
      interval_days real,
      last_reading_date text,
      notes text,
      created_at text NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    )`,
  ],
  ["condition_points_equipment_idx", "CREATE INDEX IF NOT EXISTS condition_points_equipment_idx ON condition_points (equipment_id)"],
  [
    "condition_readings",
    `CREATE TABLE IF NOT EXISTS condition_readings (
      id text PRIMARY KEY,
      point_id text NOT NULL,
      value real NOT NULL,
      taken_on text NOT NULL,
      verdict text NOT NULL,
      notes text,
      taken_by_id text,
      taken_by_name text,
      created_at text NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    )`,
  ],
  ["condition_readings_point_idx", "CREATE INDEX IF NOT EXISTS condition_readings_point_idx ON condition_readings (point_id)"],
  // Phase 6e, contractor control (ISO 45001 8.1.4.2).
  [
    "contractors",
    `CREATE TABLE IF NOT EXISTS contractors (
      id text PRIMARY KEY,
      company_name text NOT NULL,
      trade_specialty text,
      contact_person text,
      phone text,
      email text,
      insurance_provider text,
      insurance_policy_number text,
      insurance_expiry_date text,
      insurance_cover_amount text,
      induction_date text,
      induction_valid_until text,
      induction_by_name text,
      status text NOT NULL DEFAULT 'ACTIVE',
      suspension_reason text,
      notes text,
      created_at text NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      updated_at text NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    )`,
  ],
  [
    "contractor_personnel",
    `CREATE TABLE IF NOT EXISTS contractor_personnel (
      id text PRIMARY KEY,
      contractor_id text NOT NULL,
      name text NOT NULL,
      job_title text,
      induction_date text,
      induction_valid_until text,
      competency_notes text,
      created_at text NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    )`,
  ],
  ["contractor_personnel_contractor_idx", "CREATE INDEX IF NOT EXISTS contractor_personnel_contractor_idx ON contractor_personnel (contractor_id)"],
  ["permits.contractor", "ALTER TABLE permits ADD COLUMN IF NOT EXISTS contractor_id text"],
  // Phase 6c, emergency preparedness (ISO 45001 8.2).
  [
    "emergency_equipment",
    `CREATE TABLE IF NOT EXISTS emergency_equipment (
      id text PRIMARY KEY,
      tag_number text NOT NULL,
      type text NOT NULL,
      location text NOT NULL,
      description text,
      manufacturer text,
      serial_number text,
      capacity text,
      installed_date text,
      last_inspection_date text,
      inspection_interval_days real,
      expiry_date text,
      status text NOT NULL DEFAULT 'SERVICEABLE',
      notes text,
      created_at text NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      updated_at text NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    )`,
  ],
  ["emergency_equipment_type_idx", "CREATE INDEX IF NOT EXISTS emergency_equipment_type_idx ON emergency_equipment (type)"],
  [
    "emergency_inspections",
    `CREATE TABLE IF NOT EXISTS emergency_inspections (
      id text PRIMARY KEY,
      equipment_id text NOT NULL,
      inspection_date text NOT NULL,
      verdict text NOT NULL DEFAULT 'PASS',
      findings text,
      action_taken text,
      inspected_by_id text,
      inspected_by_name text,
      created_at text NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    )`,
  ],
  ["emergency_inspections_equipment_idx", "CREATE INDEX IF NOT EXISTS emergency_inspections_equipment_idx ON emergency_inspections (equipment_id)"],
  [
    "emergency_drills",
    `CREATE TABLE IF NOT EXISTS emergency_drills (
      id text PRIMARY KEY,
      drill_type text NOT NULL,
      drill_date text NOT NULL,
      location text,
      scenario text,
      participant_count real,
      evacuation_minutes real,
      observations text,
      deficiencies text,
      corrective_actions text,
      conducted_by_id text,
      conducted_by_name text,
      created_at text NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    )`,
  ],
  // Phase 6b, meter / run-hours servicing.
  ["equipment.meters", "ALTER TABLE equipment ADD COLUMN IF NOT EXISTS meter_unit text, ADD COLUMN IF NOT EXISTS current_meter real, ADD COLUMN IF NOT EXISTS meter_updated_at text, ADD COLUMN IF NOT EXISTS meter_service_interval real, ADD COLUMN IF NOT EXISTS meter_at_last_service real"],
  [
    "meter_readings",
    `CREATE TABLE IF NOT EXISTS meter_readings (
      id text PRIMARY KEY,
      equipment_id text NOT NULL,
      reading real NOT NULL,
      reading_date text NOT NULL,
      is_reset boolean DEFAULT false,
      notes text,
      recorded_by_id text,
      recorded_by_name text,
      created_at text NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    )`,
  ],
  ["meter_readings_equipment_idx", "CREATE INDEX IF NOT EXISTS meter_readings_equipment_idx ON meter_readings (equipment_id)"],
  // Phase 6a, critical spares register.
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
