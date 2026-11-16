// src/lib/signoff/milestones.ts
// What a signature just achieved. Most signatures move a document one step;
// a few finish a pass or finish the document, and those are the moments the
// rest of the trail is waiting to hear about. Pure, so the signer's toast and
// the trail's notification read the same answer.
import { chainSummary, nextPendingStep, passOf } from "@/lib/signoff/chains";
import { ROLE_LABELS } from "@/lib/roles";

export type MilestoneKind = "SIGNED" | "PASS_COMPLETE" | "CHAIN_COMPLETE";

export type Milestone = {
  kind: MilestoneKind;
  /** The pass the signature finished, on a two-pass document. */
  pass: "REVIEW" | "IMPLEMENTATION" | null;
  /** Who signs next, when anyone does. */
  next: { roleLabel: string; who: string } | null;
};

type Row = {
  stepOrder: number;
  role: string;
  roleLabel: string;
  required: boolean | null;
  status: string;
  signerUserName?: string | null;
};

export function milestoneAfterSign(entityType: string, chain: Row[], signedStepOrder: number): Milestone {
  const nextStep = nextPendingStep(chain);
  const next = nextStep
    ? {
        roleLabel: nextStep.roleLabel.replace(/^Issue for (review|implementation): /, ""),
        who: nextStep.signerUserName ?? ROLE_LABELS[nextStep.role] ?? nextStep.role,
      }
    : null;

  if (chainSummary(chain).complete) return { kind: "CHAIN_COMPLETE", pass: null, next: null };

  const signed = chain.find((s) => s.stepOrder === signedStepOrder);
  const pass = signed ? passOf(entityType, signed) : null;
  if (pass) {
    const passSteps = chain.filter((s) => s.required && passOf(entityType, s) === pass);
    if (passSteps.length > 0 && passSteps.every((s) => s.status === "SIGNED")) {
      return { kind: "PASS_COMPLETE", pass, next };
    }
  }
  return { kind: "SIGNED", pass, next };
}

// The words, for a toast or a notification title.
export function milestoneHeadline(m: Milestone, docLabel: string): string {
  if (m.kind === "CHAIN_COMPLETE") return `${docLabel} fully signed`;
  if (m.kind === "PASS_COMPLETE" && m.pass === "REVIEW") return `${docLabel}: issued for review and approval`;
  if (m.kind === "PASS_COMPLETE") return `${docLabel}: issued for implementation`;
  return "Signed";
}

export function milestoneDetail(m: Milestone): string {
  if (m.kind === "CHAIN_COMPLETE") return "Every required signature is in.";
  if (m.kind === "PASS_COMPLETE" && m.pass === "REVIEW") {
    return m.next ? `Pass 1 is complete. Pass 2, issue for implementation, starts with ${m.next.who}.` : "Pass 1 is complete.";
  }
  return m.next ? `Next: ${m.next.roleLabel} (${m.next.who}).` : "";
}
