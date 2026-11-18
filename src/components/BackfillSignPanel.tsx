// src/components/BackfillSignPanel.tsx
// Signing the records entered from the paper file, together (LIMSL, 18 Nov 2026).
//
// Each signature still goes through POST /api/signoffs/[id], one record at a
// time, so every rule on a single signature holds here too: the signer's own
// login, their PIN if they set one, the order of the chain, one person per step.
// Only steps named to this person reach this panel. Method statements and hazard
// analyses never do: those are read and signed one at a time.
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import Button from "@/components/Button";
import { OtpInput } from "@/components/OtpInput";
import { PIN_LENGTH } from "@/lib/signing-pin";
import { invalidateApi } from "@/lib/api-cache";

type BackfillItem = { signoffId: string; kind: string; href: string; code: string | null };

const AT_ONCE = 4;
const SIGN_COMMENT = "Checked against the paper record.";

/** A checklist is read on its work order; its /pm-checklist path is the blank form. */
const readHref = (href: string) => href.replace(/\/pm-checklist$/, "");

export default function BackfillSignPanel({ items, onDone }: { items: BackfillItem[]; onDone: () => void }) {
  const [checked, setChecked] = useState(false);
  const [hasPin, setHasPin] = useState(false);
  const [pin, setPin] = useState("");
  const [running, setRunning] = useState(false);
  const [signed, setSigned] = useState(0);
  const [total, setTotal] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/account/signing-pin")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setHasPin(!!d?.hasPin))
      .catch(() => setHasPin(false));
  }, []);

  const byKind = useMemo(() => {
    const groups = new Map<string, BackfillItem[]>();
    for (const i of items) groups.set(i.kind, [...(groups.get(i.kind) ?? []), i]);
    return [...groups.entries()];
  }, [items]);

  const ready = checked && !running && (!hasPin || pin.length === PIN_LENGTH);

  async function signAll() {
    const queue = [...items];
    setRunning(true);
    setProblem(null);
    setSigned(0);
    setTotal(queue.length);
    let done = 0;
    let failed = 0;
    let stop = false;

    const worker = async () => {
      while (queue.length > 0 && !stop) {
        const item = queue.shift()!;
        try {
          const res = await fetch(`/api/signoffs/${item.signoffId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "sign", comments: SIGN_COMMENT, ...(hasPin ? { signingPin: pin } : {}) }),
          });
          if (res.ok) {
            done += 1;
            setSigned(done);
            continue;
          }
          const body = await res.json().catch(() => ({}));
          failed += 1;
          setProblem(body.error || "A record could not be signed.");
          // A wrong PIN fails every record the same way, and repeating it helps nobody.
          if (body.requiresPin) stop = true;
        } catch {
          failed += 1;
          setProblem("The connection dropped. Press sign again to carry on from where it stopped.");
          stop = true;
        }
      }
    };

    await Promise.all(Array.from({ length: AT_ONCE }, worker));
    setRunning(false);
    setPin("");
    setChecked(false);
    invalidateApi("/api/approvals");
    if (done > 0) toast.success(`${done} record${done === 1 ? "" : "s"} signed.`);
    if (failed > 0) toast.error(`${failed} record${failed === 1 ? "" : "s"} not signed.`);
    onDone();
  }

  return (
    <section className="p-5 bg-surface border border-line rounded-xl shadow-card space-y-4" aria-labelledby="backfill-title">
      <div className="space-y-1">
        <h2 id="backfill-title" className="text-base font-semibold text-ink-900">
          {items.length} record{items.length === 1 ? "" : "s"} from the paper file need your signature
        </h2>
        <p className="text-sm text-ink-600 max-w-3xl">
          These PMs and inspections were done on paper and have now been entered. Your signature is dated today.
          Check them against the paper file first, and do not sign anything that does not match it.
        </p>
      </div>

      <ul className="divide-y divide-line border border-line rounded-lg">
        {byKind.map(([kind, list]) => (
          <li key={kind} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
            <span className="text-ink-800">
              {kind} <span className="text-ink-500 tabular-nums">· {list.length}</span>
            </span>
            <Link href={readHref(list[0].href)} className="text-brand-700 hover:underline shrink-0">
              Open the first one
            </Link>
          </li>
        ))}
      </ul>

      <label className="flex items-start gap-2.5 text-sm text-ink-800">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={checked}
          disabled={running}
          onChange={(e) => setChecked(e.target.checked)}
        />
        <span>I have checked these records against the paper file, and they match it.</span>
      </label>

      {hasPin && (
        <div className="space-y-1.5">
          <p className="text-sm text-ink-700">Your signing PIN</p>
          <OtpInput value={pin} onChange={setPin} length={PIN_LENGTH} mask disabled={running} />
        </div>
      )}

      {problem && (
        <p role="alert" className="text-sm text-danger-700">
          {problem}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={signAll} disabled={!ready} loading={running}>
          {running ? `Signing ${signed} of ${total}` : `Sign ${items.length} record${items.length === 1 ? "" : "s"}`}
        </Button>
        {running && <span className="text-sm text-ink-600">Keep this page open until it finishes.</span>}
      </div>
    </section>
  );
}
