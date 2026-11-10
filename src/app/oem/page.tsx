// src/app/oem/page.tsx
"use client";

import MetricPanel from "@/components/MetricPanel";
import { PAGE_MAIN } from "@/lib/page-shell";
import DateField from "@/components/DateField";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { invalidateApi, useApi } from "@/lib/api-cache";
import { CheckCircle2, Eye, Handshake, Pencil, RefreshCw, Wrench, ExternalLink } from "lucide-react";
import { Badge } from "@/components/Badge";
import { formatDate } from "@/lib/utils";
import Modal from "@/components/Modal";
import Button from "@/components/Button";
import Select from "@/components/Select";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import TableSkeleton from "@/components/TableSkeleton";
import KebabMenu, { type KebabItem } from "@/components/KebabMenu";
import { FIELD_CLASS, LABEL_CLASS } from "@/components/Field";
import { MAINTENANCE_WRITE_ROLES } from "@/lib/roles";
import { toast } from "sonner";

type Vendor = {
  id: string;
  equipmentId: string;
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
  notes: string | null;
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
  vendorName: string | null;
  equipmentName: string | null;
  assetId: string | null;
};

type Equip = { id: string; name: string; assetId: string; location?: string };

const TODAY = new Date().toISOString().slice(0, 10);
const EXPIRY_WARNING_DAYS = 60;
const daysUntil = (d: string | null) =>
  d ? Math.round((new Date(`${d}T00:00:00`).getTime() - new Date(`${TODAY}T00:00:00`).getTime()) / 864e5) : null;
const equipmentHref = (assetId: string) => `/equipment/${assetId.replace(/\//g, "-")}`;

type Cover = "ACTIVE" | "EXPIRING" | "EXPIRED" | "NONE";

// Worked out from the end date every time. The stored flag was set once at
// registration and never turned off, which is how a lapsed warranty kept
// reading as live.
function coverOf(v: Vendor): { cover: Cover; days: number | null } {
  const days = daysUntil(v.warrantyEnd);
  if (days === null) return { cover: "NONE", days };
  if (days < 0) return { cover: "EXPIRED", days };
  if (days <= EXPIRY_WARNING_DAYS) return { cover: "EXPIRING", days };
  return { cover: "ACTIVE", days };
}

