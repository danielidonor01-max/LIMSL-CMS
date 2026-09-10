// src/app/oem/page.tsx
"use client";

import MetricPanel from "@/components/MetricPanel";
import DateField from "@/components/DateField";
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
    <div className="min-h-screen bg-canvas text-ink-900 flex flex-col font-sans">
      <main className="flex-1 p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-8">
        <PageHeader
          title="OEM & Warranty Management"
          subtitle="Machine suppliers, what is still under warranty, and how fast they respond"
          actions={
            canWrite ? (
              <>
                <Button
                  variant="secondary"
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
          <div className="bg-surface border border-line rounded-2xl shadow-card overflow-hidden">
            <TableSkeleton rows={6} cols={5} />
          </div>
        ) : (
          <>
            <MetricPanel
              label="Warranty status"
              metrics={[
                {
                  key: "total",
                  label: "Vendors",
                  count: summary.total,
                  value: String(summary.total),
                  status: "plain",
                },
                {
                  key: "active",
                  label: "Active warranty",
                  count: summary.active,
                  value: String(summary.active),
                  status: "plain",
                  description: "A repair on these may be chargeable to the OEM",
                },
                {
                  key: "expiring",
                  label: "Expiring within 60 days",
                  count: summary.expiringSoon,
                  value: String(summary.expiringSoon),
                  status: "warning",
                  description: "Renew or plan around the loss of cover",
                },
                {
                  key: "expired",
                  label: "Expired",
                  count: summary.expired,
                  value: String(summary.expired),
                  status: "danger",
                },
              ]}
            />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {vendors.length === 0 && (
                <div className="lg:col-span-2 bg-surface border border-line rounded-2xl shadow-card">
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
                  <div key={v.id} className="bg-surface border border-line rounded-2xl shadow-card p-5 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold text-ink-900">{v.vendorName}</h3>
                        <p className="text-xs text-ink-500 mt-0.5">
                          {v.equipmentName} · <span className="font-mono">{v.assetId}</span>
                        </p>
                      </div>
                      {active ? (
                        <Badge className="bg-brand-500/10 text-brand-600 border-brand-500/20">
                          <ShieldCheck className="w-3 h-3 mr-1" /> In Warranty
                        </Badge>
                      ) : (
                        <Badge className="bg-danger-500/10 text-danger-600 border-danger-500/20">
                          <ShieldX className="w-3 h-3 mr-1" /> Out of Warranty
                        </Badge>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs text-ink-500">
                      <span className="flex items-center gap-1.5"><Phone className="w-3 h-3" /> {v.phone ?? "-"}</span>
                      <span className="flex items-center gap-1.5"><Mail className="w-3 h-3" /> {v.email ?? "-"}</span>
                      <span className="flex items-center gap-1.5"><Clock className="w-3 h-3" /> {v.avgResponseTimeHrs ?? "-"} hr response</span>
                      <span className="flex items-center gap-1.5"><Package className="w-3 h-3" /> {v.avgSpareLeadTimeDays ?? "-"} d lead</span>
                    </div>

                    <div className="pt-2 border-t border-ink-200 flex items-center justify-between text-xs">
                      <span className="text-ink-500">{v.warrantyScope}</span>
                      <span className={active ? "text-brand-600" : "text-danger-600"}>
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
            <div className="bg-surface border border-line rounded-2xl shadow-card overflow-hidden">
              <div className="px-6 py-4 border-b border-ink-200 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-warn-600" />
                <h3 className="text-sm font-semibold text-ink-900">OEM Intervention Log</h3>
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
                      <tr className="border-b border-ink-200 text-ink-500">
                        <th className="py-2.5 px-5 font-medium">Date</th>
                        <th className="py-3 px-5 font-medium">Problem</th>
                        <th className="py-3 px-5 font-medium">Warranty</th>
                        <th className="py-3 px-5 font-medium">Response</th>
                        <th className="py-3 px-5 font-medium">Resolution</th>
                        <th className="py-3 px-5 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-200">
                      {interventions.map((it) => (
                        <tr key={it.id} className="hover:bg-ink-50">
                          <td className="py-2.5 px-5 tabular-nums text-ink-500">{formatDate(it.interventionDate)}</td>
                          <td className="py-3 px-5 text-ink-700 max-w-xs">{it.problemDescription}</td>
                          <td className="py-3 px-5">
                            <Badge className={it.warrantyStatus === "IN" ? "bg-brand-500/10 text-brand-600 border-brand-500/20" : "bg-ink-500/10 text-ink-500 border-ink-500/20"}>
                              {it.warrantyStatus ?? "-"}
                            </Badge>
                          </td>
                          <td className="py-3 px-5 text-ink-700">{it.responseTimeHrs ?? "-"} hrs</td>
                          <td className="py-3 px-5 text-ink-500 max-w-xs">{it.resolutionSummary}</td>
                          <td className="py-3 px-5">
                            {it.closed ? (
                              <Badge className="bg-brand-500/10 text-brand-600 border-brand-500/20">Closed</Badge>
                            ) : canWrite ? (
                              <button
                                onClick={() => closeIntervention(it.id)}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:text-brand-800"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" /> Close
                              </button>
                            ) : (
                              <Badge className="bg-warn-500/10 text-warn-600 border-warn-500/20">Open</Badge>
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
              <DateField name="warrantyStart" />
            </div>
            <div>
              <label className={LABEL_CLASS}>Warranty End</label>
              <DateField name="warrantyEnd" />
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
              <DateField name="interventionDate" defaultValue={TODAY} />
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
            <label className="flex items-center gap-2 text-xs text-ink-600 self-end pb-2">
              <input name="closed" type="checkbox" className="rounded border-ink-300 accent-brand-600" /> Already resolved
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
