// src/lib/document-control.ts
// The revision history at the top of a controlled document (WMS, JHA,
// Procedure), built from the signatures actually on record.
//
// LIMSL's paper documents list each stage a revision went through, newest at
// the top. A revision is signed in two separate passes (LIMSL, November 2026):
// the originator, the Maintenance Manager and the Factory Manager (for a WMS)
// sign it "Issued for review and approval", then sign it again "Issued for
// implementation". Each pass is its own row with its own signatures. Chains
// created before the two passes existed are read the old way: first signature
// is the review issue, the last is the implementation issue.
// Stage numbers run on across revisions, so a document issued for review (0)
// and then for implementation (1), then revised, is issued for review again as
// 2. The header's Rev. No. and Date Revised are the newest stage's.
//
// The names and titles are the people who signed, read from the sign-off
// chain. They used to be typed into the page ("Factory Coord.", "Maintenance
// Manager"), so the header asserted a sign-off whether or not one existed.
import { ROLE_LABELS } from "@/lib/roles";
import { chainFor, passOf } from "@/lib/signoff/chains";

export type DocKind = "WMS" | "JHA" | "PROCEDURE";

export type SignStep = {
  stepOrder: number;
  role: string;
  required: boolean | null;
  status: string;
  signedByName: string | null;
  signedByRole: string | null;
  signedByJobTitle?: string | null;
  signedAt: string | null;
  isOverride?: boolean | null;
};

export type DocRevision = {
  id: string;
  revision: number | null;
  changeSummary?: string | null;
  preparedByName?: string | null;
  status?: string | null;
  approvedAt?: string | null;
  effectiveDate?: string | null;
  steps: SignStep[];
};

export type Party = {
  name: string | null;
  title: string;
  signedAt: string | null;
  override: boolean;
  // False for a document approved before its signatures were kept here (the
  // 9 Nov 2026 clean slate removed every sign-off record). It reads "not on
  // record", never "awaiting": nobody is waiting to sign an approved document.
  recorded?: boolean;
};

export type HistoryRow = {
  key: string;
  rev: number;
  stage: "REVIEW" | "IMPLEMENTATION";
  date: string | null;
  description: string;
  note: string | null;
  prepared: Party[];
  reviewed: Party[];
  approved: Party[];
};

const signed = (s: SignStep) => s.status === "SIGNED";

function party(step: SignStep): Party {
  if (!signed(step)) {
    return { name: null, title: ROLE_LABELS[step.role] ?? step.role, signedAt: null, override: false };
  }
  return {
    name: step.signedByName,
    // The person's own job title when one is on their account, which is what
    // the paper prints ("Factory Supervisor"); the system role otherwise.
    title: step.signedByJobTitle || ROLE_LABELS[step.signedByRole ?? step.role] || step.role,
    signedAt: step.signedAt,
    override: !!step.isOverride,
  };
}

// Which signatures go under which column. A WMS and a JHA are prepared by the
// first signatory. A procedure's first signature is QA/QC's document control,
// which is a review, so the procedure's author is the one who prepared it.
export function columnsFor(kind: DocKind, rev: Pick<DocRevision, "preparedByName" | "steps">) {
  const steps = [...rev.steps].filter((s) => s.required !== false || signed(s)).sort((a, b) => a.stepOrder - b.stepOrder);
  if (steps.length === 0) {
    return { prepared: [] as Party[], reviewed: [] as Party[], approved: [] as Party[] };
  }
  const last = steps[steps.length - 1];
  if (kind === "PROCEDURE") {
    const author: Party = { name: rev.preparedByName ?? null, title: "Originator", signedAt: null, override: false };
    return {
      prepared: [author],
      reviewed: steps.slice(0, -1).map(party),
      approved: [party(last)],
    };
  }
  return {
    prepared: [party(steps[0])],
    reviewed: steps.slice(1, -1).map(party),
    approved: steps.length > 1 ? [party(last)] : [],
  };
}

