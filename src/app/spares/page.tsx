// src/app/spares/page.tsx
"use client";

import { Suspense, useMemo, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Package, Plus, Search, AlertTriangle, Download, ArrowDownToLine, ArrowUpFromLine, Scale } from "lucide-react";
import { toast } from "sonner";
import { useApi } from "@/lib/api-cache";
import Button from "@/components/Button";
import Modal from "@/components/Modal";
import Select from "@/components/Select";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import TableSkeleton from "@/components/TableSkeleton";
import LoadError from "@/components/LoadError";
import { Badge } from "@/components/Badge";
import Field, { FIELD_CLASS, LABEL_CLASS } from "@/components/Field";
import { downloadCSV } from "@/lib/export";
import { MAINTENANCE_WRITE_ROLES } from "@/lib/roles";
import { CRITICALITY_SHORT } from "@/lib/constants";
import {
  STOCK_LEVEL_LABELS,
  STOCK_LEVEL_BADGE,
  reorderQuantity,
  MOVEMENT_LABELS,
  type StockLevel,
} from "@/lib/maintenance/spares";

type Spare = {
  id: string;
  partNumber: string;
  name: string;
  equipmentId: string | null;
  equipmentName: string | null;
  assetId: string | null;
  equipmentCriticality: string | null;
  quantityOnHand: number;
  minimumQuantity: number;
  maximumQuantity: number | null;
  unit: string | null;
  binLocation: string | null;
  supplierName: string | null;
  leadTimeDays: number | null;
  onOrder: boolean | null;
  risk: {
    level: StockLevel;
    exposureDays: number;
    atRisk: boolean;
    severity: "none" | "low" | "medium" | "high";
    headline: string;
  };
};

const emptyForm = {
  partNumber: "",
  name: "",
  equipmentId: "",
  quantityOnHand: "0",
  minimumQuantity: "1",
  maximumQuantity: "",
  unit: "ea",
  binLocation: "",
  supplierName: "",
  leadTimeDays: "",
};

const SEVERITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2, none: 3 };

export default function SparesPage() {
  return (
    <Suspense fallback={<div className="p-6 max-w-7xl mx-auto"><TableSkeleton rows={6} cols={6} /></div>}>
      <SparesRegister />
    </Suspense>
  );
}

