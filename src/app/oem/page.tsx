// src/app/oem/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useApi } from "@/lib/api-cache";
import {
  Building2,
  ShieldCheck,
  ShieldX,
  Phone,
  Mail,
  Clock,
  Package,
  AlertTriangle,
  Plus,
  Wrench,
  CheckCircle2,
} from "lucide-react";
import { Badge } from "@/components/Badge";
import { formatDate } from "@/lib/utils";
import Modal from "@/components/Modal";
import Button from "@/components/Button";
import Select from "@/components/Select";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import TableSkeleton from "@/components/TableSkeleton";
import { FIELD_CLASS, LABEL_CLASS } from "@/components/Field";
import { MAINTENANCE_WRITE_ROLES } from "@/lib/roles";
import { toast } from "sonner";

type Vendor = {
  id: string;
  equipmentId?: string | null;
  vendorName: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  country: string | null;
  warrantyStart: string | null;
  warrantyEnd: string | null;
  warrantyScope: string | null;
  warrantyActive: boolean | null;
  avgResponseTimeHrs: number | null;
  avgSpareLeadTimeDays: number | null;
  equipmentName: string | null;
  assetId: string | null;
};

type Intervention = {
  id: string;
  interventionDate: string;
  problemDescription: string | null;
  warrantyStatus: string | null;
  responseTimeHrs: number | null;
  resolutionSummary: string | null;
  closed: boolean | null;
};

type Equip = { id: string; name: string; assetId: string; location?: string };

const TODAY = new Date().toISOString().slice(0, 10);
const daysUntil = (d: string | null) =>
  d ? Math.round((new Date(d).getTime() - Date.now()) / 864e5) : null;

