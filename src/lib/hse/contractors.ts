// src/lib/hse/contractors.ts
// Contractor control, ISO 45001 clause 8.1.4.2.
//
// A contractor register that does not stop anybody working is a spreadsheet.
// The obligation is not to *hold* insurance certificates and induction records,
// it is to not let someone onto a live machine without them, so the only part
// of this that matters is the gate, and the gate has to be able to say no.
//
// Three things independently disqualify a company from working on site:
// expired public-liability insurance, expired site induction, and suspension.
// Each is time-based and therefore silently lapses; nobody gets an email from
// their insurer's expiry date. That is exactly why it belongs in the system that
// issues permits rather than in a folder.

export type ContractorStatus = "ACTIVE" | "SUSPENDED";

export type EligibilityReason =
  | "INSURANCE_EXPIRED"
  | "INSURANCE_MISSING"
  | "INDUCTION_EXPIRED"
  | "INDUCTION_MISSING"
  | "SUSPENDED";

export const REASON_TEXT: Record<EligibilityReason, string> = {
  INSURANCE_EXPIRED: "Public liability insurance has expired.",
  INSURANCE_MISSING: "No insurance expiry date on file, it has never been verified.",
  INDUCTION_EXPIRED: "Site safety induction has expired.",
  INDUCTION_MISSING: "No site safety induction recorded.",
  SUSPENDED: "Suspended from working on site.",
};

export type Eligibility = {
  eligible: boolean;
  reasons: EligibilityReason[];
  messages: string[];
  // Warnings do not block, but they are the ones worth chasing this month.
  expiringSoon: string[];
  daysUntilInsuranceExpiry: number | null;
  daysUntilInductionExpiry: number | null;
};

export const EXPIRY_WARN_DAYS = 30;

const DAY = 86_400_000;

function daysUntil(dateISO: string | null | undefined, todayISO: string): number | null {
  if (!dateISO) return null;
  const target = Date.parse(`${String(dateISO).slice(0, 10)}T00:00:00Z`);
  const today = Date.parse(`${todayISO.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(target) || Number.isNaN(today)) return null;
  return Math.round((target - today) / DAY);
}

// May this company work on site today?
export function assessContractor(
  c: {
    status?: string | null;
    insuranceExpiryDate?: string | null;
    inductionValidUntil?: string | null;
  },
  todayISO: string = new Date().toISOString().slice(0, 10),
): Eligibility {
  const reasons: EligibilityReason[] = [];
  const expiringSoon: string[] = [];

  if ((c.status ?? "ACTIVE").toUpperCase().trim() === "SUSPENDED") reasons.push("SUSPENDED");

  const insDays = daysUntil(c.insuranceExpiryDate, todayISO);
  if (insDays === null) reasons.push("INSURANCE_MISSING");
  else if (insDays < 0) reasons.push("INSURANCE_EXPIRED");
  else if (insDays <= EXPIRY_WARN_DAYS) expiringSoon.push(`Insurance expires in ${insDays} day(s).`);

  const indDays = daysUntil(c.inductionValidUntil, todayISO);
  if (indDays === null) reasons.push("INDUCTION_MISSING");
  else if (indDays < 0) reasons.push("INDUCTION_EXPIRED");
  else if (indDays <= EXPIRY_WARN_DAYS) expiringSoon.push(`Site induction expires in ${indDays} day(s).`);

  return {
    eligible: reasons.length === 0,
    reasons,
    messages: reasons.map((r) => REASON_TEXT[r]),
    expiringSoon,
    daysUntilInsuranceExpiry: insDays,
    daysUntilInductionExpiry: indDays,
  };
}

// An individual's own induction, which can lapse while the company's is current
//, a new hire sent to site by an otherwise compliant contractor is the case
// this catches.
export function assessPerson(
  p: { inductionValidUntil?: string | null },
  todayISO: string = new Date().toISOString().slice(0, 10),
): { eligible: boolean; message: string | null; daysUntilExpiry: number | null } {
  const days = daysUntil(p.inductionValidUntil, todayISO);
  if (days === null) return { eligible: false, message: "No site induction recorded for this person.", daysUntilExpiry: null };
  if (days < 0) return { eligible: false, message: `Site induction expired ${Math.abs(days)} day(s) ago.`, daysUntilExpiry: days };
  return { eligible: true, message: null, daysUntilExpiry: days };
}

// The sentence the permit route refuses with. Written to be read by whoever is
// standing at the gate, so it names what to fix rather than quoting a clause.
export function blockReason(name: string, e: Eligibility): string {
  return (
    `${name} cannot be given a permit: ${e.messages.join(" ")} ` +
    `Update the contractor record before the permit is issued.`
  );
}

export function summariseRegister(
  contractors: { status?: string | null; insuranceExpiryDate?: string | null; inductionValidUntil?: string | null }[],
  todayISO: string = new Date().toISOString().slice(0, 10),
): { total: number; eligible: number; blocked: number; expiringSoon: number } {
  let eligible = 0;
  let expiringSoon = 0;
  for (const c of contractors) {
    const e = assessContractor(c, todayISO);
    if (e.eligible) {
      eligible++;
      if (e.expiringSoon.length) expiringSoon++;
    }
  }
  return { total: contractors.length, eligible, blocked: contractors.length - eligible, expiringSoon };
}
