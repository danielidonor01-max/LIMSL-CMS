// src/app/asset-categories/page.tsx
// The asset categories, and the one place their maintenance interval changes.
//
// A category's interval is the maintenance regime for every machine in it, and
// the plan is built from it. So nothing here edits a category directly. It
// proposes a change, with a reason; the Maintenance Manager and the QA/QC
// Supervisor sign it; and only then does every machine in the category move to
// the new interval and its future plan get rebuilt. The changes list below is
// the record of that — what was asked, by whom, why, and who agreed.
"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Plus, Pencil, Tags, ChevronDown, ChevronRight, ArrowRight, ArrowRightLeft, Archive, Undo2, Calendar, Eye, AlertTriangle, FileSignature } from "lucide-react";
import { PAGE_MAIN } from "@/lib/page-shell";
import { useApi } from "@/lib/api-cache";
import { formatDate } from "@/lib/utils";
import PageHeader from "@/components/PageHeader";
import Button from "@/components/Button";
import Modal from "@/components/Modal";
import Select from "@/components/Select";
import Field, { FIELD_CLASS } from "@/components/Field";
import DateField from "@/components/DateField";
import { Badge } from "@/components/Badge";
import KebabMenu from "@/components/KebabMenu";
import EmptyState from "@/components/EmptyState";
import TableSkeleton from "@/components/TableSkeleton";
import SignoffChain from "@/components/SignoffChain";
import { ASSET_CATEGORY_ROLES, EQUIPMENT_MOVE_ROLES } from "@/lib/roles";
import MoveEquipmentModal from "@/components/MoveEquipmentModal";
import { FREQUENCY_LABELS } from "@/lib/constants";
import { FREQUENCY_MONTHS, calendarCollision } from "@/lib/maintenance/plan-generation";

type Category = {
  code: string;
  label: string;
  maintenanceFrequency: string;
  defaultStartDate: string | null;
  machineCount: number;
  /** False once the category has been retired. */
  isActive?: boolean;
  pendingChange: { id: string; changeNumber: string } | null;
};

type Change = {
  id: string;
  changeNumber: string;
  kind: "CREATE" | "UPDATE" | "RETIRE" | "REINSTATE";
  categoryCode: string;
  proposedLabel: string;
  proposedFrequency: string;
  proposedStartDate: string | null;
  previousLabel: string | null;
  previousFrequency: string | null;
  previousStartDate: string | null;
  reason: string;
  status: "PENDING_APPROVAL" | "APPLIED" | "REJECTED";
  proposedByName: string | null;
  createdAt: string;
  appliedAt: string | null;
  machinesAffected: number | null;
  planRowsReplaced: number | null;
  approval?: { total: number; signed: number; complete: boolean };
};

// Only intervals the planner can schedule. Offering one it cannot would
// produce a category whose machines never appear on the plan.
const FREQUENCIES = Object.keys(FREQUENCY_MONTHS);
const freq = (f: string | null | undefined) => (f ? (FREQUENCY_LABELS[f] ?? f) : "—");

const STATUS_BADGE: Record<string, string> = {
  PENDING_APPROVAL: "bg-warn-500/10 text-warn-700 border-warn-500/20",
  APPLIED: "bg-brand-500/10 text-brand-700 border-brand-500/20",
  REJECTED: "bg-danger-500/10 text-danger-600 border-danger-500/20",
};
const STATUS_LABEL: Record<string, string> = {
  PENDING_APPROVAL: "Awaiting signatures",
  APPLIED: "Applied",
  REJECTED: "Rejected",
};

type Draft = {
  kind: "CREATE" | "UPDATE";
  categoryCode?: string;
  label: string;
  frequency: string;
  startDate: string;
  reason: string;
  machineCount?: number;
  previous?: { label: string; frequency: string; startDate?: string };
};