export default function OemPage() {
  const { data: session } = useSession();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const role = (session?.user as { role?: string })?.role;
  const canWrite = mounted && MAINTENANCE_WRITE_ROLES.includes(role ?? "");

  const { data: oemData, loading, refresh: refreshOem } = useApi<{
    vendors?: Vendor[];
    interventions?: Intervention[];
  }>("/api/oem", {});
  const vendors = oemData.vendors ?? [];
  const interventions = oemData.interventions ?? [];
  const { data: equipmentData } = useApi<Equip[]>("/api/equipment", []);
  const equipmentList = Array.isArray(equipmentData) ? equipmentData : [];

  const [showVendor, setShowVendor] = useState(false);
  const [showIntervention, setShowIntervention] = useState(false);
  const [saving, setSaving] = useState(false);

  // Select renders a button (no form field), so these selections are held in
  // state instead of being read back from FormData on submit.
  const [vendorEquipmentId, setVendorEquipmentId] = useState("");
  const [intOemId, setIntOemId] = useState("");
  const [intEquipmentId, setIntEquipmentId] = useState("");
  const [intWarrantyStatus, setIntWarrantyStatus] = useState("OUT");

  const loadData = () => {
    refreshOem();
  };

  const summary = useMemo(() => {
    const active = vendors.filter((v) => v.warrantyActive && (v.warrantyEnd ?? "") >= TODAY).length;
    const expiringSoon = vendors.filter((v) => {
      const d = daysUntil(v.warrantyEnd);
      return d !== null && d >= 0 && d <= 60;
    }).length;
    const expired = vendors.filter((v) => (v.warrantyEnd ?? "") < TODAY).length;
    return { active, expiringSoon, expired, total: vendors.length };
  }, [vendors]);

  async function submitVendor(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!vendorEquipmentId) {
      toast.error("Select the equipment.");
      return;
    }
    const fd = new FormData(e.currentTarget);
    setSaving(true);
    try {
      const res = await fetch("/api/oem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          equipmentId: vendorEquipmentId,
          vendorName: fd.get("vendorName"),
          contactPerson: fd.get("contactPerson"),
          phone: fd.get("phone"),
          email: fd.get("email"),
          country: fd.get("country"),
          warrantyStart: fd.get("warrantyStart") || null,
          warrantyEnd: fd.get("warrantyEnd") || null,
          warrantyScope: fd.get("warrantyScope"),
          avgResponseTimeHrs: fd.get("avgResponseTimeHrs") ? Number(fd.get("avgResponseTimeHrs")) : null,
          avgSpareLeadTimeDays: fd.get("avgSpareLeadTimeDays") ? Number(fd.get("avgSpareLeadTimeDays")) : null,
        }),
      });
      if (res.ok) {
        toast.success("Vendor registered.");
        setShowVendor(false);
        await loadData();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Failed to register vendor.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function submitIntervention(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setSaving(true);
    try {
      const res = await fetch("/api/oem/interventions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          oemId: intOemId || null,
          equipmentId: intEquipmentId || null,
          interventionDate: fd.get("interventionDate") || null,
          problemDescription: fd.get("problemDescription"),
          warrantyStatus: intWarrantyStatus,
          responseTimeHrs: fd.get("responseTimeHrs") ? Number(fd.get("responseTimeHrs")) : null,
          resolutionSummary: fd.get("resolutionSummary"),
          closed: fd.get("closed") === "on",
        }),
      });
      if (res.ok) {
        toast.success("Intervention logged.");
        setShowIntervention(false);
        await loadData();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Failed to log intervention.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function closeIntervention(id: string) {
    const res = await fetch("/api/oem/interventions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, closed: true }),
    });
    if (res.ok) {
      toast.success("Intervention closed.");
      await loadData();
    } else {
      toast.error("Failed to close intervention.");
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      <main className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-6">
        <PageHeader
          icon={Building2}
          title="OEM & Warranty Management"
          subtitle="Machine suppliers, what is still under warranty, and how fast they respond"
          actions={
            canWrite ? (
              <>
                <Button
                  variant="secondary"
                  icon={Wrench}
                  onClick={() => {
                    setIntOemId("");
                    setIntEquipmentId("");
                    setIntWarrantyStatus("OUT");
                    setShowIntervention(true);
                  }}
                >
                  Log Intervention
                </Button>
                <Button
                  icon={Plus}
                  onClick={() => {
                    setVendorEquipmentId("");
                    setShowVendor(true);
                  }}
                >
                  Add Vendor
                </Button>
              </>
            ) : undefined
          }
        />

        {loading ? (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <TableSkeleton rows={6} cols={5} />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Stat label="Vendors" value={String(summary.total)} tone="border-slate-200 bg-slate-50" text="text-slate-900" />
              <Stat label="Active Warranty" value={String(summary.active)} tone="border-emerald-200 bg-emerald-50" text="text-emerald-600" />
              <Stat label="Expiring ≤60d" value={String(summary.expiringSoon)} tone="border-amber-200 bg-amber-50" text="text-amber-600" />
              <Stat label="Expired" value={String(summary.expired)} tone="border-rose-200 bg-rose-50" text="text-rose-600" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {vendors.length === 0 && (
                <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl">
                  <EmptyState
                    icon={Building2}
                    title="No vendors registered"
                    message="Register the supplier behind each machine to track warranty cover, response times and spare-part lead times."
                    actionLabel={canWrite ? "Add Vendor" : undefined}
                    onAction={
                      canWrite
                        ? () => {
                            setVendorEquipmentId("");
                            setShowVendor(true);
                          }
                        : undefined
                    }
                  />
                </div>
              )}
              {vendors.map((v) => {
                const days = daysUntil(v.warrantyEnd);
                const active = !!v.warrantyActive && (v.warrantyEnd ?? "") >= TODAY;
                return (
                  <div key={v.id} className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900">{v.vendorName}</h3>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {v.equipmentName} · <span className="font-mono">{v.assetId}</span>
                        </p>
                      </div>
                      {active ? (
                        <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                          <ShieldCheck className="w-3 h-3 mr-1" /> In Warranty
                        </Badge>
                      ) : (
                        <Badge className="bg-rose-500/10 text-rose-600 border-rose-500/20">
                          <ShieldX className="w-3 h-3 mr-1" /> Out of Warranty
                        </Badge>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-500">
                      <span className="flex items-center gap-1.5"><Phone className="w-3 h-3" /> {v.phone ?? "-"}</span>
                      <span className="flex items-center gap-1.5"><Mail className="w-3 h-3" /> {v.email ?? "-"}</span>
                      <span className="flex items-center gap-1.5"><Clock className="w-3 h-3" /> {v.avgResponseTimeHrs ?? "-"} hr response</span>
                      <span className="flex items-center gap-1.5"><Package className="w-3 h-3" /> {v.avgSpareLeadTimeDays ?? "-"} d lead</span>
                    </div>

                    <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-[11px]">
                      <span className="text-slate-500">{v.warrantyScope}</span>
                      <span className={active ? "text-emerald-600" : "text-rose-600"}>
                        {active && days !== null
                          ? `${days}d left · ${formatDate(v.warrantyEnd)}`
                          : `Expired ${formatDate(v.warrantyEnd)}`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Interventions */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-200 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <h3 className="text-sm font-semibold text-slate-900">OEM Intervention Log</h3>
              </div>
              {interventions.length === 0 ? (
                <EmptyState
                  icon={Wrench}
                  title="No OEM interventions logged"
                  message="Log each vendor call-out and warranty claim here so response times and warranty performance can be evidenced."
                  actionLabel={canWrite ? "Log Intervention" : undefined}
                  onAction={
                    canWrite
                      ? () => {
                          setIntOemId("");
                          setIntEquipmentId("");
                          setIntWarrantyStatus("OUT");
                          setShowIntervention(true);
                        }
                      : undefined
                  }
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500">
                        <th className="py-2.5 px-5 font-medium">Date</th>
                        <th className="py-2.5 px-4 font-medium">Problem</th>
                        <th className="py-2.5 px-4 font-medium">Warranty</th>
                        <th className="py-2.5 px-4 font-medium">Response</th>
                        <th className="py-2.5 px-4 font-medium">Resolution</th>
                        <th className="py-2.5 px-4 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {interventions.map((it) => (
                        <tr key={it.id} className="hover:bg-slate-50">
                          <td className="py-2.5 px-5 font-mono text-slate-500">{formatDate(it.interventionDate)}</td>
                          <td className="py-2.5 px-4 text-slate-700 max-w-xs">{it.problemDescription}</td>
                          <td className="py-2.5 px-4">
                            <Badge className={it.warrantyStatus === "IN" ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : "bg-slate-500/10 text-slate-500 border-slate-500/20"}>
                              {it.warrantyStatus ?? "-"}
                            </Badge>
                          </td>
                          <td className="py-2.5 px-4 text-slate-700">{it.responseTimeHrs ?? "-"} hrs</td>
                          <td className="py-2.5 px-4 text-slate-500 max-w-xs">{it.resolutionSummary}</td>
                          <td className="py-2.5 px-4">
                            {it.closed ? (
                              <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">Closed</Badge>
                            ) : canWrite ? (
                              <button
                                onClick={() => closeIntervention(it.id)}
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-800"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" /> Close
                              </button>
                            ) : (
                              <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20">Open</Badge>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {/* Add Vendor modal */}
      <Modal open={showVendor} onClose={() => setShowVendor(false)} title="Register OEM / Vendor" subtitle="Warranty & support terms">
        <form onSubmit={submitVendor} className="space-y-4">
          <div>
            <label className={LABEL_CLASS}>Equipment</label>
            <Select value={vendorEquipmentId} onChange={setVendorEquipmentId} required className="w-full">
              <option value="" disabled>Select equipment…</option>
              {equipmentList.map((e) => (
                <option key={e.id} value={e.id}>{e.assetId}, {e.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <label className={LABEL_CLASS}>Vendor / OEM Name</label>
            <input name="vendorName" required className={FIELD_CLASS} placeholder="e.g. Amada, Trumpf, Lincoln Electric" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL_CLASS}>Contact Person</label>
              <input name="contactPerson" className={FIELD_CLASS} />
            </div>
            <div>
              <label className={LABEL_CLASS}>Country</label>
              <input name="country" className={FIELD_CLASS} />
            </div>
            <div>
              <label className={LABEL_CLASS}>Phone</label>
              <input name="phone" className={FIELD_CLASS} />
            </div>
            <div>
              <label className={LABEL_CLASS}>Email</label>
              <input name="email" type="email" className={FIELD_CLASS} />
            </div>
            <div>
              <label className={LABEL_CLASS}>Warranty Start</label>
              <input name="warrantyStart" type="date" className={FIELD_CLASS} />
            </div>
            <div>
              <label className={LABEL_CLASS}>Warranty End</label>
              <input name="warrantyEnd" type="date" className={FIELD_CLASS} />
            </div>
            <div>
              <label className={LABEL_CLASS}>Avg Response (hrs)</label>
              <input name="avgResponseTimeHrs" type="number" step="0.5" className={FIELD_CLASS} />
            </div>
            <div>
              <label className={LABEL_CLASS}>Spare Lead (days)</label>
              <input name="avgSpareLeadTimeDays" type="number" step="1" className={FIELD_CLASS} />
            </div>
          </div>
          <div>
            <label className={LABEL_CLASS}>Warranty Scope</label>
            <input name="warrantyScope" className={FIELD_CLASS} placeholder="e.g. Parts & labour, on-site" />
          </div>
          <SubmitRow saving={saving} onCancel={() => setShowVendor(false)} label="Register Vendor" />
        </form>
      </Modal>

      {/* Log Intervention modal */}
      <Modal open={showIntervention} onClose={() => setShowIntervention(false)} title="Log OEM Intervention" subtitle="Vendor call-out / warranty claim">
        <form onSubmit={submitIntervention} className="space-y-4">
          <div>
            <label className={LABEL_CLASS}>Vendor (optional)</label>
            <Select value={intOemId} onChange={setIntOemId} className="w-full">
              <option value="">. No linked vendor , </option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>{v.vendorName} ({v.assetId})</option>
              ))}
            </Select>
          </div>
          <div>
            <label className={LABEL_CLASS}>Equipment (if no vendor)</label>
            <Select value={intEquipmentId} onChange={setIntEquipmentId} className="w-full">
              <option value="">. Select equipment , </option>
              {equipmentList.map((e) => (
                <option key={e.id} value={e.id}>{e.assetId}, {e.name}</option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL_CLASS}>Intervention Date</label>
              <input name="interventionDate" type="date" className={FIELD_CLASS} defaultValue={TODAY} />
            </div>
            <div>
              <label className={LABEL_CLASS}>Warranty Status</label>
              <Select value={intWarrantyStatus} onChange={setIntWarrantyStatus} className="w-full">
                <option value="IN">In Warranty</option>
                <option value="OUT">Out of Warranty</option>
              </Select>
            </div>
            <div>
              <label className={LABEL_CLASS}>Response Time (hrs)</label>
              <input name="responseTimeHrs" type="number" step="0.5" className={FIELD_CLASS} />
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-600 self-end pb-2">
              <input name="closed" type="checkbox" className="rounded border-slate-300 text-emerald-500" /> Already resolved
            </label>
          </div>
          <div>
            <label className={LABEL_CLASS}>Problem Description</label>
            <textarea name="problemDescription" required className={`${FIELD_CLASS} h-20 resize-none`} />
          </div>
          <div>
            <label className={LABEL_CLASS}>Resolution Summary</label>
            <textarea name="resolutionSummary" className={`${FIELD_CLASS} h-16 resize-none`} />
          </div>
          <SubmitRow saving={saving} onCancel={() => setShowIntervention(false)} label="Log Intervention" />
        </form>
      </Modal>
    </div>
  );
}

function SubmitRow({ saving, onCancel, label }: { saving: boolean; onCancel: () => void; label: string }) {
  return (
    <div className="flex gap-3 justify-end pt-2">
      <Button variant="secondary" type="button" onClick={onCancel}>Cancel</Button>
      <Button variant="primary" type="submit" loading={saving}>{label}</Button>
    </div>
  );
}

function Stat({ label, value, tone, text }: { label: string; value: string; tone: string; text: string }) {
  return (
    <div className={`p-4 rounded-xl border ${tone}`}>
      <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{label}</span>
      <div className={`text-2xl font-bold mt-2 ${text}`}>{value}</div>
    </div>
  );
}