// The steps a document of this kind is signed in, for a revision whose own
// sign-off rows no longer exist. Only the roles matter: nobody is named.
function chainShape(kind: DocKind, steps: SignStep[]): SignStep[] {
  if (steps.length > 0) return steps;
  return chainFor(kind)
    .filter((step) => !step.pass || step.pass === "IMPLEMENTATION")
    .map((step, i) => ({
    stepOrder: i + 1,
    role: step.role,
    required: true,
    status: "PENDING",
    signedByName: null,
    signedByRole: null,
    signedAt: null,
  }));
}

// Newest first, as the paper reads.
export function revisionHistory(kind: DocKind, revisions: DocRevision[]): HistoryRow[] {
  const ordered = [...revisions].sort((a, b) => (a.revision ?? 0) - (b.revision ?? 0));
  const rows: HistoryRow[] = [];
  let stage = 0;
  for (const r of ordered) {
    const steps = [...r.steps].sort((a, b) => a.stepOrder - b.stepOrder);
    const required = steps.filter((s) => s.required !== false);
    const firstSigned = steps.find(signed);
    if (!firstSigned) {
      if (r.status === "APPROVED" || r.status === "SUPERSEDED") {
        const unrecorded = (p: Party): Party => (p.name ? p : { ...p, recorded: false });
        const cols = columnsFor(kind, { ...r, steps: chainShape(kind, r.steps) });
        rows.push({
          key: `${r.id}:implementation`,
          rev: stage++,
          stage: "IMPLEMENTATION",
          date: r.approvedAt ?? r.effectiveDate ?? null,
          description: "Issued for implementation",
          note: "Approved before signatures were recorded here",
          prepared: cols.prepared.map(unrecorded),
          reviewed: cols.reviewed.map(unrecorded),
          approved: cols.approved.map(unrecorded),
        });
      }
      continue;
    }
    const note = (r.revision ?? 0) > 0 && r.changeSummary ? r.changeSummary : null;

    // Two-pass chain: each pass is a row of its own, dated when that pass's
    // last signature landed (blank while it is still being signed).
    if (steps.length === chainFor(kind).length && steps.every((s) => passOf(kind, s))) {
      for (const p of ["REVIEW", "IMPLEMENTATION"] as const) {
        const passSteps = steps.filter((s) => passOf(kind, s) === p);
        if (!passSteps.some(signed)) continue;
        const passRequired = passSteps.filter((s) => s.required !== false);
        const done = passRequired.length > 0 && passRequired.every(signed);
        rows.push({
          key: `${r.id}:${p.toLowerCase()}`,
          rev: stage++,
          stage: p,
          date: done ? passRequired.map((s) => s.signedAt ?? "").sort().at(-1) || null : null,
          description: p === "REVIEW" ? "Issued for review and approval" : "Issued for implementation",
          note: p === "REVIEW" ? note : null,
          ...columnsFor(kind, { ...r, steps: passSteps }),
        });
      }
      continue;
    }

    const cols = columnsFor(kind, r);
    rows.push({
      key: `${r.id}:review`,
      rev: stage++,
      stage: "REVIEW",
      date: firstSigned.signedAt,
      description: "Issued for review and approval",
      note,
      ...cols,
    });
    if (required.length > 0 && required.every(signed)) {
      const finalAt = required.map((s) => s.signedAt ?? "").sort().at(-1) || null;
      rows.push({
        key: `${r.id}:implementation`,
        rev: stage++,
        stage: "IMPLEMENTATION",
        date: finalAt,
        description: "Issued for implementation",
        note: null,
        ...cols,
      });
    }
  }
  return rows.reverse();
}

// "10-09-26", the date format the paper uses.
export function paperDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = iso.slice(0, 10).split("-");
  return d.length === 3 ? `${d[2]}-${d[1]}-${d[0].slice(2)}` : iso;
}

// "2026.09.10 08:59", for the signature stamp.
export function stampDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${t.getFullYear()}.${p(t.getMonth() + 1)}.${p(t.getDate())} ${p(t.getHours())}:${p(t.getMinutes())}`;
}
