// src/app/incidents/new/page.tsx
// Reporting a near miss or an incident.
//
// Three questions above the fold: what kind of event, what happened, when. That
// is the entire required form, and it is a product decision rather than a
// shortcut. Near misses are the warnings that arrive before anybody is hurt,
// and a form that asks twelve questions gets used the first week and abandoned
// by the third.
//
// Everything else is optional and folded away. The investigation fills the rest.
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Siren, Save, ChevronDown } from "lucide-react";
import Button from "@/components/Button";
import PageHeader from "@/components/PageHeader";
import Select from "@/components/Select";
import DateTimeField from "@/components/DateTimeField";
import { FIELD_CLASS, LABEL_CLASS } from "@/components/Field";
import { INCIDENT_TYPES, isSerious } from "@/lib/hse/incidents";

export default function ReportIncidentPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [more, setMore] = useState(false);

  const [type, setType] = useState<string>("NEAR_MISS");
  const [description, setDescription] = useState("");
  const [occurredAt, setOccurredAt] = useState(new Date().toISOString().slice(0, 16));
  const [location, setLocation] = useState("");
  const [injuredPersonName, setInjuredPersonName] = useState("");
  const [witnesses, setWitnesses] = useState("");
  const [immediateAction, setImmediateAction] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (description.trim().length < 10) {
      toast.error("Describe what happened, in a sentence or two.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          description,
          occurredAt,
          location: location || undefined,
          injuredPersonName: injuredPersonName || undefined,
          witnesses: witnesses || undefined,
          immediateAction: immediateAction || undefined,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || "Could not file the report.");
        return;
      }
      toast.success(`${d.incidentNumber} reported. HSE has been notified.`);
      router.push(`/incidents/${d.id}`);
    } catch {
      toast.error("Could not file the report.");
    } finally {
      setSaving(false);
    }
  };

  const selected = INCIDENT_TYPES.find((t) => t.value === type);

  return (
    <div className="min-h-screen bg-canvas text-ink-900 flex flex-col font-sans">
      <main className="flex-1 p-6 lg:p-8 max-w-2xl w-full mx-auto space-y-6">
        <PageHeader
          title="Report an event"
          subtitle="Three questions. Anyone can file this, and filing it early is the point."
          backHref="/incidents"
          backLabel="Incidents & near misses"
        />

        <form onSubmit={submit} className="bg-surface border border-line rounded-2xl shadow-card p-6 space-y-6">
          <div className="space-y-2">
            <label className={LABEL_CLASS}>What kind of event was it?</label>
            <Select value={type} onChange={setType} ariaLabel="Type of event" className="w-full">
              {INCIDENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
            {selected && <p className="text-xs text-ink-500 leading-relaxed">{selected.help}</p>}
            {isSerious(type) && (
              <p className="text-xs text-warn-700 leading-relaxed">
                This type cannot be closed without a documented root cause, and the Factory Manager
                is notified along with HSE.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className={LABEL_CLASS}>What happened?</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              required
              placeholder="What you saw, in your own words. Somebody investigating this next week has only these words."
              className={FIELD_CLASS}
            />
          </div>

          <div className="space-y-2">
            <label className={LABEL_CLASS}>When did it happen?</label>
            <DateTimeField
              value={occurredAt}
              onChange={setOccurredAt}
              ariaLabel="When the event happened"
              max={new Date().toISOString().slice(0, 16)}
            />
          </div>

          {/* Everything below is optional. It is folded away so the required
              three are the whole form until somebody chooses otherwise. */}
          <div className="border-t border-line pt-4">
            <button
              type="button"
              onClick={() => setMore((m) => !m)}
              aria-expanded={more}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-600 hover:text-ink-900 min-h-11"
            >
              <ChevronDown className={`w-4 h-4 transition-transform ${more ? "rotate-180" : ""}`} />
              {more ? "Hide extra detail" : "Add more detail (optional)"}
            </button>

            {more && (
              <div className="space-y-4 mt-3">
                <div className="space-y-2">
                  <label className={LABEL_CLASS}>Where</label>
                  <input
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Bay 2, welding booth, stores yard"
                    className={FIELD_CLASS}
                  />
                </div>
                <div className="space-y-2">
                  <label className={LABEL_CLASS}>Anyone hurt</label>
                  <input
                    value={injuredPersonName}
                    onChange={(e) => setInjuredPersonName(e.target.value)}
                    placeholder="Leave blank if nobody was hurt"
                    className={FIELD_CLASS}
                  />
                </div>
                <div className="space-y-2">
                  <label className={LABEL_CLASS}>Witnesses</label>
                  <input
                    value={witnesses}
                    onChange={(e) => setWitnesses(e.target.value)}
                    className={FIELD_CLASS}
                  />
                </div>
                <div className="space-y-2">
                  <label className={LABEL_CLASS}>What was done straight away</label>
                  <textarea
                    value={immediateAction}
                    onChange={(e) => setImmediateAction(e.target.value)}
                    rows={2}
                    placeholder="Area barriered off, machine isolated, first aid given"
                    className={FIELD_CLASS}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button type="submit" icon={saving ? undefined : Save} loading={saving}>
              File the report
            </Button>
            <p className="text-xs text-ink-500">Filed in your name. HSE is notified immediately.</p>
          </div>
        </form>

        <p className="text-xs text-ink-500 leading-relaxed inline-flex items-start gap-2">
          <Siren className="w-4 h-4 shrink-0 mt-0.5 text-ink-400" />
          If anyone is injured or in danger right now, deal with that first. This form can wait.
        </p>
      </main>
    </div>
  );
}
