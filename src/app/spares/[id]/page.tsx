// src/app/spares/[id]/page.tsx
"use client";

import { use, useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  Package,
  ArrowDownToLine,
  ArrowUpFromLine,
  Scale,
  Trash2,
  Cpu,
  Plus,
  Unlink,
  ExternalLink,
  AlertTriangle,
  Clock,
  Building2,
  DollarSign,
  Tag,
  Warehouse,
  History,
} from "lucide-react";
import { toast } from "sonner";
import PageHeader from "@/components/PageHeader";
import MetricPanel from "@/components/MetricPanel";
import Button from "@/components/Button";
import Modal from "@/components/Modal";
import Select from "@/components/Select";
import { Badge } from "@/components/Badge";
import Field, { FIELD_CLASS } from "@/components/Field";
import TableSkeleton from "@/components/TableSkeleton";
import LoadError from "@/components/LoadError";
import EmptyState from "@/components/EmptyState";
import { MAINTENANCE_WRITE_ROLES, SPARES_DELETE_ROLES } from "@/lib/roles";
import { CRITICALITY_SHORT } from "@/lib/constants";
import {
  STOCK_LEVEL_LABELS,
  STOCK_LEVEL_BADGE,
  reorderQuantity,
  stockLevelOf,
  MOVEMENT_LABELS,
} from "@/lib/maintenance/spares";

type AttachedEquipment = {
  linkId: string;
  equipmentId: string;
  name: string;
  assetId: string;
  category: string | null;
  criticality: string | null;
  status: string | null;
  location: string | null;
  notes: string | null;
  linkedAt: string;
};

type Movement = {
  id: string;
  movementType: "ISSUE" | "RECEIPT" | "ADJUSTMENT";
  quantity: number;
  balanceAfter: number;
  reason: string | null;
  workOrderId: string | null;
  performedByName: string | null;
  createdAt: string;
};

type SpareDetail = {
  id: string;
  partNumber: string;
  name: string;
  brand: string | null;
  model: string | null;
  description: string | null;
  equipmentId: string | null;
  quantityOnHand: number;
  minimumQuantity: number;
  maximumQuantity: number | null;
  unit: string | null;
  binLocation: string | null;
  supplierName: string | null;
  supplierPartNumber: string | null;
  leadTimeDays: number | null;
  unitCost: number | null;
  currency: string | null;
  onOrder: boolean | null;
  onOrderQuantity: number | null;
  expectedDate: string | null;
  notes: string | null;
  movements: Movement[];
  attachedEquipment: AttachedEquipment[];
};

type EquipmentOption = {
  id: string;
  assetId: string;
  name: string;
  criticality: string | null;
  category: string | null;
};

