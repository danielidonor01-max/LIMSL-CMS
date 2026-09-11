// src/components/ChainPreview.tsx
// The signatures a document will need, shown while it is still being drafted.
//
// <SignoffChain /> renders a chain that EXISTS: real steps, real signatures, on
// a saved record. There is no chain yet while somebody is filling in the form,
// and the forms compensated by describing it in a sentence — "this goes for
// review and approval" — which does not say who, or how many, or in what order.
//
// That matters most on a method statement. The person drafting one is deciding
// how much detail to put in, and four named authorities reading it is a
// different proposition from a supervisor glancing at it. Naming them changes
// what gets written.
//
// Read-only and deliberately not interactive: nothing here can be signed,
// because there is nothing to sign yet.
import { CheckCircle2 } from "lucide-react";
import type { ChainStep } from "@/lib/signoff/chains";

export default function ChainPreview({
  steps,
  title = "Signatures this will need",
  note,
}: {
  steps: ChainStep[];
  title?: string;
  note?: string;
}) {
  // Numbered because this genuinely is a sequence: the engine refuses a
  // signature until every earlier required step is signed, so the order is a
  // rule rather than a layout choice.
  return (
    <div className="rounded-lg border border-ink-200 bg-ink-50 p-4">
      <h3 className="text-sm font-medium text-ink-700 flex items-center gap-2">
        <CheckCircle2 className="w-4 h-4 text-ink-400" />
        {title}
      </h3>
      <ol className="mt-3 space-y-2">
        {steps.map((step, i) => (
          <li key={`${step.role}-${i}`} className="flex items-start gap-3">
            <span className="shrink-0 w-5 h-5 rounded-full bg-surface border border-ink-300 text-[11px] font-semibold text-ink-600 flex items-center justify-center tabular-nums mt-px">
              {i + 1}
            </span>
            <span className="min-w-0 text-sm text-ink-700">
              {step.roleLabel}
              {!step.required && (
                <span className="text-ink-500"> — only when it applies</span>
              )}
            </span>
          </li>
        ))}
      </ol>
      {note && <p className="text-[11px] text-ink-500 mt-3 leading-relaxed">{note}</p>}
    </div>
  );
}