function AssetCategoriesView() {
  const { data: session } = useSession();
  const [mounted, setMounted] = useState(false);
  const role = (session?.user as { role?: string })?.role ?? null;
  useEffect(() => setMounted(true), []);

  const canPropose = mounted && ASSET_CATEGORY_ROLES.includes(role ?? "");
  const canMove = mounted && EQUIPMENT_MOVE_ROLES.includes(role ?? "");
  const [moving, setMoving] = useState(false);

  const { data: catData, loading, refresh: refreshCats } = useApi<{ categories: Category[] }>(
    "/api/asset-categories",
    { categories: [] },
  );
  const { data: changeData, refresh: refreshChanges } = useApi<{ changes: Change[] }>(
    "/api/asset-categories/changes",
    { changes: [] },
  );
  const categories = catData.categories ?? [];
  const changes = changeData.changes ?? [];

  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  // Retiring a category, or bringing one back: only a reason is asked for.
  const [retiring, setRetiring] = useState<{ category: Category; kind: "RETIRE" | "REINSTATE"; reason: string } | null>(null);
  // A retired category holds no days, so it is not part of the collision check.
  const inUse = useMemo(() => categories.filter((c) => c.isActive !== false), [categories]);

  const submitRetirement = async () => {
    if (!retiring) return;
    setSaving(true);
    try {
      const res = await fetch("/api/asset-categories/changes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: retiring.kind, categoryCode: retiring.category.code, reason: retiring.reason }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(d.error || "Could not raise the request.");
        return;
      }
      toast.success(
        `${d.changeNumber} proposed. ${retiring.category.label} is ${retiring.kind === "RETIRE" ? "retired" : "brought back"} once the Maintenance Manager and QA/QC Supervisor have signed it.`,
      );
      setRetiring(null);
      setOpenChange(d.id);
      refreshAll();
    } finally {
      setSaving(false);
    }
  };
  // Arriving from a notification or from My Approvals, the change is named in
  // the URL. It is opened and brought into view, rather than leaving the
  // signer to find which of several pending changes is theirs.
  const searchParams = useSearchParams();
  const [openChange, setOpenChange] = useState<string | null>(searchParams.get("change"));
  const [scrolled, setScrolled] = useState(false);

  const pending = useMemo(() => changes.filter((c) => c.status === "PENDING_APPROVAL"), [changes]);

  useEffect(() => {
    if (scrolled || !openChange || !changes.some((c) => c.id === openChange)) return;
    document.getElementById(`change-${openChange}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setScrolled(true);
  }, [changes, openChange, scrolled]);

  const refreshAll = () => {
    refreshCats();
    refreshChanges();
  };

  // The same check the server makes before it applies anything, so the form
  // never offers a date the sign-off would then refuse.
  const collisionWarning = useMemo(() => {
    if (!draft?.startDate || !draft.frequency) return null;
    const proposal = {
      code: draft.categoryCode ?? "__NEW__",
      maintenanceFrequency: draft.frequency,
      defaultStartDate: draft.startDate,
    };
    const thisYear = new Date().getFullYear();
    for (const year of [thisYear, thisYear + 1]) {
      const hit = calendarCollision(inUse, proposal, year);
      if (hit) {
        const other = inUse.find((c) => c.code === hit.code)?.label ?? hit.code;
        return `Schedule collision with ${other} on ${hit.dates.map((d) => formatDate(d)).join(", ")}. Weekend dates move to the next free working day, and different categories cannot share a maintenance day.`;
      }
    }
    return null;
  }, [draft?.startDate, draft?.frequency, draft?.categoryCode, inUse]);

  const submit = async () => {
    if (!draft) return;
    if (collisionWarning) {
      toast.error(collisionWarning);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/asset-categories/changes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: draft.kind,
          categoryCode: draft.categoryCode,
          label: draft.label,
          frequency: draft.frequency,
          startDate: draft.startDate || null,
          reason: draft.reason,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(d.error || "Could not propose the change.");
        return;
      }
      toast.success(
        `${d.changeNumber} proposed. It takes effect once the Maintenance Manager and QA/QC Supervisor have signed it.`,
      );
      setDraft(null);
      setOpenChange(d.id);
      refreshAll();
    } finally {
      setSaving(false);
    }
  };

  const intervalChanges =
    draft?.kind === "UPDATE" &&
    draft.previous &&
    (draft.previous.frequency !== draft.frequency || (draft.previous.startDate ?? "") !== (draft.startDate ?? ""));

  return (
    <div className="min-h-screen bg-canvas text-ink-900 flex flex-col font-sans">
      <main className={PAGE_MAIN.register}>
        <PageHeader
          title="Asset Categories"
          subtitle="Each category sets how often its machines are serviced and its annual schedule start date to prevent maintenance collisions."
          backHref="/equipment"
          backLabel="Asset Register"
          actions={
            canPropose || canMove ? (
              <>
                {canMove && (
                  <Button variant="secondary" icon={ArrowRightLeft} onClick={() => setMoving(true)}>
                    Move equipment
                  </Button>
                )}
                {canPropose && (
                  <Button
                    icon={Plus}
                    onClick={() =>
                      setDraft({
                        kind: "CREATE",
                        label: "",
                        frequency: "QUARTERLY",
                        startDate: new Date().toISOString().slice(0, 10),
                        reason: "",
                      })
                    }
                  >
                    Add a category
                  </Button>
                )}
              </>
            ) : undefined
          }
        />

        <MoveEquipmentModal
          open={moving}
          categories={catData?.categories ?? []}
          onClose={() => setMoving(false)}
          onMoved={refreshAll}
        />

        {pending.length > 0 && (
          <div className="rounded-xl border border-warn-500/20 bg-warn-500/5 px-4 py-3 text-sm text-ink-700">
            <span className="font-semibold text-warn-700">
              {pending.length} change{pending.length === 1 ? "" : "s"} awaiting signatures.
            </span>{" "}
            Nothing on the register or the schedule moves until the Maintenance Manager and QA/QC Supervisor
            have both signed.
          </div>
        )}

        {/* ── The categories ───────────────────────────────────────────── */}
        <section className="bg-surface border border-line rounded-xl shadow-card overflow-hidden">
          {loading ? (
            <TableSkeleton rows={6} cols={5} />
          ) : categories.length === 0 ? (
            <EmptyState
              icon={Tags}
              title="No categories yet"
              message="Categories are seeded from the register when the database is updated. Run apply-asset-categories."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-ink-500 text-xs">
                    <th className="py-2.5 px-4 font-medium">Category</th>
                    <th className="py-2.5 px-4 font-medium whitespace-nowrap">Frequency</th>
                    <th className="py-2.5 px-4 font-medium whitespace-nowrap">Annual Start</th>
                    <th className="py-2.5 px-4 font-medium whitespace-nowrap text-right">Machines</th>
                    <th className="py-2.5 px-4 font-medium whitespace-nowrap">Status</th>
                    <th className="py-2.5 px-4 font-medium text-right w-px">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-200">
                  {categories.map((c) => (
                    <tr key={c.code} className={`hover:bg-ink-50 transition-colors ${c.isActive === false ? "text-ink-500" : ""}`}>
                      <td className="py-3 px-4">
                        <Link
                          href={`/asset-categories/${encodeURIComponent(c.code)}`}
                          className="text-left group block"
                        >
                          <p className="font-medium text-ink-900 group-hover:text-brand-600 transition-colors">
                            {c.label}
                          </p>
                          <p className="text-xs text-ink-500">{c.code}</p>
                        </Link>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap text-ink-700">{freq(c.maintenanceFrequency)}</td>
                      <td className="py-3 px-4 whitespace-nowrap text-ink-700">
                        {c.defaultStartDate ? (
                          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-brand-50 border border-brand-200 text-xs text-brand-800 font-medium">
                            <Calendar className="w-3 h-3 text-brand-600 shrink-0" />
                            <span>{formatDate(c.defaultStartDate)}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-ink-400">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap text-right tabular-nums text-ink-700">
                        {c.machineCount}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {c.pendingChange ? (
                          <button
                            onClick={() => setOpenChange(c.pendingChange!.id)}
                            className="text-left"
                          >
                            <Badge className={STATUS_BADGE.PENDING_APPROVAL}>
                              {c.pendingChange.changeNumber} awaiting
                            </Badge>
                          </button>
                        ) : c.isActive === false ? (
                          <Badge className="bg-ink-500/10 text-ink-600 border-ink-500/20">Retired</Badge>
                        ) : (
                          <span className="text-xs text-ink-500">In force</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {/* One way in per row. The eye beside the kebab opened the
                            same page as the kebab's first item, so every row
                            carried two controls for one action. */}
                        <KebabMenu
                          ariaLabel={`Actions for ${c.label}`}
                          items={[
                            {
                              label: "View category page",
                              icon: Eye,
                              href: `/asset-categories/${encodeURIComponent(c.code)}`,
                            },
                            ...(c.pendingChange
                              ? [
                                  {
                                    label: `Open ${c.pendingChange.changeNumber}`,
                                    icon: FileSignature,
                                    onClick: () => setOpenChange(c.pendingChange!.id),
                                  },
                                ]
                              : canPropose && c.isActive === false
                                ? [
                                    {
                                      label: "Bring back into use",
                                      icon: Undo2,
                                      onClick: () => setRetiring({ category: c, kind: "REINSTATE", reason: "" }),
                                    },
                                  ]
                                : canPropose
                                ? [
                                    {
                                      label: "Retire category",
                                      icon: Archive,
                                      onClick: () => setRetiring({ category: c, kind: "RETIRE", reason: "" }),
                                    },
                                    {
                                      label: "Propose a change",
                                      icon: Pencil,
                                      onClick: () =>
                                        setDraft({
                                          kind: "UPDATE",
                                          categoryCode: c.code,
                                          label: c.label,
                                          frequency: c.maintenanceFrequency,
                                          startDate: c.defaultStartDate || "",
                                          reason: "",
                                          machineCount: c.machineCount,
                                          previous: {
                                            label: c.label,
                                            frequency: c.maintenanceFrequency,
                                            startDate: c.defaultStartDate || "",
                                          },
                                        }),
                                    },
                                  ]
                                : []),
                          ]}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── The record of changes ────────────────────────────────────── */}
        <section className="bg-surface border border-line rounded-xl shadow-card overflow-hidden">
          <header className="px-4 py-3 border-b border-line">
            <h2 className="text-sm font-semibold text-ink-900">Changes</h2>
            <p className="text-xs text-ink-500 mt-0.5">
              Every proposal, who asked and why, and who signed it off. Open one to sign it.
            </p>
          </header>
          {changes.length === 0 ? (
            <p className="px-4 py-6 text-sm text-ink-500">No changes have been proposed yet.</p>
          ) : (
            <ul className="divide-y divide-ink-200">
              {changes.map((ch) => {
                const open = openChange === ch.id;
                return (
                  <li key={ch.id} id={`change-${ch.id}`} className="scroll-mt-20">
                    <button
                      onClick={() => {
                        setOpenChange(open ? null : ch.id);
                        if (open) refreshAll();
                      }}
                      className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-ink-50 transition-colors"
                      aria-expanded={open}
                    >
                      {open ? (
                        <ChevronDown className="w-4 h-4 text-ink-400 mt-0.5 shrink-0" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-ink-400 mt-0.5 shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-ink-900">{ch.changeNumber}</span>
                          <Badge className={STATUS_BADGE[ch.status]}>{STATUS_LABEL[ch.status]}</Badge>
                          {ch.status === "PENDING_APPROVAL" && ch.approval && (
                            <span className="text-xs text-ink-500 tabular-nums">
                              {ch.approval.signed}/{ch.approval.total} signed
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-ink-700 mt-1 flex items-center gap-1.5 flex-wrap">
                          {ch.kind === "RETIRE" || ch.kind === "REINSTATE" ? (
                            <>
                              {ch.kind === "RETIRE" ? "Retire" : "Bring back"}{" "}
                              <span className="font-medium">{ch.proposedLabel}</span>
                            </>
                          ) : ch.kind === "CREATE" ? (
                            <>
                              New category <span className="font-medium">{ch.proposedLabel}</span>, serviced{" "}
                              {freq(ch.proposedFrequency).toLowerCase()}
                              {ch.proposedStartDate && (
                                <span className="text-ink-500">
                                  (starts {formatDate(ch.proposedStartDate)})
                                </span>
                              )}
                            </>
                          ) : (
                            <>
                              <span className="font-medium">{ch.previousLabel}</span>
                              {ch.previousFrequency !== ch.proposedFrequency && (
                                <>
                                  <span className="text-ink-500">{freq(ch.previousFrequency)}</span>
                                  <ArrowRight className="w-3.5 h-3.5 text-ink-400" />
                                  <span className="font-medium">{freq(ch.proposedFrequency)}</span>
                                </>
                              )}
                              {ch.previousLabel !== ch.proposedLabel && (
                                <span className="text-ink-500">renamed to {ch.proposedLabel}</span>
                              )}
                              {ch.previousStartDate !== ch.proposedStartDate && (
                                <span className="text-ink-500 text-xs">
                                  · start: {ch.proposedStartDate ? formatDate(ch.proposedStartDate) : "none"}
                                </span>
                              )}
                            </>
                          )}
                        </p>
                        <p className="text-xs text-ink-500 mt-1">
                          {ch.proposedByName ?? "Unknown"} · {formatDate(ch.createdAt)}
                          {ch.status === "APPLIED" &&
                            (ch.kind === "RETIRE" || ch.kind === "REINSTATE"
                              ? ` · applied ${ch.appliedAt ? formatDate(ch.appliedAt) : ""}`
                              : ` · applied ${ch.appliedAt ? formatDate(ch.appliedAt) : ""}, ${ch.machinesAffected ?? 0} machine${ch.machinesAffected === 1 ? "" : "s"}, ${ch.planRowsReplaced ?? 0} plan row${ch.planRowsReplaced === 1 ? "" : "s"} rebuilt`)}
                        </p>
                      </div>
                    </button>
                    {open && (
                      <div className="px-4 pb-4 pl-11 space-y-3">
                        <div className="rounded-lg bg-ink-50 border border-ink-200 px-3 py-2">
                          <p className="text-xs font-medium text-ink-500">Reason</p>
                          <p className="text-sm text-ink-800 mt-0.5 whitespace-pre-line">{ch.reason}</p>
                        </div>
                        <SignoffChain entityType="ASSET_CATEGORY" entityId={ch.id} title="Sign-off" onChange={refreshAll} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>

      {/* ── Retire, or bring back ───────────────────────────────────────── */}
      <Modal
        open={!!retiring}
        onClose={() => setRetiring(null)}
        title={retiring?.kind === "REINSTATE" ? "Bring this category back" : "Retire this category"}
        subtitle={retiring ? `${retiring.category.label} · takes effect once the Maintenance Manager and QA/QC Supervisor sign it` : ""}
      >
        {retiring && (
          <div className="space-y-4">
            {retiring.kind === "RETIRE" ? (
              retiring.category.machineCount > 0 ? (
                <p className="rounded-lg border border-warn-200 bg-warn-50 px-3 py-2 text-sm text-warn-800">
                  {retiring.category.machineCount} machine{retiring.category.machineCount === 1 ? " is" : "s are"} still in
                  this category. Move {retiring.category.machineCount === 1 ? "it" : "them"} to another category first,
                  with Move equipment.
                </p>
              ) : (
                <p className="text-sm text-ink-700">
                  A retired category is no longer offered when a machine is added or moved, and its days on the
                  maintenance calendar become free for other categories. Nothing is deleted: its past PMs, batches,
                  method statement and hazard analysis stay on record, and it can be brought back later.
                </p>
              )
            ) : (
              <p className="text-sm text-ink-700">
                The category is offered again and takes back its days on the maintenance calendar, at{" "}
                {freq(retiring.category.maintenanceFrequency).toLowerCase()}
                {retiring.category.defaultStartDate ? ` from ${formatDate(retiring.category.defaultStartDate)}` : ""}.
              </p>
            )}
            <Field label="Why" htmlFor="retire-reason">
              <textarea
                id="retire-reason"
                rows={3}
                value={retiring.reason}
                onChange={(e) => setRetiring({ ...retiring, reason: e.target.value })}
                placeholder={
                  retiring.kind === "RETIRE"
                    ? "e.g. Its machines were moved to Press / Threading / Drilling / Lathe"
                    : "e.g. New machines of this kind are being commissioned"
                }
                className={FIELD_CLASS}
              />
            </Field>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => setRetiring(null)}>
                Cancel
              </Button>
              <Button
                loading={saving}
                disabled={retiring.kind === "RETIRE" && retiring.category.machineCount > 0}
                onClick={submitRetirement}
              >
                Propose for sign-off
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Propose ─────────────────────────────────────────────────────── */}
      <Modal
        open={!!draft}
        onClose={() => setDraft(null)}
        title={draft?.kind === "CREATE" ? "Add a category" : "Propose a change"}
        subtitle={
          draft?.kind === "UPDATE"
            ? `${draft.previous?.label} · ${draft.machineCount ?? 0} machine${draft.machineCount === 1 ? "" : "s"}`
            : "Takes effect once the Maintenance Manager and QA/QC Supervisor sign it"
        }
      >
        {draft && (
          <div className="space-y-4">
            <Field label="Name" htmlFor="cat-label">
              <input
                id="cat-label"
                value={draft.label}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                placeholder="e.g. Excavation Devices"
                className={FIELD_CLASS}
              />
            </Field>
            <Field label="Frequency" htmlFor="cat-freq">
              <Select
                value={draft.frequency}
                onChange={(v) => setDraft({ ...draft, frequency: v })}
                ariaLabel="Maintenance interval"
                className="w-full"
              >
                {FREQUENCIES.map((f) => (
                  <option key={f} value={f}>
                    {FREQUENCY_LABELS[f]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Annual Schedule Start Date" htmlFor="cat-start-date">
              <DateField
                id="cat-start-date"
                value={draft.startDate}
                onChange={(v) => setDraft({ ...draft, startDate: v })}
              />
              <p className="text-xs text-ink-500 mt-1">
                Staggers when maintenance begins in the annual plan so categories with the same interval (e.g. Quarterly) do not collide. A date that lands on a Saturday or Sunday moves to the next free working day.
              </p>
              {collisionWarning && (
                <div className="rounded-lg border border-danger-500/20 bg-danger-500/10 px-3 py-2 text-xs text-danger-700 flex items-start gap-2 mt-2">
                  <AlertTriangle className="w-4 h-4 text-danger-600 shrink-0 mt-0.5" />
                  <span>{collisionWarning}</span>
                </div>
              )}
            </Field>
            {intervalChanges && (
              <p className="text-xs text-ink-600 rounded-lg border border-info-500/20 bg-info-500/5 px-3 py-2 leading-relaxed">
                Once signed, future planned activities that nobody has started for all {draft.machineCount ?? 0} machine{draft.machineCount === 1 ? "" : "s"} in this category will be rebuilt to align with the new interval and start date; overdue, deferred and started ones stay as they are.
              </p>
            )}
            <Field label="Why" htmlFor="cat-reason">
              <textarea
                id="cat-reason"
                rows={3}
                value={draft.reason}
                onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
                placeholder="What prompted this — an OEM recommendation, a failure pattern, a new class of machine…"
                className={FIELD_CLASS}
              />
            </Field>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => setDraft(null)}>
                Cancel
              </Button>
              <Button loading={saving} disabled={Boolean(collisionWarning)} onClick={submit}>
                Propose for sign-off
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// useSearchParams suspends, so the page needs a boundary or the build cannot
// prerender it.
export default function AssetCategoriesPage() {
  return (
    <Suspense fallback={null}>
      <AssetCategoriesView />
    </Suspense>
  );
}
