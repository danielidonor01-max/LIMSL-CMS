// src/components/AssignPeople.tsx
// Who is doing the job: one accountable person, plus anyone helping.
//
// The split is deliberate. "The maintenance team" cannot be asked why a PM was
// missed, so one named person stays accountable and is what an auditor traces.
// Real jobs still take two or three people though, and before this there was
// nowhere to record them, so helpers were either invisible or someone
// reassigned the whole activity and lost the original owner.
"use client";

import { useState } from "react";
import { Users, Check } from "lucide-react";
import Modal from "./Modal";
import Button from "./Button";
import Select from "./Select";
import { LABEL_CLASS } from "./Field";
import { ROLE_LABELS } from "@/lib/roles";

export type Person = { id: string; name: string; role: string };

export default function AssignPeople({
  open,
  onClose,
  people,
  leadId,
  assistantIds,
  title,
  subtitle,
  saving,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  people: Person[];
  leadId: string | null;
  assistantIds: string[];
  title: string;
  subtitle?: string;
  saving?: boolean;
  onSave: (next: { leadId: string; leadName: string; assistantIds: string[] }) => void;
}) {
  const [lead, setLead] = useState(leadId ?? "");
  const [helpers, setHelpers] = useState<string[]>(assistantIds);

  // Reopening with a different record must not show the previous one's people.
  const [seed, setSeed] = useState(`${leadId}|${assistantIds.join(",")}`);
  const nextSeed = `${leadId}|${assistantIds.join(",")}`;
  if (seed !== nextSeed) {
    setSeed(nextSeed);
    setLead(leadId ?? "");
    setHelpers(assistantIds);
  }

  const toggleHelper = (id: string) =>
    setHelpers((h) => (h.includes(id) ? h.filter((x) => x !== id) : [...h, id]));

  const leadPerson = people.find((p) => p.id === lead);

  return (
    <Modal open={open} onClose={onClose} title={title} subtitle={subtitle}>
      <div className="space-y-4">
        <div>
          <label className={LABEL_CLASS}>Accountable person</label>
          <Select value={lead} onChange={setLead} className="w-full">
            <option value="">Unassigned</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {ROLE_LABELS[p.role] ?? p.role}
              </option>
            ))}
          </Select>
          <p className="text-[10px] text-slate-500 mt-1">
            Reminders go to this person, and this is the name against the work if it is missed.
          </p>
        </div>

        <div>
          <label className={LABEL_CLASS}>Others on the job</label>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {people
              .filter((p) => p.id !== lead)
              .map((p) => {
                const on = helpers.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggleHelper(p.id)}
                    aria-pressed={on}
                    className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-semibold border transition-colors ${
                      on
                        ? "bg-emerald-600 border-emerald-600 text-white"
                        : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    {on && <Check className="w-3 h-3" />}
                    {p.name}
                  </button>
                );
              })}
          </div>
          <p className="text-[10px] text-slate-500 mt-1.5">
            They are notified and can do the work. Accountability stays with the person above.
          </p>
        </div>

        {!lead && helpers.length > 0 && (
          <p className="text-[11px] text-amber-700">
            Helpers with nobody accountable means no reminders are sent. Name an accountable person.
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            icon={Users}
            loading={saving}
            onClick={() => onSave({ leadId: lead, leadName: leadPerson?.name ?? "", assistantIds: helpers })}
          >
            Save assignment
          </Button>
        </div>
      </div>
    </Modal>
  );
}
