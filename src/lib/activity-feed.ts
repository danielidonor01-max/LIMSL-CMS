// src/lib/activity-feed.ts
// Turns audit rows into a sentence a maintenance manager would say.
//
// The dashboard was rendering the audit table directly: the action verb from the
// database, the table name, and whatever string the writer happened to store.
// So the most recent thing that had happened at LIMSL, on the manager's home
// screen, was
//
//     UPDATE · 9 Sept 2026 · Settings · Performance indexes applied: 62 ok
//
// which is a developer's log line. It is not that the wording is unpolished; it
// is that database housekeeping is not activity on a maintenance system, and
// putting it at the top teaches people the panel is not worth reading.
//
// Two jobs here: drop what is not operational, and say the rest in the
// vocabulary of the work rather than of the schema. The full audit trail is
// unchanged and still complete at /audit/logs, which is where an auditor looks.
// This is the summary, not the record.

export type AuditRow = {
  id: string;
  action: string;
  entityType: string;
  entityDescription: string | null;
  userName: string | null;
  timestamp: string;
};

// Housekeeping. Real events, correctly recorded, that simply are not what this
// panel is for.
const ADMIN_ENTITIES = new Set(["settings", "api_credential"]);

// Phrases that mark a row as machine-generated maintenance rather than work.
const ADMIN_PHRASES = [
  "performance indexes",
  "indexes applied",
  "migration",
  "db-maintenance",
  "seed users cleared",
];

export function isOperational(row: AuditRow): boolean {
  if (ADMIN_ENTITIES.has(row.entityType)) return false;
  const d = (row.entityDescription ?? "").toLowerCase();
  return !ADMIN_PHRASES.some((p) => d.includes(p));
}

// The verb a person would use. "UPDATE" is what the row says; "updated" is what
// happened, and for a signature "signed" is the only word anyone uses.
const VERB: Record<string, string> = {
  CREATE: "raised",
  UPDATE: "updated",
  DELETE: "removed",
  SIGN: "signed",
  REJECT: "rejected",
  APPROVE: "approved",
  LOGIN: "signed in",
  // The diagnosis engine writes its own action names in lower case, and
  // "Daniel ai_chat a diagnosis" is what came out the other side.
  AI_CHAT: "ran",
  AI_DIAGNOSE: "ran",
};

// The AI routes record the model, the token counts and how many pieces of
// evidence were used. That belongs in the audit log: it is real provenance and
// real cost, and an auditor asking how a diagnosis was reached needs it. It
// does not belong on a maintenance manager's dashboard, where
// "913in/350out · 6 evidence items" is telemetry addressed to nobody in the
// building. Trimmed for the summary only; /audit/logs still holds all of it.
const TELEMETRY = [
  /\s*·\s*\d+in\/\d+out(\s+tokens)?/gi,
  /\s*·\s*\d+\s+evidence items?/gi,
  /\s*\((?:gemini|claude|gpt|anthropic)[^)]*\)/gi,
];

export function stripTelemetry(text: string): string {
  let out = text;
  for (const re of TELEMETRY) out = out.replace(re, "");
  return out.replace(/\s{2,}/g, " ").replace(/\s*·\s*$/, "").trim();
}

const ENTITY: Record<string, string> = {
  work_order: "work order",
  maintenance_schedule: "scheduled activity",
  pm_checklist: "PM checklist",
  corrective_maintenance: "breakdown record",
  permit: "permit",
  jha: "hazard analysis",
  wms: "method statement",
  equipment: "machine",
  spare_part: "spare part",
  calibration: "calibration record",
  competency: "training record",
  contractor: "contractor",
  non_conformity: "non-conformity",
  risk_register: "risk",
  emergency_equipment: "safety equipment",
  emergency_drill: "drill",
  procedure_revision: "procedure revision",
  diagnosis_session: "diagnosis",
  user: "user account",
};

export function entityLabel(entityType: string): string {
  return ENTITY[entityType] ?? entityType.replace(/_/g, " ");
}

export type ActivityLine = {
  id: string;
  // "Daniel Idonor signed a permit"
  headline: string;
  // The recorded detail, which usually carries the reference number.
  detail: string | null;
  timestamp: string;
};

export function toActivityLine(row: AuditRow): ActivityLine {
  const who = row.userName?.trim() || "The system";
  const verb = VERB[row.action.toUpperCase()] ?? row.action.toLowerCase().replace(/_/g, " ");
  const what = entityLabel(row.entityType);

  return {
    id: row.id,
    // A signature is against a step, not against a noun, so it reads
    // differently: "signed a permit" rather than "signed permit".
    headline: `${who} ${verb} ${verb === "signed in" ? "" : `a ${what}`}`.trim(),
    detail: stripTelemetry(row.entityDescription ?? "") || null,
    timestamp: row.timestamp,
  };
}

// What the dashboard panel should show, worst noise removed and capped.
export function operationalFeed(rows: AuditRow[], limit = 6): ActivityLine[] {
  return rows.filter(isOperational).slice(0, limit).map(toActivityLine);
}
