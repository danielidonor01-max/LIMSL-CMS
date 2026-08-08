// src/app/contractors/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { HardHat, Plus, Search, AlertTriangle, Download, ShieldOff, ShieldCheck, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useApi } from "@/lib/api-cache";
import Button from "@/components/Button";
import Modal from "@/components/Modal";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import TableSkeleton from "@/components/TableSkeleton";
import LoadError from "@/components/LoadError";
import { Badge } from "@/components/Badge";
import Field, { FIELD_CLASS } from "@/components/Field";
import { downloadCSV } from "@/lib/export";
import { formatDate } from "@/lib/utils";
import { COMPLIANCE_WRITE_ROLES } from "@/lib/roles";

type Person = {
  id: string;
  name: string;
  jobTitle: string | null;
  inductionValidUntil: string | null;
  eligibility: { eligible: boolean; message: string | null };
};

type Contractor = {
  id: string;
  companyName: string;
  tradeSpecialty: string | null;
  contactPerson: string | null;
  phone: string | null;
  insuranceProvider: string | null;
  insuranceExpiryDate: string | null;
  inductionValidUntil: string | null;
  status: string;
  suspensionReason: string | null;
  eligibility: {
    eligible: boolean;
    messages: string[];
    expiringSoon: string[];
  };
  personnel: Person[];
};

const emptyForm = {
  companyName: "",
  tradeSpecialty: "",
  contactPerson: "",
  phone: "",
  email: "",
  insuranceProvider: "",
  insurancePolicyNumber: "",
  insuranceExpiryDate: "",
  inductionDate: "",
  inductionValidUntil: "",
};