function SparesRegister() {
  const searchParams = useSearchParams();
  const { data, loading, error, refresh } = useApi<Spare[]>("/api/spares", []);
  const spares = Array.isArray(data) ? data : [];
  const { data: session } = useSession();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const role = (session?.user as { role?: string })?.role;
  const canWrite = mounted && MAINTENANCE_WRITE_ROLES.includes(role ?? "");

  const { data: equipmentData } = useApi<{ id: string; assetId: string; name: string }[]>("/api/equipment", []);
  const equipmentList = Array.isArray(equipmentData) ? equipmentData : [];

  // Arriving from a machine that is awaiting parts — land on that machine's
  // spares rather than the whole register.
  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const [riskOnly, setRiskOnly] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [movement, setMovement] = useState<{ spare: Spare; type: string; qty: string; reason: string } | null>(null);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const atRiskCount = spares.filter((s) => s.risk?.atRisk).length;
  // The number that justifies the whole register: production days already
  // committed to, spread across every machine with an absent critical spare.
  const exposureDays = spares.reduce((a, s) => a + (s.risk?.exposureDays ?? 0), 0);

  const filtered = useMemo(() => {
    let out = spares;
    if (riskOnly) out = out.filter((s) => s.risk?.atRisk);
    if (q.trim()) {
      const term = q.toLowerCase();
      out = out.filter(
        (s) =>
          s.partNumber.toLowerCase().includes(term) ||
          s.name.toLowerCase().includes(term) ||
          (s.equipmentName ?? "").toLowerCase().includes(term) ||
          (s.binLocation ?? "").toLowerCase().includes(term),
      );
    }
    // Worst first — a spares list sorted by part number buries the one thing
    // that needs a decision.
    return [...out].sort(
      (a, b) =>
        (SEVERITY_ORDER[a.risk?.severity ?? "none"] ?? 3) - (SEVERITY_ORDER[b.risk?.severity ?? "none"] ?? 3) ||
        (b.risk?.exposureDays ?? 0) - (a.risk?.exposureDays ?? 0) ||
        a.partNumber.localeCompare(b.partNumber),
    );
  }, [spares, q, riskOnly]);

  const submitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.partNumber.trim() || !form.name.trim()) {
      toast.error("A part number and a name are both required.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/spares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || "Failed to add the part.");
        return;
      }
      toast.success(`${form.partNumber} added to the spares register.`);
      setShowCreate(false);
      setForm(emptyForm);
      refresh();
    } catch {
      toast.error("Failed to add the part.");
    } finally {
      setSaving(false);
    }
  };

  const submitMovement = async () => {
    if (!movement) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/spares/${movement.spare.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          movementType: movement.type,
          quantity: Number(movement.qty),
          reason: movement.reason,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || "Failed to record the movement.");
        return;
      }
      toast.success(`Stock updated — ${d.balanceAfter} ${movement.spare.unit ?? "ea"} on hand.`);
      setMovement(null);
      refresh();
    } catch {
      toast.error("Failed to record the movement.");
    } finally {
      setSaving(false);
    }
  };

  const exportCsv = () =>
    downloadCSV(
      `critical-spares-${new Date().toISOString().slice(0, 10)}`,
      filtered.map((s) => ({
        "Part number": s.partNumber,
        Name: s.name,
        "Held for": s.equipmentName ?? "General stock",
        "Asset ID": s.assetId ?? "",
        Criticality: CRITICALITY_SHORT[s.equipmentCriticality ?? ""] ?? "",
        "On hand": s.quantityOnHand,
        Minimum: s.minimumQuantity,
        Unit: s.unit ?? "",
        "Stock level": STOCK_LEVEL_LABELS[s.risk?.level] ?? "",
        "Reorder qty": reorderQuantity(s.quantityOnHand, s.minimumQuantity, s.maximumQuantity),
        "Lead time (days)": s.leadTimeDays ?? "",
        "Days exposed": s.risk?.exposureDays ?? 0,
        "On order": s.onOrder ? "Yes" : "No",
        Bin: s.binLocation ?? "",
        Supplier: s.supplierName ?? "",
      })),
    );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      <main className="flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto space-y-5">
        <PageHeader
          icon={Package}
          title="Critical Spares"
          subtitle="Parts held against the machines that stop production, and what it costs when the shelf is empty"
          code="LIMSL-MAIN-SPR-016"
          backHref="/"
          backLabel="Dashboard"
          actions={
            <>
              <Button variant="secondary" icon={Download} onClick={exportCsv} disabled={!filtered.length}>
                Export
              </Button>
              {canWrite && (
                <Button icon={Plus} onClick={() => setShowCreate(true)}>
                  Add Part
                </Button>
              )}
            </>
          }
        />

        {/* The point of the register, stated up front. */}
        {!loading && spares.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className={`p-4 rounded-xl border ${atRiskCount ? "bg-rose-50 border-rose-200" : "bg-emerald-50 border-emerald-200"}`}>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Parts below minimum</p>
              <p className="text-3xl font-bold text-slate-900 mt-2">{atRiskCount}</p>
              <p className="text-[11px] text-slate-600 mt-1">of {spares.length} on the register</p>
            </div>
            <div className={`p-4 rounded-xl border ${exposureDays > 0 ? "bg-amber-50 border-amber-200" : "bg-emerald-50 border-emerald-200"}`}>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Days already committed</p>
              <p className="text-3xl font-bold text-slate-900 mt-2">{exposureDays}</p>
              <p className="text-[11px] text-slate-600 mt-1">
                Production days lost if each machine with an empty shelf failed today
              </p>
            </div>
            <div className="p-4 rounded-xl border bg-white border-slate-200">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">On order</p>
              <p className="text-3xl font-bold text-slate-900 mt-2">{spares.filter((s) => s.onOrder).length}</p>
              <p className="text-[11px] text-slate-600 mt-1">A purchase order is not a spare — the wait is unchanged</p>
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search part, machine or bin…"
              className="w-full bg-white border border-slate-200 rounded-lg min-h-11 pl-10 pr-4 text-sm focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15"
            />
          </div>
          <button
            onClick={() => setRiskOnly((v) => !v)}
            aria-pressed={riskOnly}
            className={`inline-flex items-center gap-2 px-3 min-h-11 rounded-lg border text-xs font-semibold w-fit transition-colors ${
              riskOnly ? "bg-rose-50 border-rose-300 text-rose-700" : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
            Below minimum only
          </button>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {error && !loading ? (
            <LoadError what="the spares register" onRetry={refresh} />
          ) : loading ? (
            <TableSkeleton rows={6} cols={6} />
          ) : !filtered.length ? (
            q.trim() || riskOnly ? (
              <EmptyState
                icon={Search}
                title={riskOnly ? "Nothing is below its minimum" : "No parts match that search"}
                message={
                  riskOnly
                    ? "Every spare on the register is at or above its minimum level."
                    : "No part, machine or bin matches what you typed."
                }
                actionLabel="Clear"
                onAction={() => {
                  setQ("");
                  setRiskOnly(false);
                }}
              />
            ) : (
              <EmptyState
                icon={Package}
                title="No spares registered yet"
                message="Start with the parts for your CRITICAL machines. Recording a minimum level and a supplier lead time is what turns a parts list into a warning you get weeks before a breakdown."
                actionLabel={canWrite ? "Add the first part" : undefined}
                onAction={canWrite ? () => setShowCreate(true) : undefined}
              />
            )
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                    <th className="py-3 px-4 font-semibold">Part</th>
                    <th className="py-3 px-4 font-semibold">Held for</th>
                    <th className="py-3 px-4 font-semibold text-center">On hand</th>
                    <th className="py-3 px-4 font-semibold text-center">Min</th>
                    <th className="py-3 px-4 font-semibold">Stock</th>
                    <th className="py-3 px-4 font-semibold">If it fails today</th>
                    {canWrite && <th className="py-3 px-4 font-semibold text-right">Stock move</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filtered.map((s) => {
                    const reorder = reorderQuantity(s.quantityOnHand, s.minimumQuantity, s.maximumQuantity);
                    return (
                      <tr key={s.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4">
                          <p className="font-semibold text-slate-900">{s.name}</p>
                          <p className="font-mono text-[10px] text-slate-500 mt-0.5">
                            {s.partNumber}
                            {s.binLocation ? ` · bin ${s.binLocation}` : ""}
                          </p>
                        </td>
                        <td className="py-3 px-4">
                          {s.equipmentName ? (
                            <>
                              <p className="text-slate-700">{s.equipmentName}</p>
                              <p className="text-[10px] text-slate-500 mt-0.5">
                                {s.assetId}
                                {s.equipmentCriticality ? ` · ${CRITICALITY_SHORT[s.equipmentCriticality]}` : ""}
                              </p>
                            </>
                          ) : (
                            <span className="text-slate-500">General stock</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center font-semibold text-slate-900">
                          {s.quantityOnHand}
                          <span className="text-slate-400 font-normal"> {s.unit}</span>
                        </td>
                        <td className="py-3 px-4 text-center text-slate-500">{s.minimumQuantity}</td>
                        <td className="py-3 px-4">
                          <Badge className={STOCK_LEVEL_BADGE[s.risk?.level] ?? ""}>
                            {STOCK_LEVEL_LABELS[s.risk?.level] ?? "—"}
                          </Badge>
                          {reorder > 0 && (
                            <p className="text-[10px] text-slate-500 mt-1">
                              Order {reorder} {s.unit}
                              {s.onOrder ? " · on order" : ""}
                            </p>
                          )}
                        </td>
                        <td className="py-3 px-4 max-w-[260px]">
                          {s.risk?.exposureDays > 0 ? (
                            <span className="text-rose-700 font-semibold">
                              {s.risk.exposureDays} day{s.risk.exposureDays === 1 ? "" : "s"} down
                            </span>
                          ) : s.risk?.atRisk ? (
                            <span className="text-amber-700">Cover on the shelf, but reorder</span>
                          ) : (
                            <span className="text-slate-400">Covered</span>
                          )}
                        </td>
                        {canWrite && (
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <div className="inline-flex gap-1">
                              <button
                                onClick={() => setMovement({ spare: s, type: "ISSUE", qty: "1", reason: "" })}
                                title="Issue to a job"
                                className="p-2 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50"
                              >
                                <ArrowUpFromLine className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setMovement({ spare: s, type: "RECEIPT", qty: String(reorder || 1), reason: "" })}
                                title="Receive stock"
                                className="p-2 rounded-lg text-slate-500 hover:text-emerald-600 hover:bg-emerald-50"
                              >
                                <ArrowDownToLine className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setMovement({ spare: s, type: "ADJUSTMENT", qty: String(s.quantityOnHand), reason: "" })}
                                title="Correct after a stock count"
                                className="p-2 rounded-lg text-slate-500 hover:text-sky-600 hover:bg-sky-50"
                              >
                                <Scale className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Add a part */}
        <Modal
          open={showCreate}
          onClose={() => setShowCreate(false)}
          title="Add a spare part"
          subtitle="The minimum level and the supplier lead time are what make this useful"
        >
          <form onSubmit={submitCreate} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Part number *" htmlFor="sp-num">
                <input id="sp-num" value={form.partNumber} onChange={(e) => set("partNumber", e.target.value)} className={`${FIELD_CLASS} font-mono`} required />
              </Field>
              <Field label="Description *" htmlFor="sp-name">
                <input id="sp-name" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Spindle drive belt" className={FIELD_CLASS} required />
              </Field>
            </div>

            <div>
              <label className={LABEL_CLASS}>Held for which machine?</label>
              <Select value={form.equipmentId} onChange={(v) => set("equipmentId", v)} className="w-full">
                <option value="">General workshop stock</option>
                {equipmentList.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.assetId} · {e.name}
                  </option>
                ))}
              </Select>
              <p className="text-[10px] text-slate-500 mt-1">
                Linking it to a machine is what lets the register grade the risk by that machine&apos;s criticality.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Field label="On hand" htmlFor="sp-qty">
                <input id="sp-qty" inputMode="decimal" value={form.quantityOnHand} onChange={(e) => set("quantityOnHand", e.target.value)} className={FIELD_CLASS} />
              </Field>
              <Field label="Minimum" htmlFor="sp-min">
                <input id="sp-min" inputMode="decimal" value={form.minimumQuantity} onChange={(e) => set("minimumQuantity", e.target.value)} className={FIELD_CLASS} />
              </Field>
              <Field label="Maximum" htmlFor="sp-max">
                <input id="sp-max" inputMode="decimal" value={form.maximumQuantity} onChange={(e) => set("maximumQuantity", e.target.value)} placeholder="optional" className={FIELD_CLASS} />
              </Field>
              <Field label="Unit" htmlFor="sp-unit">
                <input id="sp-unit" value={form.unit} onChange={(e) => set("unit", e.target.value)} className={FIELD_CLASS} />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Bin / location" htmlFor="sp-bin">
                <input id="sp-bin" value={form.binLocation} onChange={(e) => set("binLocation", e.target.value)} className={FIELD_CLASS} />
              </Field>
              <Field label="Supplier" htmlFor="sp-sup">
                <input id="sp-sup" value={form.supplierName} onChange={(e) => set("supplierName", e.target.value)} className={FIELD_CLASS} />
              </Field>
              <Field label="Lead time (days)" htmlFor="sp-lead">
                <input id="sp-lead" inputMode="decimal" value={form.leadTimeDays} onChange={(e) => set("leadTimeDays", e.target.value)} placeholder="e.g. 21" className={FIELD_CLASS} />
              </Field>
            </div>
            <p className="text-[11px] text-slate-500 -mt-1">
              The lead time is how long the machine stays down if this part is not on the shelf. Without it the register
              can flag a shortfall but cannot tell you what it costs.
            </p>

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="secondary" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={saving} icon={Plus}>
                Add part
              </Button>
            </div>
          </form>
        </Modal>

        {/* Stock movement */}
        <Modal
          open={!!movement}
          onClose={() => setMovement(null)}
          title={movement ? (MOVEMENT_LABELS[movement.type] ?? "Stock movement") : "Stock movement"}
          subtitle={movement ? `${movement.spare.partNumber} · ${movement.spare.quantityOnHand} ${movement.spare.unit ?? "ea"} on hand` : ""}
        >
          {movement && (
            <div className="space-y-4">
              <Field
                label={movement.type === "ADJUSTMENT" ? "Counted quantity" : "Quantity"}
                htmlFor="mv-qty"
              >
                <input
                  id="mv-qty"
                  inputMode="decimal"
                  value={movement.qty}
                  onChange={(e) => setMovement((m) => (m ? { ...m, qty: e.target.value } : m))}
                  className={FIELD_CLASS}
                />
              </Field>
              {movement.type === "ADJUSTMENT" && (
                <p className="text-[11px] text-slate-500 -mt-2">
                  This sets the balance to what you actually counted, rather than adding or removing an amount.
                </p>
              )}
              <Field label="Reason" htmlFor="mv-reason">
                <input
                  id="mv-reason"
                  value={movement.reason}
                  onChange={(e) => setMovement((m) => (m ? { ...m, reason: e.target.value } : m))}
                  placeholder={movement.type === "ISSUE" ? "Work order or job it went to" : "PO number, delivery note, count date…"}
                  className={FIELD_CLASS}
                />
              </Field>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setMovement(null)}>
                  Cancel
                </Button>
                <Button type="button" loading={saving} onClick={submitMovement}>
                  Record
                </Button>
              </div>
            </div>
          )}
        </Modal>
      </main>
    </div>
  );
}
