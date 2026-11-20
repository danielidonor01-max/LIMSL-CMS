// src/components/ComplianceRuleSettings.tsx
// Settings: how PM compliance is counted (LIMSL, 20 Nov 2026).
//
// The windows and the moment unfinished work starts to count are the
// organisation's rule, not the software's, so the Super Admin sets them here.
// The Log, the KPI page and the schedule all read this one rule, and each
// change is written to the audit log with the rule before and after.
"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Scale } from "lucide-react";
import Button from "@/components/Button";
import SegmentedControl from "@/components/SegmentedControl";
import { FIELD_CLASS, LABEL_CLASS } from "@/components/Field";
import { FREQUENCY_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import {
  COUNT_FROM_LABELS,
  DEFAULT_COMPLIANCE_RULE,
  RULE_FREQUENCIES,
  describeRule,
  normaliseComplianceRule,
  validateComplianceRule,
  type ComplianceRule,
  type CountFrom,
} from "@/lib/maintenance/compliance-rule";

type Form = { countFrom: CountFrom; windows: Record<string, string> };

const toForm = (r: ComplianceRule): Form => ({
  countFrom: r.countFrom,
  windows: Object.fromEntries(RULE_FREQUENCIES.map((f) => [f, String(r.windows[f])])),
});

export default function ComplianceRuleSettings() {
  const [form, setForm] = useState<Form>(() => toForm(DEFAULT_COMPLIANCE_RULE));
  const [saved, setSaved] = useState<Form | null>(null);
  const [stamp, setStamp] = useState<{ by: string | null; at: string | null }>({ by: null, at: null });
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch("/api/settings/compliance-rule")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        const f = toForm(normaliseComplianceRule(d.rule));
        setForm(f);
        setSaved(f);
        setStamp({ by: d.setByName ?? null, at: d.setAt ?? null });
      })
      .catch(() => setFailed(true));
  }, []);

  const dirty = saved !== null && JSON.stringify(saved) !== JSON.stringify(form);
  const problem = validateComplianceRule(form);
  const preview = problem ? null : describeRule(normaliseComplianceRule(form));

  const save = async () => {
    if (problem) {
      toast.error(problem);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/settings/compliance-rule", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rule: form }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(d.error || "Could not save the counting rule.");
        return;
      }
      const f = toForm(normaliseComplianceRule(d.rule));
      setForm(f);
      setSaved(f);
      setStamp({ by: d.setByName ?? null, at: d.setAt ?? null });
      toast.success("Counting rule saved. The schedule, its Log and the KPI page now use it.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="bg-surface border border-line rounded-xl shadow-card p-5 space-y-5" aria-labelledby="compliance-rule-title">
      <div>
        <h3 id="compliance-rule-title" className="text-base font-semibold text-ink-900 flex items-center gap-2">
          <Scale className="w-4 h-4 text-brand-600" /> PM compliance counting rule
        </h3>
        <p className="text-xs text-ink-500 mt-1 max-w-3xl">
          One rule for the schedule, its Log, the printed record and the KPI page. Changing it changes the compliance
          figure for past quarters too, so every change is written to the audit log.
        </p>
      </div>

      {failed ? (
        <p className="text-sm text-danger-700">The counting rule could not be loaded. Reload the page to try again.</p>
      ) : (
        <>
          <div className="space-y-2">
            <span className={LABEL_CLASS}>Unfinished work starts to count against the quarter</span>
            <SegmentedControl
              ariaLabel="When unfinished work starts to count"
              value={form.countFrom}
              onChange={(v) => setForm((f) => ({ ...f, countFrom: v }))}
              options={(Object.keys(COUNT_FROM_LABELS) as CountFrom[]).map((k) => ({ value: k, label: COUNT_FROM_LABELS[k] }))}
            />
            <p className="text-xs text-ink-500 max-w-3xl">
              {form.countFrom === "WINDOW_CLOSED"
                ? "A PM past its date but still inside its window is shown as due with its window still open. It counts as missed only when the window closes without it being done."
                : "A PM counts as missed the day after its planned date, even though it can still be completed inside its window and then count as done."}
            </p>
          </div>

          <div className="space-y-2">
            <span className={LABEL_CLASS}>Window: days after the planned date in which a completion still counts</span>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {RULE_FREQUENCIES.map((f) => (
                <div key={f}>
                  <label htmlFor={`window-${f}`} className="block text-xs text-ink-600 mb-1">
                    {FREQUENCY_LABELS[f] ?? f}
                  </label>
                  <input
                    id={`window-${f}`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={90}
                    step={1}
                    value={form.windows[f]}
                    onChange={(e) => setForm((x) => ({ ...x, windows: { ...x.windows, [f]: e.target.value } }))}
                    className={`${FIELD_CLASS} tabular-nums`}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-line bg-canvas px-4 py-3 text-xs text-ink-700">
            {problem ? <span className="text-danger-700">{problem}</span> : preview}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-ink-500">
              {stamp.at ? `Last changed ${formatDate(stamp.at)}${stamp.by ? ` by ${stamp.by}` : ""}.` : "Not changed yet: the standard rule is in force."}
            </p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => setForm(toForm(DEFAULT_COMPLIANCE_RULE))}
                disabled={JSON.stringify(form) === JSON.stringify(toForm(DEFAULT_COMPLIANCE_RULE))}
              >
                Standard rule
              </Button>
              <Button onClick={save} loading={saving} disabled={!dirty || !!problem}>
                Save rule
              </Button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
