// src/lib/equipment/removal.ts
// Taking an asset off the register, and the much rarer case of deleting it.
//
// These are two different acts and conflating them is how compliance systems
// lose their evidence.
//
// RETIRING an asset is an ordinary event. A machine is sold, scrapped after a
// crash, or reaches end of life. The record must stay: its work orders, its
// permits, its calibration certificates and its incident history are all still
// evidence of what happened while it was in service, and an auditor sampling
// last year's permits does not care that the machine has since gone. So the
// asset leaves the register's default view, keeps everything, and says why and
// on whose authority it went.
//
// DELETING an asset is an admission that it never should have existed: a
// duplicate typed twice, a test row, a tag created by mistake. That is the only
// case where destroying the row loses nothing, because there is nothing
// attached to lose. Twenty-four tables carry a foreign key to equipment, and if
// any of them holds a row for this asset then the asset had a life, and a life
// is not deleted — it is retired.
//
// So the rule is simple enough to explain to whoever presses the button: you
// may delete an asset with no history, and only that.

export const REMOVAL_REASONS = [
  {
    value: "DECOMMISSIONED",
    label: "Decommissioned",
    hint: "Retired from service at the end of its life.",
  },
  {
    value: "SOLD",
    label: "Sold or transferred",
    hint: "No longer owned by LIMSL.",
  },
  {
    value: "DAMAGED",
    label: "Damaged beyond repair",
    hint: "Scrapped rather than repaired.",
  },
  {
    value: "LOST",
    label: "Lost or stolen",
    hint: "Cannot be located and is not expected back.",
  },
  {
    value: "OTHER",
    label: "Other",
    hint: "Anything else. Say what in the note.",
  },
] as const;

export type RemovalReason = (typeof REMOVAL_REASONS)[number]["value"];

const REASON_VALUES = new Set<string>(REMOVAL_REASONS.map((r) => r.value));

export const isRemovalReason = (v: unknown): v is RemovalReason =>
  typeof v === "string" && REASON_VALUES.has(v);

export const removalReasonLabel = (v: string | null | undefined): string =>
  REMOVAL_REASONS.find((r) => r.value === v)?.label ?? "Removed";

export type Decision = { ok: true } | { ok: false; error: string };

/**
 * Whether an asset may be taken off the register.
 *
 * "Other" demands a note, because a removal reason of "other" with nothing
 * beside it tells a future reader precisely nothing, and this is a record
 * somebody will read years from now trying to work out where a machine went.
 */
export function canRetire(input: {
  reason: unknown;
  note?: string | null;
  alreadyRemoved: boolean;
}): Decision {
  if (input.alreadyRemoved) {
    return { ok: false, error: "This asset is already off the register." };
  }
  if (!isRemovalReason(input.reason)) {
    return { ok: false, error: "Choose why the asset is being removed." };
  }
  if (input.reason === "OTHER" && !String(input.note ?? "").trim()) {
    return {
      ok: false,
      error: 'Say what "other" means here. A removal reason nobody can read is not a reason.',
    };
  }
  return { ok: true };
}

/** Every table that would lose a row if an asset were deleted outright. */
export interface ReferenceCount {
  label: string;
  count: number;
}

/**
 * Whether an asset may be destroyed.
 *
 * `passwordOk` and `isSuperAdmin` are both decided by the caller: this module
 * does not see secrets and does not read sessions. Both are required, because
 * one of them alone is a single click away from an empty register.
 */
export function canPurge(input: {
  isSuperAdmin: boolean;
  passwordOk: boolean;
  passwordConfigured: boolean;
  references: ReferenceCount[];
}): Decision {
  if (!input.isSuperAdmin) {
    return { ok: false, error: "Only a Super Admin may permanently delete an asset." };
  }
  if (!input.passwordConfigured) {
    return {
      ok: false,
      error:
        "Permanent deletion is not configured on this deployment. Set ASSET_PURGE_PASSWORD and try again.",
    };
  }
  if (!input.passwordOk) {
    return { ok: false, error: "That is not the deletion password." };
  }

  const held = input.references.filter((r) => r.count > 0);
  if (held.length > 0) {
    return {
      ok: false,
      error:
        `This asset has a history and cannot be deleted: ` +
        `${describeReferences(held)}. ` +
        `Those records are evidence of work that actually happened, and deleting the ` +
        `asset would orphan them. Remove it from the register instead, which keeps ` +
        `the history and records why it went.`,
    };
  }
  return { ok: true };
}

/** "3 work orders, 1 permit and 2 calibration records" */
export function describeReferences(refs: ReferenceCount[]): string {
  const parts = refs
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count)
    .map((r) => `${r.count} ${r.count === 1 ? singular(r.label) : r.label}`);
  if (parts.length === 0) return "nothing";
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

// The labels are stored plural because that is how they read in the common
// case. Only the count of one needs the other form.
function singular(label: string): string {
  if (label.endsWith("ies")) return `${label.slice(0, -3)}y`;
  if (label.endsWith("es") && !label.endsWith("ses")) return label.slice(0, -2);
  if (label.endsWith("s")) return label.slice(0, -1);
  return label;
}