function CoverBadge({ v }: { v: Vendor }) {
  const { cover, days } = coverOf(v);
  if (cover === "ACTIVE") return <Badge className="bg-brand-500/10 text-brand-700 border-brand-500/20">In warranty</Badge>;
  if (cover === "EXPIRING")
    return (
      <Badge className="bg-warn-500/10 text-warn-700 border-warn-500/20">
        {days === 0 ? "Expires today" : `Expires in ${days}d`}
      </Badge>
    );
  if (cover === "EXPIRED") return <Badge className="bg-danger-500/10 text-danger-700 border-danger-500/20">Expired</Badge>;
  return <Badge className="bg-ink-500/10 text-ink-600 border-ink-500/20">Not recorded</Badge>;
}

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
  const vendors = useMemo(() => oemData.vendors ?? [], [oemData.vendors]);
  const interventions = oemData.interventions ?? [];
  const { data: equipmentData } = useApi<Equip[]>("/api/equipment", []);
  const equipmentList = Array.isArray(equipmentData) ? equipmentData : [];

  const [showVendor, setShowVendor] = useState(false);
  const [showIntervention, setShowIntervention] = useState(false);
  const [saving, setSaving] = useState(false);
  const [viewing, setViewing] = useState<Vendor | null>(null);
  const [editing, setEditing] = useState<Vendor | null>(null);
  const [renewing, setRenewing] = useState<Vendor | null>(null);

  // Select renders a button (no form field), so these selections are held in
  // state instead of being read back from FormData on submit.
  const [vendorEquipmentId, setVendorEquipmentId] = useState("");
  const [intOemId, setIntOemId] = useState("");
  const [intEquipmentId, setIntEquipmentId] = useState("");
  const [intWarrantyStatus, setIntWarrantyStatus] = useState("OUT");

  const loadData = () => {
    invalidateApi("/api/oem");
    refreshOem();
  };

  const summary = useMemo(() => {
    const covers = vendors.map((v) => coverOf(v).cover);
    return {
      active: covers.filter((c) => c === "ACTIVE" || c === "EXPIRING").length,
      expiringSoon: covers.filter((c) => c === "EXPIRING").length,
      expired: covers.filter((c) => c === "EXPIRED").length,
      total: vendors.length,
    };
  }, [vendors]);

  const openIntervention = (v?: Vendor) => {
    setIntOemId(v?.id ?? "");
    setIntEquipmentId("");
    setIntWarrantyStatus(v && v.warrantyEnd && v.warrantyEnd >= TODAY ? "IN" : "OUT");
    setShowIntervention(true);
  };

  const vendorActions = (v: Vendor): KebabItem[] => {
    const { cover } = coverOf(v);
    return [
      { label: "View details", icon: Eye, onClick: () => setViewing(v) },
      ...(canWrite
        ? [
            { label: "Edit vendor", icon: Pencil, onClick: () => setEditing(v) },
            {
              label: cover === "EXPIRED" || cover === "EXPIRING" || cover === "NONE" ? "Renew warranty" : "Extend warranty",
              icon: RefreshCw,
              onClick: () => setRenewing(v),
            },
            { label: "Log intervention", icon: Wrench, onClick: () => openIntervention(v) },
          ]
        : []),
      ...(v.assetId ? [{ label: "Equipment page", icon: ExternalLink, href: equipmentHref(v.assetId) }] : []),
    ];
  };

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
          ...vendorFields(fd),
        }),
      });
      if (res.ok) {
        toast.success("Vendor registered.");
        setShowVendor(false);
        loadData();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Failed to register vendor.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function patchVendor(body: Record<string, unknown>, done: string) {
    setSaving(true);
    try {
      const res = await fetch("/api/oem", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        toast.success(done);
        setEditing(null);
        setRenewing(null);
        setViewing(null);
        loadData();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Failed to update vendor.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function submitEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editing) return;
    const fd = new FormData(e.currentTarget);
    const fields = vendorFields(fd);
    if (fields.warrantyStart && fields.warrantyEnd && fields.warrantyEnd <= fields.warrantyStart) {
      toast.error("The warranty must end after it starts.");
      return;
    }
    await patchVendor({ id: editing.id, action: "edit", ...fields, notes: fd.get("notes") }, "Vendor updated.");
  }

  async function submitRenew(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!renewing) return;
    const fd = new FormData(e.currentTarget);
    const warrantyStart = String(fd.get("warrantyStart") || "");
    const warrantyEnd = String(fd.get("warrantyEnd") || "");
    if (!warrantyStart || !warrantyEnd) {
      toast.error("Enter the new start and end dates.");
      return;
    }
    if (warrantyEnd <= warrantyStart) {
      toast.error("The warranty must end after it starts.");
      return;
    }
    await patchVendor(
      {
        id: renewing.id,
        action: "renew",
        warrantyStart,
        warrantyEnd,
        warrantyScope: fd.get("warrantyScope"),
        note: fd.get("note"),
      },
      `Warranty renewed to ${formatDate(warrantyEnd)}.`,
    );
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
        loadData();
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
      loadData();
    } else {
      toast.error("Failed to close intervention.");
    }
  }

  return (
    <div className="min-h-screen bg-canvas text-ink-900 flex flex-col font-sans">
      <main className={PAGE_MAIN.register}>
        <PageHeader
          title="OEM & Warranty Management"
          subtitle="Machine suppliers, what is still under warranty, and how fast they respond"
          actions={
            canWrite ? (
              <>
                <Button variant="secondary" onClick={() => openIntervention()}>
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
          <div className="bg-surface border border-line rounded-xl shadow-card overflow-hidden">
            <TableSkeleton rows={6} cols={6} />
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
                  label: `Expiring within ${EXPIRY_WARNING_DAYS} days`,
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

            {/* A table, not a card per vendor. Cards gave every vendor the
                same weight and the same space whether its cover was live or
                had lapsed years ago, and offered nothing to do about either.
                Rows sort and scan; what to do with one is in its menu. */}
            <div className="bg-surface border border-line rounded-xl shadow-card overflow-hidden">
              <div className="px-5 py-4 border-b border-line">
                <h3 className="text-sm font-semibold text-ink-900">Vendors and warranty cover</h3>
              </div>
              {vendors.length === 0 ? (
                <EmptyState
                  icon={Handshake}
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
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-line text-ink-500 text-xs">
                        <th className="py-3 px-5 font-medium">Vendor</th>
                        <th className="py-3 px-5 font-medium">Equipment</th>
                        <th className="py-3 px-5 font-medium">Warranty</th>
                        <th className="py-3 px-5 font-medium whitespace-nowrap">Warranty end</th>
                        <th className="py-3 px-5 font-medium whitespace-nowrap">Response / lead</th>
                        <th className="py-3 px-5 font-medium text-right">
                          <span className="sr-only">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {vendors.map((v) => (
                        <tr key={v.id} className="hover:bg-ink-50">
                          <td className="py-3 px-5">
                            <button
                              type="button"
                              onClick={() => setViewing(v)}
                              className="text-left font-semibold text-ink-900 hover:text-brand-700 hover:underline underline-offset-2"
                            >
                              {v.vendorName}
                            </button>
                            {v.contactPerson && <div className="text-xs text-ink-500">{v.contactPerson}</div>}
                          </td>
                          <td className="py-3 px-5">
                            {v.assetId ? (
                              <Link href={equipmentHref(v.assetId)} className="text-ink-900 hover:text-brand-700 hover:underline underline-offset-2">
                                {v.equipmentName ?? v.assetId}
                              </Link>
                            ) : (
                              <span className="text-ink-500">-</span>
                            )}
                            {v.assetId && <div className="text-xs text-ink-500 tabular-nums">{v.assetId}</div>}
                          </td>
                          <td className="py-3 px-5 whitespace-nowrap">
                            <CoverBadge v={v} />
                          </td>
                          <td className="py-3 px-5 tabular-nums text-ink-700 whitespace-nowrap">
                            {v.warrantyEnd ? formatDate(v.warrantyEnd) : "-"}
                          </td>
                          <td className="py-3 px-5 text-xs text-ink-500 whitespace-nowrap tabular-nums">
                            {[v.avgResponseTimeHrs != null && `${v.avgResponseTimeHrs} h`, v.avgSpareLeadTimeDays != null && `${v.avgSpareLeadTimeDays} d`].filter(Boolean).join(" · ") || "-"}
                          </td>
                          <td className="py-3 px-5 text-right">
                            <KebabMenu ariaLabel={`Actions for ${v.vendorName}`} items={vendorActions(v)} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Interventions */}
            <div className="bg-surface border border-line rounded-xl shadow-card overflow-hidden">
              <div className="px-5 py-4 border-b border-line">
                <h3 className="text-sm font-semibold text-ink-900">OEM intervention log</h3>
              </div>
              {interventions.length === 0 ? (
                <EmptyState
                  icon={Wrench}
                  title="No OEM interventions logged"
                  message="Log each vendor call-out and warranty claim here so response times and warranty performance can be evidenced."
                  actionLabel={canWrite ? "Log Intervention" : undefined}
                  onAction={canWrite ? () => openIntervention() : undefined}
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-line text-ink-500 text-xs">
                        <th className="py-3 px-5 font-medium">Date</th>
                        <th className="py-3 px-5 font-medium">Vendor / equipment</th>
                        <th className="py-3 px-5 font-medium">Problem</th>
                        <th className="py-3 px-5 font-medium">Warranty</th>
                        <th className="py-3 px-5 font-medium">Response</th>
                        <th className="py-3 px-5 font-medium">Resolution</th>
                        <th className="py-3 px-5 font-medium">Status</th>
                        <th className="py-3 px-5 font-medium text-right">
                          <span className="sr-only">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {interventions.map((it) => (
                        <tr key={it.id} className="hover:bg-ink-50">
                          <td className="py-3 px-5 tabular-nums text-ink-500 whitespace-nowrap">{formatDate(it.interventionDate)}</td>
                          <td className="py-3 px-5">
                            <div className="text-ink-900">{it.vendorName ?? "No linked vendor"}</div>
                            <div className="text-xs text-ink-500">
                              {it.equipmentName ?? "-"}
                              {it.assetId ? ` · ${it.assetId}` : ""}
                            </div>
                          </td>
                          <td className="py-3 px-5 text-ink-700 max-w-xs">{it.problemDescription}</td>
                          <td className="py-3 px-5 whitespace-nowrap">
                            <Badge
                              className={
                                it.warrantyStatus === "IN"
                                  ? "bg-brand-500/10 text-brand-700 border-brand-500/20"
                                  : "bg-ink-500/10 text-ink-600 border-ink-500/20"
                              }
                            >
                              {it.warrantyStatus === "IN" ? "In warranty" : "Out of warranty"}
                            </Badge>
                          </td>
                          <td className="py-3 px-5 text-ink-700 whitespace-nowrap tabular-nums">
                            {it.responseTimeHrs != null ? `${it.responseTimeHrs} h` : "-"}
                          </td>
                          <td className="py-3 px-5 text-ink-500 max-w-xs">{it.resolutionSummary || "-"}</td>
                          <td className="py-3 px-5">
                            {it.closed ? (
                              <Badge className="bg-brand-500/10 text-brand-700 border-brand-500/20">Closed</Badge>
                            ) : (
                              <Badge className="bg-warn-500/10 text-warn-700 border-warn-500/20">Open</Badge>
                            )}
                          </td>
                          <td className="py-3 px-5 text-right">
                            {canWrite && !it.closed && (
                              <KebabMenu
                                ariaLabel="Intervention actions"
                                items={[
                                  { label: "Close intervention", icon: CheckCircle2, onClick: () => closeIntervention(it.id) },
                                ]}
                              />
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

      {/* Vendor details */}
      <Modal
        open={!!viewing}
        onClose={() => setViewing(null)}
        title={viewing?.vendorName ?? "Vendor"}
        subtitle={viewing ? `${viewing.equipmentName ?? ""}${viewing.assetId ? ` · ${viewing.assetId}` : ""}` : ""}
      >
        {viewing &&
          (() => {
            const { cover } = coverOf(viewing);
            const lapsed = cover === "EXPIRED" || cover === "EXPIRING" || cover === "NONE";
            return (
              <div className="space-y-5">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <CoverBadge v={viewing} />
                  {viewing.warrantyEnd && (
                    <span className="text-ink-500">
                      {cover === "EXPIRED" ? "Ended" : "Ends"} {formatDate(viewing.warrantyEnd)}
                    </span>
                  )}
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <Meta label="Contact" value={viewing.contactPerson} />
                  <Meta label="Country" value={viewing.country} />
                  <Meta label="Phone" value={viewing.phone} />
                  <Meta label="Email" value={viewing.email} />
                  <Meta label="Warranty start" value={viewing.warrantyStart ? formatDate(viewing.warrantyStart) : null} />
                  <Meta label="Warranty end" value={viewing.warrantyEnd ? formatDate(viewing.warrantyEnd) : null} />
                  <Meta label="Scope" value={viewing.warrantyScope} wide />
                  <Meta label="Average response" value={viewing.avgResponseTimeHrs != null ? `${viewing.avgResponseTimeHrs} h` : null} />
                  <Meta label="Spare lead time" value={viewing.avgSpareLeadTimeDays != null ? `${viewing.avgSpareLeadTimeDays} d` : null} />
                  <Meta label="Notes" value={viewing.notes} wide />
                </dl>
                {canWrite && (
                  <div className="flex flex-wrap justify-end gap-2 pt-1">
                    <Button variant="secondary" icon={Pencil} onClick={() => { setEditing(viewing); setViewing(null); }}>
                      Edit
                    </Button>
                    <Button
                      variant={lapsed ? "primary" : "secondary"}
                      icon={RefreshCw}
                      onClick={() => { setRenewing(viewing); setViewing(null); }}
                    >
                      {lapsed ? "Renew warranty" : "Extend warranty"}
                    </Button>
                  </div>
                )}
              </div>
            );
          })()}
      </Modal>

      {/* Edit vendor */}
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title="Edit vendor"
        subtitle={editing ? `${editing.equipmentName ?? ""}${editing.assetId ? ` · ${editing.assetId}` : ""}` : ""}
      >
        {editing && (
          <form key={editing.id} onSubmit={submitEdit} className="space-y-4">
            <VendorFormFields v={editing} />
            <div>
              <label className={LABEL_CLASS}>Notes</label>
              <textarea name="notes" defaultValue={editing.notes ?? ""} className={`${FIELD_CLASS} h-16 resize-none`} />
            </div>
            <SubmitRow saving={saving} onCancel={() => setEditing(null)} label="Save changes" />
          </form>
        )}
      </Modal>

      {/* Renew warranty */}
      <Modal
        open={!!renewing}
        onClose={() => setRenewing(null)}
        title="Renew warranty"
        subtitle={renewing ? `${renewing.vendorName} · ${renewing.equipmentName ?? renewing.assetId ?? ""}` : ""}
      >
        {renewing && (
          <form key={renewing.id} onSubmit={submitRenew} className="space-y-4">
            <p className="text-xs text-ink-500">
              {renewing.warrantyEnd
                ? `Current cover ${renewing.warrantyEnd < TODAY ? "ended" : "ends"} ${formatDate(renewing.warrantyEnd)}. `
                : "No cover is recorded. "}
              The renewal is written to the machine&apos;s history and the audit log.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LABEL_CLASS}>New start</label>
                <DateField name="warrantyStart" defaultValue={TODAY} />
              </div>
              <div>
                <label className={LABEL_CLASS}>New end</label>
                <DateField name="warrantyEnd" />
              </div>
            </div>
            <div>
              <label className={LABEL_CLASS}>Warranty scope</label>
              <input name="warrantyScope" defaultValue={renewing.warrantyScope ?? ""} className={FIELD_CLASS} placeholder="e.g. Parts & labour, on-site" />
            </div>
            <div>
              <label className={LABEL_CLASS}>Note (optional)</label>
              <input name="note" className={FIELD_CLASS} placeholder="e.g. Extended warranty purchased, PO 4471" />
            </div>
            <SubmitRow saving={saving} onCancel={() => setRenewing(null)} label="Renew warranty" />
          </form>
        )}
      </Modal>

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
          <VendorFormFields />
          <SubmitRow saving={saving} onCancel={() => setShowVendor(false)} label="Register Vendor" />
        </form>
      </Modal>

      {/* Log Intervention modal */}
      <Modal open={showIntervention} onClose={() => setShowIntervention(false)} title="Log OEM Intervention" subtitle="Vendor call-out / warranty claim">
        <form onSubmit={submitIntervention} className="space-y-4">
          <div>
            <label className={LABEL_CLASS}>Vendor (optional)</label>
            <Select value={intOemId} onChange={setIntOemId} className="w-full">
              <option value="">No linked vendor</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>{v.vendorName} ({v.assetId})</option>
              ))}
            </Select>
          </div>
          <div>
            <label className={LABEL_CLASS}>Equipment (if no vendor)</label>
            <Select value={intEquipmentId} onChange={setIntEquipmentId} className="w-full">
              <option value="">Select equipment</option>
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
              <input name="closed" type="checkbox" className="rounded-lg border-ink-300 accent-brand-600" /> Already resolved
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

function vendorFields(fd: FormData) {
  return {
    vendorName: fd.get("vendorName"),
    contactPerson: fd.get("contactPerson"),
    phone: fd.get("phone"),
    email: fd.get("email"),
    country: fd.get("country"),
    warrantyStart: (fd.get("warrantyStart") as string) || null,
    warrantyEnd: (fd.get("warrantyEnd") as string) || null,
    warrantyScope: fd.get("warrantyScope"),
    avgResponseTimeHrs: fd.get("avgResponseTimeHrs") ? Number(fd.get("avgResponseTimeHrs")) : null,
    avgSpareLeadTimeDays: fd.get("avgSpareLeadTimeDays") ? Number(fd.get("avgSpareLeadTimeDays")) : null,
  };
}

// One set of fields for registering and for correcting a vendor, so the two
// forms cannot drift apart.
function VendorFormFields({ v }: { v?: Vendor }) {
  return (
    <>
      <div>
        <label className={LABEL_CLASS}>Vendor / OEM Name</label>
        <input name="vendorName" required defaultValue={v?.vendorName ?? ""} className={FIELD_CLASS} placeholder="e.g. Amada, Trumpf, Lincoln Electric" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LABEL_CLASS}>Contact Person</label>
          <input name="contactPerson" defaultValue={v?.contactPerson ?? ""} className={FIELD_CLASS} />
        </div>
        <div>
          <label className={LABEL_CLASS}>Country</label>
          <input name="country" defaultValue={v?.country ?? ""} className={FIELD_CLASS} />
        </div>
        <div>
          <label className={LABEL_CLASS}>Phone</label>
          <input name="phone" defaultValue={v?.phone ?? ""} className={FIELD_CLASS} />
        </div>
        <div>
          <label className={LABEL_CLASS}>Email</label>
          <input name="email" type="email" defaultValue={v?.email ?? ""} className={FIELD_CLASS} />
        </div>
        <div>
          <label className={LABEL_CLASS}>Warranty Start</label>
          <DateField name="warrantyStart" defaultValue={v?.warrantyStart ?? undefined} />
        </div>
        <div>
          <label className={LABEL_CLASS}>Warranty End</label>
          <DateField name="warrantyEnd" defaultValue={v?.warrantyEnd ?? undefined} />
        </div>
        <div>
          <label className={LABEL_CLASS}>Avg Response (hrs)</label>
          <input name="avgResponseTimeHrs" type="number" step="0.5" defaultValue={v?.avgResponseTimeHrs ?? ""} className={FIELD_CLASS} />
        </div>
        <div>
          <label className={LABEL_CLASS}>Spare Lead (days)</label>
          <input name="avgSpareLeadTimeDays" type="number" step="1" defaultValue={v?.avgSpareLeadTimeDays ?? ""} className={FIELD_CLASS} />
        </div>
      </div>
      <div>
        <label className={LABEL_CLASS}>Warranty Scope</label>
        <input name="warrantyScope" defaultValue={v?.warrantyScope ?? ""} className={FIELD_CLASS} placeholder="e.g. Parts & labour, on-site" />
      </div>
    </>
  );
}

function Meta({ label, value, wide = false }: { label: string; value: string | null; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2" : ""}>
      <dt className="text-xs text-ink-500">{label}</dt>
      <dd className="text-ink-900 mt-0.5 break-words">{value || "-"}</dd>
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
