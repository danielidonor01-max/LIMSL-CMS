// src/lib/hse/incidents.ts
// Near misses and safety incidents. ISO 45001 10.2.
//
// This is a different record from a corrective maintenance request, and the
// distinction is the reason the module exists: a corrective record is about a
// machine that stopped working, an incident is about a person who was hurt or
// nearly was. A fabrication workshop doing coded welding and hot work on
// pressurised systems generates the second kind whether or not there is
// anywhere to write them down.
//
// The design constraint that matters most is speed of reporting. Near misses
// are the cheap warnings, and they are only cheap if people file them. A form
// that asks twelve questions gets used the first week and abandoned by the
// third, so reporting asks what happened, when and where, and everything else
// belongs to the investigation.

export type IncidentType =
  | "NEAR_MISS"
  | "FIRST_AID"
  | "MEDICAL_TREATMENT"
  | "LOST_TIME"
  | "PROPERTY_DAMAGE"
  | "ENVIRONMENTAL"
  | "DANGEROUS_OCCURRENCE";

export const INCIDENT_TYPES: { value: IncidentType; label: string; help: string }[] = [
  {
    value: "NEAR_MISS",
    label: "Near miss",
    help: "Nobody was hurt, but they could have been. The cheapest warning you will ever get.",
  },
  { value: "FIRST_AID", label: "First aid", help: "Treated on site, back to work the same day" },
  {
    value: "MEDICAL_TREATMENT",
    label: "Medical treatment",
    help: "Needed a clinic or hospital, no time lost beyond the day",
  },
  { value: "LOST_TIME", label: "Lost time injury", help: "Unable to return for a following shift" },
  { value: "PROPERTY_DAMAGE", label: "Property damage", help: "Plant or property damaged, nobody injured" },
  { value: "ENVIRONMENTAL", label: "Environmental", help: "Spill, release or discharge" },
  {
    value: "DANGEROUS_OCCURRENCE",
    label: "Dangerous occurrence",
    help: "Collapse, explosion, uncontrolled release, lifting-gear failure",
  },
];

export const INCIDENT_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  INCIDENT_TYPES.map((t) => [t.value, t.label]),
);

export type IncidentStatus = "REPORTED" | "UNDER_INVESTIGATION" | "ACTIONS_ASSIGNED" | "CLOSED";

export const INCIDENT_STATUS_LABEL: Record<string, string> = {
  REPORTED: "Reported",
  UNDER_INVESTIGATION: "Under investigation",
  ACTIONS_ASSIGNED: "Actions assigned",
  CLOSED: "Closed",
};

export const INCIDENT_STATUS_BADGE: Record<string, string> = {
  REPORTED: "bg-warn-500/10 text-warn-700 border-warn-500/20",
  UNDER_INVESTIGATION: "bg-info-500/10 text-info-700 border-info-500/20",
  ACTIONS_ASSIGNED: "bg-info-500/10 text-info-700 border-info-500/20",
  CLOSED: "bg-ink-500/10 text-ink-600 border-ink-500/20",
};

// Types where an injury took someone out of work, or where the event could have
// killed somebody regardless of what actually happened. These are the ones a
// regulator asks about, and the ones where a formal investigation is not
// optional.
const SERIOUS: IncidentType[] = ["LOST_TIME", "DANGEROUS_OCCURRENCE", "ENVIRONMENTAL"];

export function isSerious(type: string): boolean {
  return SERIOUS.includes(type as IncidentType);
}

/**
 * Whether the record needs a formal investigation before it can be closed.
 *
 * Every incident gets investigated in principle. This marks the ones where
 * closing without a documented root cause is itself the finding.
 */
export function requiresFormalInvestigation(type: string): boolean {
  return isSerious(type);
}

export function isValidType(type: unknown): type is IncidentType {
  return INCIDENT_TYPES.some((t) => t.value === type);
}

/**
 * What is missing before this record can be closed.
 *
 * Returned as sentences rather than a boolean so the reason can be shown next
 * to the button that is refusing to work.
 */
export function blockersToClose(incident: {
  type: string;
  rootCause?: string | null;
  correctiveAction?: string | null;
  immediateAction?: string | null;
}): string[] {
  const out: string[] = [];

  if (!incident.immediateAction?.trim()) {
    out.push("Record what was done at the time to make the area safe.");
  }
  if (!incident.correctiveAction?.trim()) {
    out.push("Record the corrective action that stops this happening again.");
  }
  if (requiresFormalInvestigation(incident.type) && !incident.rootCause?.trim()) {
    out.push(
      `A ${INCIDENT_TYPE_LABEL[incident.type]?.toLowerCase() ?? "serious incident"} cannot be closed ` +
        `without a documented root cause (ISO 45001 10.2).`,
    );
  }

  return out;
}

// The reporting form asks three things. Anything beyond this belongs to the
// investigation, and putting it on the report is how near-miss reporting dies.
export function validateReport(input: {
  type: unknown;
  description?: unknown;
  occurredAt?: unknown;
}): { ok: true } | { ok: false; error: string } {
  if (!isValidType(input.type)) {
    return { ok: false, error: "Choose what kind of event this was." };
  }
  const description = String(input.description ?? "").trim();
  if (description.length < 10) {
    return {
      ok: false,
      error: "Describe what happened, in a sentence or two. Someone investigating this next week has only these words.",
    };
  }
  if (!String(input.occurredAt ?? "").trim()) {
    return { ok: false, error: "Record when it happened." };
  }
  return { ok: true };
}