export default function ContractorsPage() {
  const { data, loading, error, refresh } = useApi<{ contractors: Contractor[]; summary: any } | null>(
    "/api/contractors",
    null,
  );
  const { data: session } = useSession();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const canWrite = mounted && COMPLIANCE_WRITE_ROLES.includes((session?.user as { role?: string })?.role ?? "");

  const [q, setQ] = useState("");
  const [blockedOnly, setBlockedOnly] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [suspend, setSuspend] = useState<{ c: Contractor; reason: string } | null>(null);
  const [addPerson, setAddPerson] = useState<{ c: Contractor; name: string; jobTitle: string; inductionValidUntil: string } | null>(null);

  const list = data?.contractors ?? [];
  const summary = data?.summary;

  const filtered = useMemo(() => {
    let out = list;
    if (blockedOnly) out = out.filter((c) => !c.eligibility.eligible);
    if (q.trim()) {
      const t = q.toLowerCase();
      out = out.filter(
        (c) =>
          c.companyName.toLowerCase().includes(t) ||
          (c.tradeSpecialty ?? "").toLowerCase().includes(t) ||
          (c.contactPerson ?? "").toLowerCase().includes(t),
      );
    }
    return out;
  }, [list, q, blockedOnly]);

  const post = async (body: unknown, ok: string) => {
    setSaving(true);
    try {
      const res = await fetch("/api/contractors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || "Failed.");
        return false;
      }
      toast.success(ok);
      refresh();
      return true;
    } finally {
      setSaving(false);
    }
  };

  const submitSuspend = async () => {
    if (!suspend) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/contractors/${suspend.c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "suspend", suspensionReason: suspend.reason }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || "Failed to suspend.");
        return;
      }
      toast.success(`${suspend.c.companyName} suspended — no permit can be issued to them.`);
      setSuspend(null);
      refresh();
    } finally {
      setSaving(false);
    }
  };

  const reinstate = async (c: Contractor) => {
    const res = await fetch(`/api/contractors/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reinstate" }),
    });
    const d = await res.json();
    if (!res.ok) {
      toast.error(d.error || "Failed.");
      return;
    }
    if (d.eligibility && !d.eligibility.eligible) {
      toast.warning(`Reinstated, but still blocked: ${d.eligibility.messages.join(" ")}`);
    } else {
      toast.success(`${c.companyName} reinstated.`);
    }
    refresh();
  };

  const exportCsv = () =>
    downloadCSV(
      `contractors-${new Date().toISOString().slice(0, 10)}`,
      filtered.map((c) => ({
        Company: c.companyName,
        Trade: c.tradeSpecialty ?? "",
        Contact: c.contactPerson ?? "",
        Phone: c.phone ?? "",
        Insurer: c.insuranceProvider ?? "",
        "Insurance expires": c.insuranceExpiryDate ?? "Not recorded",
        "Induction valid to": c.inductionValidUntil ?? "Not recorded",
        Status: c.status,
        "May work on site": c.eligibility.eligible ? "Yes" : "No",
        "Why not": c.eligibility.messages.join(" "),
        People: c.personnel.length,
      })),
    );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      <main className="flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto space-y-5">
        <PageHeader
          icon={HardHat}
          title="Contractors"
          subtitle="Insurance and site induction, checked before a permit can be issued — ISO 45001 clause 8.1.4.2"
          code="LIMSL-HSE-CON-018"
          backHref="/"
          backLabel="Dashboard"
          actions={
            <>
              <Button variant="secondary" icon={Download} onClick={exportCsv} disabled={!filtered.length}>
                Export
              </Button>
              {canWrite && (
                <Button icon={Plus} onClick={() => setShowAdd(true)}>
                  Add Contractor
                </Button>
              )}
            </>
          }
        />

        {!loading && summary && summary.total > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className={`p-4 rounded-xl border ${summary.blocked > 0 ? "bg-rose-50 border-rose-200" : "bg-emerald-50 border-emerald-200"}`}>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Cleared to work</p>
              <p className="text-3xl font-bold text-slate-900 mt-2">
                {summary.eligible}
                <span className="text-lg text-slate-500 font-semibold"> / {summary.total}</span>
              </p>
              <p className="text-[11px] text-slate-600 mt-1">
                {summary.blocked > 0 ? `${summary.blocked} cannot be given a permit today` : "Every contractor is current"}
              </p>
            </div>
            <div className={`p-4 rounded-xl border ${summary.expiringSoon > 0 ? "bg-amber-50 border-amber-200" : "bg-white border-slate-200"}`}>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Expiring within 30 days</p>
              <p className="text-3xl font-bold text-slate-900 mt-2">{summary.expiringSoon}</p>
              <p className="text-[11px] text-slate-600 mt-1">Chase these before they block a job</p>
            </div>
            <div className="p-4 rounded-xl border bg-white border-slate-200">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Enforcement</p>
              <p className="text-sm text-slate-700 mt-2 leading-relaxed">
                A permit naming a blocked contractor is refused at issue — this register is a gate, not a list.
              </p>
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Company, trade or contact…"
              className="w-full bg-white border border-slate-200 rounded-lg min-h-11 pl-10 pr-4 text-sm focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15"
            />
          </div>
          <button
            onClick={() => setBlockedOnly((v) => !v)}
            aria-pressed={blockedOnly}
            className={`inline-flex items-center gap-2 px-3 min-h-11 rounded-lg border text-xs font-semibold w-fit transition-colors ${
              blockedOnly ? "bg-rose-50 border-rose-300 text-rose-700" : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
            }`}
          >
            <AlertTriangle className="w-4 h-4" /> Blocked only
          </button>
        </div>

        {error && !loading ? (
          <div className="bg-white border border-slate-200 rounded-xl">
            <LoadError what="the contractor register" onRetry={refresh} />
          </div>
        ) : loading ? (
          <div className="bg-white border border-slate-200 rounded-xl">
            <TableSkeleton rows={4} cols={4} />
          </div>
        ) : !filtered.length ? (
          <div className="bg-white border border-slate-200 rounded-xl">
            {q.trim() || blockedOnly ? (
              <EmptyState
                icon={Search}
                title={blockedOnly ? "Nobody is blocked" : "No contractor matches that search"}
                message={
                  blockedOnly
                    ? "Every contractor on the register has current insurance and induction."
                    : "No company, trade or contact matches what you typed."
                }
                actionLabel="Clear"
                onAction={() => {
                  setQ("");
                  setBlockedOnly(false);
                }}
              />
            ) : (
              <EmptyState
                icon={HardHat}
                title="No contractors registered"
                message="Add the companies that come on site — OEM engineers, electricians, riggers. Recording their insurance expiry and induction date is what lets the system refuse a permit when either has lapsed."
                actionLabel={canWrite ? "Add the first contractor" : undefined}
                onAction={canWrite ? () => setShowAdd(true) : undefined}
              />
            )}
          </div>
        ) : (
          <div className="grid gap-3">
            {filtered.map((c) => (
              <div
                key={c.id}
                data-list-card
                className={`bg-white border rounded-xl p-4 space-y-3 ${
                  c.eligibility.eligible ? "border-slate-200" : "border-rose-200"
                }`}
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-slate-900">{c.companyName}</p>
                      {c.eligibility.eligible ? (
                        <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-500/20">May work on site</Badge>
                      ) : (
                        <Badge className="bg-rose-500/10 text-rose-700 border-rose-500/20">Blocked</Badge>
                      )}
                      {c.status === "SUSPENDED" && (
                        <Badge className="bg-slate-800 text-white border-slate-800">Suspended</Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {c.tradeSpecialty ?? "Trade not recorded"}
                      {c.contactPerson ? ` · ${c.contactPerson}` : ""}
                      {c.phone ? ` · ${c.phone}` : ""}
                    </p>
                  </div>
                  {canWrite && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => setAddPerson({ c, name: "", jobTitle: "", inductionValidUntil: "" })}
                        className="inline-flex items-center gap-1.5 px-2.5 min-h-9 rounded-lg border border-slate-200 text-slate-600 text-[11px] font-semibold hover:bg-slate-50"
                      >
                        <UserPlus className="w-3.5 h-3.5" /> Add person
                      </button>
                      {c.status === "SUSPENDED" ? (
                        <button
                          onClick={() => reinstate(c)}
                          className="inline-flex items-center gap-1.5 px-2.5 min-h-9 rounded-lg border border-emerald-200 text-emerald-700 text-[11px] font-semibold hover:bg-emerald-50"
                        >
                          <ShieldCheck className="w-3.5 h-3.5" /> Reinstate
                        </button>
                      ) : (
                        <button
                          onClick={() => setSuspend({ c, reason: "" })}
                          className="inline-flex items-center gap-1.5 px-2.5 min-h-9 rounded-lg border border-rose-200 text-rose-700 text-[11px] font-semibold hover:bg-rose-50"
                        >
                          <ShieldOff className="w-3.5 h-3.5" /> Suspend
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {!c.eligibility.eligible && (
                  <div className="rounded-lg bg-rose-50 border border-rose-200 p-2.5">
                    <p className="text-[11px] text-rose-900 leading-relaxed">
                      {c.eligibility.messages.join(" ")}
                      {c.suspensionReason ? ` (${c.suspensionReason})` : ""}
                    </p>
                  </div>
                )}
                {c.eligibility.expiringSoon.length > 0 && (
                  <p className="text-[11px] text-amber-700">{c.eligibility.expiringSoon.join(" ")}</p>
                )}

                <div className="grid grid-cols-2 gap-3 text-[11px] pt-1 border-t border-slate-100">
                  <div>
                    <p className="font-semibold text-slate-500 uppercase tracking-wider">Insurance to</p>
                    <p className="text-slate-800 mt-0.5">
                      {c.insuranceExpiryDate ? formatDate(c.insuranceExpiryDate) : <span className="text-rose-600">Not recorded</span>}
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-500 uppercase tracking-wider">Induction to</p>
                    <p className="text-slate-800 mt-0.5">
                      {c.inductionValidUntil ? formatDate(c.inductionValidUntil) : <span className="text-rose-600">Not recorded</span>}
                    </p>
                  </div>
                </div>

                {c.personnel.length > 0 && (
                  <details className="text-[11px]">
                    <summary className="cursor-pointer text-slate-500 hover:text-slate-900 select-none">
                      {c.personnel.length} person{c.personnel.length === 1 ? "" : "s"} inducted
                    </summary>
                    <ul className="mt-2 space-y-1">
                      {c.personnel.map((p) => (
                        <li key={p.id} className="flex justify-between gap-3 py-1 border-b border-slate-50">
                          <span className="text-slate-700">
                            {p.name}
                            {p.jobTitle ? <span className="text-slate-400"> · {p.jobTitle}</span> : null}
                          </span>
                          <span className={p.eligibility.eligible ? "text-emerald-700" : "text-rose-700"}>
                            {p.eligibility.eligible ? formatDate(p.inductionValidUntil ?? "") : p.eligibility.message}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Add contractor */}
        <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add a contractor" subtitle="Insurance and induction dates are what the permit gate checks">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!form.companyName.trim()) {
                toast.error("A company name is required.");
                return;
              }
              if (await post(form, `${form.companyName} added.`)) {
                setShowAdd(false);
                setForm(emptyForm);
              }
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Company name *" htmlFor="c-name">
                <input id="c-name" value={form.companyName} onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))} className={FIELD_CLASS} required />
              </Field>
              <Field label="Trade" htmlFor="c-trade">
                <input id="c-trade" value={form.tradeSpecialty} onChange={(e) => setForm((f) => ({ ...f, tradeSpecialty: e.target.value }))} placeholder="e.g. CNC service engineer" className={FIELD_CLASS} />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Contact" htmlFor="c-contact">
                <input id="c-contact" value={form.contactPerson} onChange={(e) => setForm((f) => ({ ...f, contactPerson: e.target.value }))} className={FIELD_CLASS} />
              </Field>
              <Field label="Phone" htmlFor="c-phone">
                <input id="c-phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className={FIELD_CLASS} />
              </Field>
              <Field label="Email" htmlFor="c-email">
                <input id="c-email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className={FIELD_CLASS} />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Insurer" htmlFor="c-ins">
                <input id="c-ins" value={form.insuranceProvider} onChange={(e) => setForm((f) => ({ ...f, insuranceProvider: e.target.value }))} className={FIELD_CLASS} />
              </Field>
              <Field label="Policy number" htmlFor="c-pol">
                <input id="c-pol" value={form.insurancePolicyNumber} onChange={(e) => setForm((f) => ({ ...f, insurancePolicyNumber: e.target.value }))} className={FIELD_CLASS} />
              </Field>
              <Field label="Insurance expires" htmlFor="c-insexp">
                <input id="c-insexp" type="date" value={form.insuranceExpiryDate} onChange={(e) => setForm((f) => ({ ...f, insuranceExpiryDate: e.target.value }))} className={FIELD_CLASS} />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Site induction given" htmlFor="c-ind">
                <input id="c-ind" type="date" value={form.inductionDate} onChange={(e) => setForm((f) => ({ ...f, inductionDate: e.target.value }))} className={FIELD_CLASS} />
              </Field>
              <Field label="Induction valid until" htmlFor="c-indexp">
                <input id="c-indexp" type="date" value={form.inductionValidUntil} onChange={(e) => setForm((f) => ({ ...f, inductionValidUntil: e.target.value }))} className={FIELD_CLASS} />
              </Field>
            </div>
            <p className="text-[11px] text-slate-500 -mt-1">
              Leaving either date blank blocks the contractor rather than clearing them — &ldquo;never checked&rdquo;
              and &ldquo;checked and valid&rdquo; must not look the same to whoever issues the permit.
            </p>

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button type="submit" loading={saving} icon={Plus}>Add contractor</Button>
            </div>
          </form>
        </Modal>

        {/* Suspend */}
        <Modal open={!!suspend} onClose={() => setSuspend(null)} title="Suspend this contractor" subtitle={suspend?.c.companyName}>
          {suspend && (
            <div className="space-y-4">
              <p className="text-xs text-slate-600">
                While suspended, no permit can be issued naming this company — the request is refused at the point of
                issue.
              </p>
              <Field label="Reason" htmlFor="s-reason">
                <textarea
                  id="s-reason"
                  rows={3}
                  value={suspend.reason}
                  onChange={(e) => setSuspend((s) => (s ? { ...s, reason: e.target.value } : s))}
                  placeholder="e.g. Unsafe rigging observed 04/08, pending review with their safety officer."
                  className={`${FIELD_CLASS} resize-none`}
                />
              </Field>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setSuspend(null)}>Cancel</Button>
                <Button type="button" loading={saving} icon={ShieldOff} onClick={submitSuspend}>Suspend</Button>
              </div>
            </div>
          )}
        </Modal>

        {/* Add person */}
        <Modal open={!!addPerson} onClose={() => setAddPerson(null)} title="Add an inducted person" subtitle={addPerson?.c.companyName}>
          {addPerson && (
            <div className="space-y-4">
              <p className="text-xs text-slate-600">
                A person&apos;s induction can lapse while their company&apos;s is current — a new hire sent to site by an
                otherwise compliant contractor is exactly what this catches.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Name" htmlFor="p-name">
                  <input id="p-name" value={addPerson.name} onChange={(e) => setAddPerson((s) => (s ? { ...s, name: e.target.value } : s))} className={FIELD_CLASS} />
                </Field>
                <Field label="Job title" htmlFor="p-title">
                  <input id="p-title" value={addPerson.jobTitle} onChange={(e) => setAddPerson((s) => (s ? { ...s, jobTitle: e.target.value } : s))} className={FIELD_CLASS} />
                </Field>
              </div>
              <Field label="Induction valid until" htmlFor="p-exp">
                <input id="p-exp" type="date" value={addPerson.inductionValidUntil} onChange={(e) => setAddPerson((s) => (s ? { ...s, inductionValidUntil: e.target.value } : s))} className={FIELD_CLASS} />
              </Field>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setAddPerson(null)}>Cancel</Button>
                <Button
                  type="button"
                  loading={saving}
                  onClick={async () => {
                    if (!addPerson.name.trim()) {
                      toast.error("A name is required.");
                      return;
                    }
                    if (
                      await post(
                        { kind: "PERSON", contractorId: addPerson.c.id, ...addPerson, c: undefined },
                        `${addPerson.name} recorded.`,
                      )
                    ) {
                      setAddPerson(null);
                    }
                  }}
                >
                  Add person
                </Button>
              </div>
            </div>
          )}
        </Modal>
      </main>
    </div>
  );
}
