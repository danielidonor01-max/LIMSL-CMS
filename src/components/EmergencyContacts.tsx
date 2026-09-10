// src/components/EmergencyContacts.tsx
// Who to ring when something has gone wrong.
//
// The numbers are tel: links and the touch targets are large, because this list
// is read one-handed by somebody who is already dealing with the emergency. It
// is not a table to be studied.
//
// Nothing is pre-filled. An emergency contact list shipped with plausible
// placeholder numbers is worse than an empty one: an empty list is obviously
// unfinished, and a wrong number is discovered by the person dialling it.
"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Phone, Plus, Trash2, PhoneOff } from "lucide-react";
import Button from "@/components/Button";
import Modal from "@/components/Modal";
import Select from "@/components/Select";
import EmptyState from "@/components/EmptyState";
import { FIELD_CLASS, LABEL_CLASS } from "@/components/Field";
import { CONTACT_KINDS, contactKindLabel } from "@/lib/hse/emergency-contact-kinds";

type Contact = {
  id: string;
  name: string;
  organisation: string | null;
  kind: string;
  phone: string;
  altPhone: string | null;
  notes: string | null;
};

// One list, shared with the public scan passport, which shows the same contacts
// to somebody standing at a machine.
const KINDS = CONTACT_KINDS;

export default function EmergencyContacts({ canWrite }: { canWrite: boolean }) {
  const [rows, setRows] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [organisation, setOrganisation] = useState("");
  const [kind, setKind] = useState("FIRE");
  const [phone, setPhone] = useState("");
  const [altPhone, setAltPhone] = useState("");
  const [notes, setNotes] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/emergency/contacts");
      if (res.ok) setRows(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const add = async () => {
    if (!name.trim() || !phone.trim()) {
      toast.error("A contact needs a name and a number.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/emergency/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          organisation,
          kind,
          phone,
          altPhone,
          notes,
          displayOrder: KINDS.find((k) => k.value === kind)?.order ?? 100,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || "Could not add the contact.");
        return;
      }
      toast.success(`${name} added.`);
      setOpen(false);
      setName("");
      setOrganisation("");
      setPhone("");
      setAltPhone("");
      setNotes("");
      await load();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (c: Contact) => {
    const res = await fetch(`/api/emergency/contacts?id=${c.id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success(`${c.name} removed.`);
      await load();
    } else {
      toast.error("Could not remove the contact.");
    }
  };

  if (loading) {
    return <p className="text-sm text-ink-500 p-6">Loading contacts…</p>;
  }

  return (
    <div className="space-y-4">
      {canWrite && (
        <div className="flex justify-end">
          <Button icon={Plus} onClick={() => setOpen(true)}>
            Add a contact
          </Button>
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          icon={PhoneOff}
          title="No emergency contacts recorded"
          message="Fire service, ambulance, the nearest clinic, the site first aiders. Nothing is pre-filled here on purpose: a wrong number in this list is discovered by whoever dials it."
          actionLabel={canWrite ? "Add a contact" : undefined}
          onAction={canWrite ? () => setOpen(true) : undefined}
        />
      ) : (
        <div className="bg-surface border border-line rounded-2xl shadow-card overflow-hidden divide-y divide-line">
          {rows.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-4 px-5 py-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink-900">{c.name}</p>
                <p className="text-xs text-ink-600">
                  {contactKindLabel(c.kind)}
                  {c.organisation ? ` · ${c.organisation}` : ""}
                </p>
                {c.notes && <p className="text-xs text-ink-500 mt-0.5">{c.notes}</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {/* Dialable, not text to copy. This list is read one-handed
                    by somebody already dealing with the emergency. */}
                <Button variant="danger" icon={Phone} href={`tel:${c.phone.replace(/\s+/g, "")}`}>
                  {c.phone}
                </Button>
                {c.altPhone && (
                  <Button variant="secondary" href={`tel:${c.altPhone.replace(/\s+/g, "")}`}>
                    {c.altPhone}
                  </Button>
                )}
                {canWrite && (
                  <button
                    onClick={() => remove(c)}
                    aria-label={`Remove ${c.name}`}
                    title={`Remove ${c.name}`}
                    className="p-2 text-ink-400 hover:text-danger-600 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Add an emergency contact">
        <div className="space-y-4">
          <div className="space-y-2">
            <label className={LABEL_CLASS}>Who</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Lagos State Fire Service, Dr Adaeze, night-shift warden"
              className={FIELD_CLASS}
            />
          </div>
          <div className="space-y-2">
            <label className={LABEL_CLASS}>Kind</label>
            <Select value={kind} onChange={setKind} className="w-full" ariaLabel="Kind of contact">
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className={LABEL_CLASS}>Number</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                inputMode="tel"
                className={FIELD_CLASS}
              />
            </div>
            <div className="space-y-2">
              <label className={LABEL_CLASS}>Second number (optional)</label>
              <input
                value={altPhone}
                onChange={(e) => setAltPhone(e.target.value)}
                inputMode="tel"
                className={FIELD_CLASS}
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className={LABEL_CLASS}>Organisation (optional)</label>
            <input
              value={organisation}
              onChange={(e) => setOrganisation(e.target.value)}
              className={FIELD_CLASS}
            />
          </div>
          <div className="space-y-2">
            <label className={LABEL_CLASS}>Notes (optional)</label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ask for the duty officer, 24 hours"
              className={FIELD_CLASS}
            />
          </div>
          <div className="flex items-center gap-2 pt-2">
            <Button loading={saving} onClick={add}>
              Add contact
            </Button>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