export default function SpareDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: session } = useSession();

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const role = (session?.user as { role?: string })?.role;
  const canWrite = mounted && MAINTENANCE_WRITE_ROLES.includes(role ?? "");
  const canDelete = mounted && SPARES_DELETE_ROLES.includes(role ?? "");

  const [spare, setSpare] = useState<SpareDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [allEquipment, setAllEquipment] = useState<EquipmentOption[]>([]);
  const [attachModalOpen, setAttachModalOpen] = useState(false);
  const [selectedEqId, setSelectedEqId] = useState("");
  const [attachNotes, setAttachNotes] = useState("");
  const [attaching, setAttaching] = useState(false);

  const [movement, setMovement] = useState<{ type: "ISSUE" | "RECEIPT" | "ADJUSTMENT"; qty: string; reason: string } | null>(null);
  const [moving, setMoving] = useState(false);

  const [deleting, setDeleting] = useState(false);
  const [deletingBusy, setDeletingBusy] = useState(false);

  const fetchSpare = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/spares/${id}`);
      if (!res.ok) {
        if (res.status === 404) throw new Error("Spare part not found");
        throw new Error("Failed to load spare part");
      }
      const data = await res.json();
      setSpare(data);
    } catch (err: any) {
      setError(err.message || "Failed to load spare part");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSpare();
  }, [id]);

  useEffect(() => {
    if (canWrite) {
      fetch("/api/equipment")
        .then((r) => (r.ok ? r.json() : []))
        .then((d) => setAllEquipment(Array.isArray(d) ? d : []))
        .catch(() => {});
    }
  }, [canWrite]);

  const level = spare ? stockLevelOf(spare.quantityOnHand, spare.minimumQuantity) : "ADEQUATE";
  const reorder = spare ? reorderQuantity(spare.quantityOnHand, spare.minimumQuantity, spare.maximumQuantity) : 0;

  const availableEquipment = useMemo(() => {
    if (!spare) return allEquipment;
    const attachedIds = new Set(spare.attachedEquipment?.map((e) => e.equipmentId) ?? []);
    return allEquipment.filter((e) => !attachedIds.has(e.id));
  }, [allEquipment, spare]);

  const handleAttachEquipment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEqId) {
      toast.error("Please choose a machine to attach.");
      return;
    }
    setAttaching(true);
    try {
      const res = await fetch(`/api/spares/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attachEquipmentId: selectedEqId,
          notes: attachNotes.trim() || undefined,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || "Failed to attach machine.");
        return;
      }
      toast.success("Machine attached to this spare part.");
      setAttachModalOpen(false);
      setSelectedEqId("");
      setAttachNotes("");
      fetchSpare();
    } catch {
      toast.error("Failed to attach machine.");
    } finally {
      setAttaching(false);
    }
  };

  const handleDetachEquipment = async (equipmentId: string, eqName: string) => {
    if (!confirm(`Detach ${eqName} from this spare part?`)) return;
    try {
      const res = await fetch(`/api/spares/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ detachEquipmentId: equipmentId }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || "Failed to detach machine.");
        return;
      }
      toast.success(`${eqName} detached.`);
      fetchSpare();
    } catch {
      toast.error("Failed to detach machine.");
    }
  };

  const submitMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!movement) return;
    const n = Number(movement.qty);
    if (!Number.isFinite(n) || n <= 0) {
      toast.error("Enter a valid quantity greater than zero.");
      return;
    }
    setMoving(true);
    try {
      const res = await fetch(`/api/spares/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          movementType: movement.type,
          quantity: n,
          reason: movement.reason.trim() || undefined,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || "Failed to record movement.");
        return;
      }
      toast.success(
        movement.type === "ADJUSTMENT"
          ? `Stock reconciled to ${d.balanceAfter}.`
          : `${MOVEMENT_LABELS[movement.type] ?? movement.type} recorded. New balance: ${d.balanceAfter}.`,
      );
      setMovement(null);
      fetchSpare();
    } catch {
      toast.error("Failed to record movement.");
    } finally {
      setMoving(false);
    }
  };

  const confirmDelete = async () => {
    if (!spare) return;
    setDeletingBusy(true);
    try {
      const res = await fetch(`/api/spares/${id}`, { method: "DELETE" });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || "Could not remove part.");
        return;
      }
      toast.success(`${spare.name} removed.`);
      router.push("/spares");
    } catch {
      toast.error("Could not remove part.");
    } finally {
      setDeletingBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <TableSkeleton rows={4} cols={4} />
      </div>
    );
  }

  if (error || !spare) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <LoadError what="this spare part" onRetry={fetchSpare} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas text-ink-900 flex flex-col font-sans">
      <main className="flex-1 p-6 md:p-8 max-w-7xl mx-auto w-full space-y-6">
        <PageHeader
          title={spare.name}
          subtitle={[
            spare.partNumber,
            [spare.brand, spare.model].filter(Boolean).join(" "),
            spare.binLocation ? `Bin ${spare.binLocation}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
          code={`SPR-${spare.partNumber}`}
          backHref="/spares"
          backLabel="Critical Spares"
          actions={
            canWrite ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={ArrowUpFromLine}
                  onClick={() => setMovement({ type: "ISSUE", qty: "1", reason: "" })}
                >
                  Issue to job
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={ArrowDownToLine}
                  onClick={() => setMovement({ type: "RECEIPT", qty: String(reorder || 1), reason: "" })}
                >
                  Receive stock
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={Scale}
                  onClick={() => setMovement({ type: "ADJUSTMENT", qty: String(spare.quantityOnHand), reason: "" })}
                >
                  Reconcile stock
                </Button>
                {canDelete && (
                  <Button variant="danger" size="sm" icon={Trash2} onClick={() => setDeleting(true)}>
                    Remove part
                  </Button>
                )}
              </div>
            ) : undefined
          }
        />

        {/* High-level status panels */}
        <MetricPanel
          columns={4}
          label="Stock & lead time metrics"
          metrics={[
            {
              key: "onhand",
              label: "Quantity on hand",
              count: spare.quantityOnHand,
              value: `${spare.quantityOnHand} ${spare.unit ?? "ea"}`,
              status: spare.quantityOnHand <= 0 ? "danger" : spare.quantityOnHand < spare.minimumQuantity ? "warning" : "plain",
              description: `Minimum threshold is ${spare.minimumQuantity} ${spare.unit ?? "ea"}`,
            },
            {
              key: "stocklevel",
              label: "Stock standing",
              count: 1,
              value: STOCK_LEVEL_LABELS[level],
              status: level === "OUT_OF_STOCK" ? "danger" : level === "BELOW_MINIMUM" ? "warning" : "plain",
              description: reorder > 0 ? `Reorder deficit: ${reorder} ${spare.unit ?? "ea"}` : "Stock is adequate",
            },
            {
              key: "leadtime",
              label: "Supplier lead time",
              count: spare.leadTimeDays ?? 0,
              value: spare.leadTimeDays ? `${spare.leadTimeDays} days` : "Unspecified",
              status: spare.quantityOnHand <= 0 && spare.leadTimeDays ? "danger" : "plain",
              description: spare.supplierName ? `Sourced from ${spare.supplierName}` : "No supplier assigned",
            },
            {
              key: "onorder",
              label: "Purchase status",
              count: spare.onOrder ? 1 : 0,
              value: spare.onOrder ? "On order" : "Not ordered",
              status: spare.onOrder ? "warning" : "plain",
              description: spare.expectedDate ? `Expected arrival: ${spare.expectedDate}` : "No expected date",
            },
          ]}
        />

        {/* Attached Machines Section */}
        <div className="bg-surface border border-line rounded-xl shadow-card overflow-hidden">
          <div className="p-5 border-b border-line flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Cpu className="w-5 h-5 text-brand-600" />
                <h2 className="text-base font-semibold text-ink-900">
                  Attached Machines ({spare.attachedEquipment?.length ?? 0})
                </h2>
              </div>
              <p className="text-xs text-ink-500 mt-1">
                Machines that require or consume this spare part. Spares can be shared across multiple machines.
              </p>
            </div>
            {canWrite && (
              <Button size="sm" icon={Plus} onClick={() => setAttachModalOpen(true)}>
                Attach machine
              </Button>
            )}
          </div>

          {!spare.attachedEquipment || spare.attachedEquipment.length === 0 ? (
            <div className="p-8 text-center text-ink-500">
              <Cpu className="w-8 h-8 mx-auto text-ink-300 mb-2" />
              <p className="text-sm font-semibold text-ink-700">General workshop stock</p>
              <p className="text-xs text-ink-400 mt-1 max-w-md mx-auto">
                This spare part is currently not linked to any specific equipment. You can attach it to one or more machines to track maintenance requirements.
              </p>
              {canWrite && (
                <div className="mt-4">
                  <Button variant="secondary" size="sm" icon={Plus} onClick={() => setAttachModalOpen(true)}>
                    Attach a machine
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-ink-200 bg-ink-50 text-ink-500">
                    <th className="py-3 px-5 font-semibold">Machine / Asset</th>
                    <th className="py-3 px-5 font-semibold">Category</th>
                    <th className="py-3 px-5 font-semibold text-center">Criticality</th>
                    <th className="py-3 px-5 font-semibold">Location</th>
                    <th className="py-3 px-5 font-semibold">Notes</th>
                    {canWrite && <th className="py-3 px-5 font-semibold text-right">Action</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-200">
                  {spare.attachedEquipment.map((eq) => (
                    <tr key={eq.linkId} className="hover:bg-ink-50 transition-colors">
                      <td className="py-3.5 px-5">
                        <Link
                          href={`/equipment/${encodeURIComponent(eq.assetId)}`}
                          className="font-semibold text-ink-900 hover:text-brand-600 flex items-center gap-1.5"
                        >
                          {eq.name}
                          <ExternalLink className="w-3 h-3 text-ink-400" />
                        </Link>
                        <p className="text-xs text-ink-500 mt-0.5">{eq.assetId}</p>
                      </td>
                      <td className="py-3.5 px-5 text-ink-600">{eq.category ?? "—"}</td>
                      <td className="py-3.5 px-5 text-center">
                        {eq.criticality ? (
                          <Badge
                            className={
                              eq.criticality.toUpperCase() === "CRITICAL"
                                ? "bg-danger-500/10 text-danger-700 border-danger-500/20"
                                : eq.criticality.toUpperCase() === "HIGH"
                                ? "bg-orange-500/10 text-orange-700 border-orange-500/20"
                                : "bg-ink-100 text-ink-700 border-ink-200"
                            }
                          >
                            {CRITICALITY_SHORT[eq.criticality] ?? eq.criticality}
                          </Badge>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-3.5 px-5 text-ink-600">{eq.location ?? "—"}</td>
                      <td className="py-3.5 px-5 text-ink-500">{eq.notes ?? "—"}</td>
                      {canWrite && (
                        <td className="py-3.5 px-5 text-right">
                          <button
                            type="button"
                            onClick={() => handleDetachEquipment(eq.equipmentId, eq.name)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-danger-600 hover:bg-danger-50 rounded-lg transition-colors"
                            title="Detach machine"
                          >
                            <Unlink className="w-3.5 h-3.5" />
                            Detach
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Specifications & Storage Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-surface border border-line rounded-xl shadow-card p-5 space-y-4">
            <h3 className="text-sm font-semibold text-ink-900 flex items-center gap-2">
              <Tag className="w-4 h-4 text-ink-500" />
              Part Specifications
            </h3>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <p className="text-ink-400">Part number</p>
                <p className="font-semibold text-ink-900 mt-0.5">{spare.partNumber}</p>
              </div>
              <div>
                <p className="text-ink-400">Brand & model</p>
                <p className="font-semibold text-ink-900 mt-0.5">
                  {[spare.brand, spare.model].filter(Boolean).join(" ") || "—"}
                </p>
              </div>
              <div>
                <p className="text-ink-400">Unit of issue</p>
                <p className="font-semibold text-ink-900 mt-0.5">{spare.unit ?? "ea"}</p>
              </div>
              <div>
                <p className="text-ink-400">Bin location</p>
                <p className="font-semibold text-ink-900 mt-0.5">{spare.binLocation || "Not assigned"}</p>
              </div>
              <div className="col-span-2">
                <p className="text-ink-400">Description</p>
                <p className="text-ink-700 mt-0.5 leading-relaxed">{spare.description || "No description recorded."}</p>
              </div>
              {spare.notes && (
                <div className="col-span-2">
                  <p className="text-ink-400">Maintenance notes</p>
                  <p className="text-ink-700 mt-0.5 leading-relaxed">{spare.notes}</p>
                </div>
              )}
            </div>
          </div>

          <div className="bg-surface border border-line rounded-xl shadow-card p-5 space-y-4">
            <h3 className="text-sm font-semibold text-ink-900 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-ink-500" />
              Procurement & Supply Chain
            </h3>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <p className="text-ink-400">Supplier name</p>
                <p className="font-semibold text-ink-900 mt-0.5">{spare.supplierName || "—"}</p>
              </div>
              <div>
                <p className="text-ink-400">Supplier part number</p>
                <p className="font-semibold text-ink-900 mt-0.5">{spare.supplierPartNumber || "—"}</p>
              </div>
              <div>
                <p className="text-ink-400">Estimated unit cost</p>
                <p className="font-semibold text-ink-900 mt-0.5">
                  {spare.unitCost != null
                    ? `${spare.currency || "NGN"} ${Number(spare.unitCost).toLocaleString()}`
                    : "—"}
                </p>
              </div>
              <div>
                <p className="text-ink-400">Lead time</p>
                <p className="font-semibold text-ink-900 mt-0.5">
                  {spare.leadTimeDays ? `${spare.leadTimeDays} calendar days` : "—"}
                </p>
              </div>
              <div className="col-span-2 pt-2 border-t border-ink-100 flex items-center justify-between">
                <div>
                  <p className="text-ink-400">Open order status</p>
                  <p className="font-semibold text-ink-800 mt-0.5">
                    {spare.onOrder ? `On order (${spare.onOrderQuantity || reorder} ${spare.unit ?? "ea"})` : "None"}
                  </p>
                </div>
                {spare.expectedDate && (
                  <div className="text-right">
                    <p className="text-ink-400">Expected delivery</p>
                    <p className="font-semibold text-ink-800 mt-0.5">{spare.expectedDate}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Stock Movement Ledger */}
        <div className="bg-surface border border-line rounded-xl shadow-card overflow-hidden">
          <div className="p-5 border-b border-line flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="w-5 h-5 text-ink-500" />
              <h2 className="text-base font-semibold text-ink-900">
                Stock Movements Ledger ({spare.movements?.length ?? 0})
              </h2>
            </div>
            <span className="text-xs text-ink-400">Stores audit record</span>
          </div>

          {!spare.movements || spare.movements.length === 0 ? (
            <div className="p-8 text-center text-ink-500">
              <p className="text-xs">No stock movements recorded yet for this part.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-ink-200 bg-ink-50 text-ink-500">
                    <th className="py-3 px-5 font-semibold">Date & Time</th>
                    <th className="py-3 px-5 font-semibold">Action</th>
                    <th className="py-3 px-5 font-semibold text-right">Quantity</th>
                    <th className="py-3 px-5 font-semibold text-right">Balance After</th>
                    <th className="py-3 px-5 font-semibold">Reason / Reference</th>
                    <th className="py-3 px-5 font-semibold">Recorded By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-200">
                  {spare.movements.map((m) => (
                    <tr key={m.id} className="hover:bg-ink-50 transition-colors">
                      <td className="py-3 px-5 text-ink-500 whitespace-nowrap">
                        {new Date(m.createdAt).toLocaleString()}
                      </td>
                      <td className="py-3 px-5">
                        <Badge
                          className={
                            m.movementType === "RECEIPT"
                              ? "bg-brand-500/10 text-brand-700 border-brand-500/20"
                              : m.movementType === "ISSUE"
                              ? "bg-warn-500/10 text-warn-700 border-warn-500/20"
                              : "bg-info-500/10 text-info-700 border-info-500/20"
                          }
                        >
                          {MOVEMENT_LABELS[m.movementType] ?? m.movementType}
                        </Badge>
                      </td>
                      <td
                        className={`py-3 px-5 text-right font-semibold ${
                          m.quantity > 0 ? "text-brand-700" : m.quantity < 0 ? "text-danger-700" : "text-ink-700"
                        }`}
                      >
                        {m.quantity > 0 ? `+${m.quantity}` : m.quantity} {spare.unit ?? "ea"}
                      </td>
                      <td className="py-3 px-5 text-right font-semibold text-ink-900">
                        {m.balanceAfter} {spare.unit ?? "ea"}
                      </td>
                      <td className="py-3 px-5 text-ink-600 max-w-xs truncate">{m.reason || "—"}</td>
                      <td className="py-3 px-5 text-ink-600">{m.performedByName || "System"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Attach Machine Modal */}
        <Modal
          open={attachModalOpen}
          onClose={() => setAttachModalOpen(false)}
          title="Attach Machine to Spare Part"
          subtitle={`${spare.partNumber} · ${spare.name}`}
        >
          <form onSubmit={handleAttachEquipment} className="space-y-4">
            <Field label="Choose Machine *" htmlFor="eq-select">
              <Select
                value={selectedEqId}
                onChange={(v) => setSelectedEqId(v)}
                className="w-full"
                ariaLabel="Select machine"
              >
                <option value="">Select equipment…</option>
                {availableEquipment.map((eq) => (
                  <option key={eq.id} value={eq.id}>
                    {eq.assetId} · {eq.name} ({CRITICALITY_SHORT[eq.criticality ?? ""] ?? "General"})
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Application / Notes (optional)" htmlFor="att-notes">
              <input
                id="att-notes"
                value={attachNotes}
                onChange={(e) => setAttachNotes(e.target.value)}
                placeholder="e.g. Primary spindle assembly, 2 required per unit"
                className={FIELD_CLASS}
              />
            </Field>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setAttachModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={attaching} icon={Plus}>
                Attach machine
              </Button>
            </div>
          </form>
        </Modal>

        {/* Stock Movement Modal */}
        <Modal
          open={!!movement}
          onClose={() => setMovement(null)}
          title={movement?.type === "ADJUSTMENT" ? "Reconcile stock" : movement ? (MOVEMENT_LABELS[movement.type] ?? "Stock movement") : "Stock movement"}
          subtitle={`${spare.partNumber} · ${spare.quantityOnHand} ${spare.unit ?? "ea"} currently on hand`}
        >
          {movement && (
            <form onSubmit={submitMovement} className="space-y-4">
              <Field
                label={movement.type === "ADJUSTMENT" ? "Counted quantity" : "Quantity"}
                htmlFor="mv-qty"
              >
                <input
                  id="mv-qty"
                  inputMode="decimal"
                  value={movement.qty}
                  onChange={(e) => setMovement({ ...movement, qty: e.target.value })}
                  className={FIELD_CLASS}
                  required
                />
              </Field>
              {movement.type === "ADJUSTMENT" && (
                <p className="text-xs text-ink-500 -mt-2">
                  This sets the stock balance to what was actually counted, rather than adding or removing an amount.
                </p>
              )}
              <Field label="Reason / Reference" htmlFor="mv-reason">
                <input
                  id="mv-reason"
                  value={movement.reason}
                  onChange={(e) => setMovement({ ...movement, reason: e.target.value })}
                  placeholder={
                    movement.type === "ISSUE"
                      ? "Work order number or job"
                      : movement.type === "RECEIPT"
                      ? "PO number or delivery note"
                      : "Quarterly stock audit count"
                  }
                  className={FIELD_CLASS}
                />
              </Field>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" onClick={() => setMovement(null)}>
                  Cancel
                </Button>
                <Button type="submit" loading={moving}>
                  {movement.type === "ADJUSTMENT" ? "Reconcile stock" : "Record movement"}
                </Button>
              </div>
            </form>
          )}
        </Modal>

        {/* Delete Confirmation Modal */}
        <Modal
          open={deleting}
          onClose={() => setDeleting(false)}
          title="Remove part"
          subtitle={`${spare.partNumber} · ${spare.name}`}
        >
          <div className="space-y-4">
            <p className="text-sm text-ink-600 leading-relaxed">
              <span className="font-semibold text-ink-900">{spare.name}</span> will be taken off the register. This cannot be undone.
            </p>
            <div className="flex items-start gap-2.5 px-4 py-3 rounded-lg bg-info-50 border border-info-200 text-sm text-info-900 leading-relaxed">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-info-600" />
              <span>
                If any stock has ever been issued, received or counted against this part, removal will be refused to protect the audit trail.
              </span>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setDeleting(false)}>
                Cancel
              </Button>
              <Button variant="danger" icon={Trash2} loading={deletingBusy} onClick={confirmDelete}>
                Remove part
              </Button>
            </div>
          </div>
        </Modal>
      </main>
    </div>
  );
}
