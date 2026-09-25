// src/app/settings/categories/page.tsx
// The asset categories, and the one place their maintenance interval changes.
//
// A category's interval is the maintenance regime for every machine in it, and
// the plan is built from it. So nothing here edits a category directly. It
// proposes a change, with a reason; the Maintenance Manager and the QA/QC
// Supervisor sign it; and only then does every machine in the category move to
// the new interval and its future plan get rebuilt. The changes list below is
// the record of that — what was asked, by whom, why, and who agreed.
"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Plus, Pencil, Tags, ChevronDown, ChevronRight, ArrowRight } from "lucide-react";
import { PAGE_MAIN } from "@/lib/page-shell";
import { useApi } from "@/lib/api-cache";
import { formatDate } from "@/lib/utils";
import PageHeader from "@/components/PageHeader";
import Button from "@/components/Button";
import Modal from "@/components/Modal";
import Select from "@/components/Select";
import Field, { FIELD_CLASS } from "@/components/Field";
import { Badge } from "@/components/Badge";
import KebabMenu from "@/components/KebabMenu";
import EmptyState from "@/components/EmptyState";
import TableSkeleton from "@/components/TableSkeleton";
import SignoffChain from "@/components/SignoffChain";
import { ASSET_CATEGORY_ROLES, SETTINGS_WRITE_ROLES } from "@/lib/roles";
import { FREQUENCY_LABELS } from "@/lib/constants";
import { FREQUENCY_MONTHS } from "@/lib/maintenance/plan-generation";

type Category = {
  code: string;
  label: string;
  maintenanceFrequency: string;
  machineCount: number;
  pendingChange: { id: string; changeNumber: string } | null;
};

type Change = {
  id: string;
  changeNumber: string;
  kind: "CREATE" | "UPDATE";
  categoryCode: string;
  proposedLabel: string;
  proposedFrequency: string;
  previousLabel: string | null;
  previousFrequency: string | null;
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
  reason: string;
  machineCount?: number;
  previous?: { label: string; frequency: string };
};

export default function AssetCategoriesPage() {
  const { data: session } = useSession();
  const [mounted, setMounted] = useState(false);
  const role = (session?.user as { role?: string })?.role ?? null;
  useEffect(() => setMounted(true), []);

  const canPropose = mounted && ASSET_CATEGORY_ROLES.includes(role ?? "");
  const isAdmin = mounted && SETTINGS_WRITE_ROLES.includes(role ?? "");

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
  const [openChange, setOpenChange] = useState<string | null>(null);

  const pending = useMemo(() => changes.filter((c) => c.status === "PENDING_APPROVAL"), [changes]);

  const refreshAll = () => {
    refreshCats();
    refreshChanges();
  };

  const submit = async () => {
    if (!draft) return;
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
    draft?.kind === "UPDATE" && draft.previous && draft.previous.frequency !== draft.frequency;

  return (
    <div className="min-h-screen bg-canvas text-ink-900 flex flex-col font-sans">
      <main className={PAGE_MAIN.register}>
        <PageHeader
          title="Asset Categories"
          subtitle="Each category sets how often its machines are serviced. Changes are signed off before the plan moves."
          backHref={isAdmin ? "/settings" : "/approvals"}
          backLabel={isAdmin ? "Settings" : "My Approvals"}
          actions={
            canPropose ? (
              <Button
                icon={Plus}
                onClick={() =>
                  setDraft({ kind: "CREATE", label: "", frequency: "QUARTERLY", reason: "" })
                }
              >
                Add a category
              </Button>
            ) : undefined
          }
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
            <TableSkeleton rows={6} cols={4} />
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
                    <th className="py-2.5 px-4 font-medium whitespace-nowrap">Serviced</th>
                    <th className="py-2.5 px-4 font-medium whitespace-nowrap text-right">Machines</th>
                    <th className="py-2.5 px-4 font-medium whitespace-nowrap">Status</th>
                    <th className="py-2.5 px-4 font-medium text-right w-px">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-200">
                  {categories.map((c) => (
                    <tr key={c.code} className="hover:bg-ink-50 transition-colors">
                      <td className="py-3 px-4">
                        <p className="font-medium text-ink-900">{c.label}</p>
                        <p className="text-xs text-ink-500">{c.code}</p>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap text-ink-700">{freq(c.maintenanceFrequency)}</td>
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
                        ) : (
                          <span className="text-xs text-ink-500">In force</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {canPropose && !c.pendingChange && (
                          <KebabMenu
                            ariaLabel={`Actions for ${c.label}`}
                            items={[
                              {
                                label: "Propose a change",
                                icon: Pencil,
                                onClick: () =>
                                  setDraft({
                                    kind: "UPDATE",
                                    categoryCode: c.code,
                                    label: c.label,
                                    frequency: c.maintenanceFrequency,
                                    reason: "",
                                    machineCount: c.machineCount,
                                    previous: { label: c.label, frequency: c.maintenanceFrequency },
                                  }),
                              },
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
                  <li key={ch.id}>
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
                          {ch.kind === "CREATE" ? (
                            <>
                              New category <span className="font-medium">{ch.proposedLabel}</span>, serviced{" "}
                              {freq(ch.proposedFrequency).toLowerCase()}
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
                            </>
                          )}
                        </p>
                        <p className="text-xs text-ink-500 mt-1">
                          {ch.proposedByName ?? "Unknown"} · {formatDate(ch.createdAt)}
                          {ch.status === "APPLIED" &&
                            ` · applied ${ch.appliedAt ? formatDate(ch.appliedAt) : ""}, ${ch.machinesAffected ?? 0} machine${ch.machinesAffected === 1 ? "" : "s"}, ${ch.planRowsReplaced ?? 0} plan row${ch.planRowsReplaced === 1 ? "" : "s"} rebuilt`}
                        </p>
                      </div>
                    </button>
                    {open && (
                      <div className="px-4 pb-4 pl-11 space-y-3">
                        <div className="rounded-lg bg-ink-50 border border-ink-200 px-3 py-2">
                          <p className="text-xs font-medium text-ink-500">Reason</p>
                          <p className="text-sm text-ink-800 mt-0.5 whitespace-pre-line">{ch.reason}</p>
                        </div>
                        <SignoffChain entityType="ASSET_CATEGORY" entityId={ch.id} title="Sign-off" />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>

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
            <Field label="Serviced" htmlFor="cat-freq">
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
            {intervalChanges && (
              <p className="text-xs text-ink-600 rounded-lg border border-info-500/20 bg-info-500/5 px-3 py-2 leading-relaxed">
                Once signed, all {draft.machineCount ?? 0} machine{draft.machineCount === 1 ? "" : "s"} in this
                category move from {freq(draft.previous?.frequency).toLowerCase()} to{" "}
                {freq(draft.frequency).toLowerCase()}. Their future planned activities that nobody has started are
                rebuilt; overdue, deferred and started ones stay as they are.
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
              <Button loading={saving} onClick={submit}>
                Propose for sign-off
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
