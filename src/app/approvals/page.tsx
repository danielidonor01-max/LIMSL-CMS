// src/app/approvals/page.tsx
// One prioritized queue for everything waiting on your signature.
//
// Designed strictly around attention management:
// High-priority field blockers (Permits to Work, personal assignments, safety
// incidents) take immediate precedence. Once those are met, operational items
// (Work Orders, JHA) take priority, followed by governance and technical reviews.
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PAGE_MAIN } from "@/lib/page-shell";
import { useSession } from "next-auth/react";
import {
  ChevronRight,
  UserCheck,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Clock,
  ShieldAlert,
  ArrowRight,
  Layers,
  Sparkles,
} from "lucide-react";
import { useApi } from "@/lib/api-cache";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import TableSkeleton from "@/components/TableSkeleton";
import LoadError from "@/components/LoadError";
import Tabs from "@/components/Tabs";
import SegmentedControl from "@/components/SegmentedControl";
import { Badge } from "@/components/Badge";
import { ROLE_LABELS } from "@/lib/roles";
import ApprovalFlows from "@/components/ApprovalFlows";
import MetricPanel from "@/components/MetricPanel";
import type { PriorityTier } from "@/lib/signoff/inbox";

type Item = {
  signoffId: string;
  entityType: string;
  entityId: string;
  stepOrder: number;
  totalSteps?: number;
  role: string;
  roleLabel: string;
  personal: boolean;
  kind: string;
  href: string;
  title: string;
  code: string | null;
  subtitle?: string | null;
  createdAt?: string | null;
  priorityTier: PriorityTier;
};

type ViewTab = "action" | "tracking";
type PriorityFilter = "ALL" | "URGENT" | "OPERATIONAL" | "REVIEW";

export default function ApprovalsPage() {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string })?.role;
  const userName = session?.user?.name ?? "you";

  const { data: items, loading, error, refresh } = useApi<Item[]>("/api/approvals", []);
  const [activeTab, setActiveTab] = useState<ViewTab>("action");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("ALL");

  const count = items?.length ?? 0;

  // Breakdown by priority tiers
  const urgentItems = useMemo(
    () => items?.filter((i) => i.priorityTier === "urgent" || i.personal) ?? [],
    [items],
  );
  const operationalItems = useMemo(
    () => items?.filter((i) => i.priorityTier === "operational" && !i.personal) ?? [],
    [items],
  );
  const reviewItems = useMemo(
    () => items?.filter((i) => i.priorityTier === "review" && !i.personal) ?? [],
    [items],
  );
  const personalCount = useMemo(() => items?.filter((i) => i.personal).length ?? 0, [items]);

  // Filtered rows for display
  const displayedItems = useMemo(() => {
    if (!items) return [];
    if (priorityFilter === "URGENT") return urgentItems;
    if (priorityFilter === "OPERATIONAL") return operationalItems;
    if (priorityFilter === "REVIEW") return reviewItems;
    return items;
  }, [items, priorityFilter, urgentItems, operationalItems, reviewItems]);

  // Current active priority phase
  const activePhase: "urgent" | "operational" | "review" | "clear" = useMemo(() => {
    if (urgentItems.length > 0) return "urgent";
    if (operationalItems.length > 0) return "operational";
    if (reviewItems.length > 0) return "review";
    return "clear";
  }, [urgentItems, operationalItems, reviewItems]);

  return (
    <div className="min-h-screen bg-canvas text-ink-900 flex flex-col font-sans">
      <main className={PAGE_MAIN.detail}>
        <PageHeader
          title="My Approvals"
          subtitle={`Priority inbox · Signing as ${ROLE_LABELS[role ?? ""] ?? "authorized role"}`}
          backHref="/"
          backLabel="Dashboard"
        />

        {/* View Mode Switcher */}
        <div className="mb-6">
          <Tabs
            ariaLabel="Approvals view"
            value={activeTab}
            onChange={(v) => setActiveTab(v as ViewTab)}
            items={[
              {
                value: "action",
                label: "Action required",
                count: count > 0 ? count : undefined,
              },
              {
                value: "tracking",
                label: "Waiting on others",
              },
            ]}
          />
        </div>

        {error ? (
          <LoadError onRetry={refresh} />
        ) : loading ? (
          <div className="bg-surface border border-line rounded-xl shadow-card overflow-hidden p-6 space-y-4">
            <TableSkeleton rows={4} cols={3} />
          </div>
        ) : activeTab === "tracking" ? (
          /* Secondary tracking view */
          <div className="space-y-6">
            <div className="p-4 rounded-xl bg-info-50 border border-info-200 text-info-900 text-xs leading-relaxed flex items-start gap-3">
              <Clock className="w-4 h-4 shrink-0 text-info-600 mt-0.5" />
              <p>
                This tracker shows documents currently progressing through sign-off across other roles.
                Documents requiring your own signature are kept in the <strong>Action required</strong> queue.
              </p>
            </div>
            <ApprovalFlows />
          </div>
        ) : (
          /* Action Required Queue */
          <div className="space-y-6">
            {/* Dynamic Priority Phase Banner */}
            {activePhase === "urgent" && (
              <div className="p-5 rounded-xl bg-danger-500/5 border border-danger-500/20 text-ink-900 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-danger-500 animate-pulse" />
                  <h2 className="text-sm font-semibold text-danger-700 flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4" />
                    Immediate attention required &mdash; {urgentItems.length} floor {urgentItems.length === 1 ? "blocker" : "blockers"}
                  </h2>
                </div>
                <p className="text-xs text-ink-600 leading-relaxed max-w-3xl">
                  Safety permits to work, personal assignments, or safety incidents are holding up maintenance crews.
                  Address these critical items first before reviewing standard work orders or technical documentation.
                </p>
                {urgentItems[0] && (
                  <div className="pt-2">
                    <Link
                      href={urgentItems[0].href}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-danger-700 hover:text-danger-900 transition-colors"
                    >
                      <span>Jump to top blocker: {urgentItems[0].code ?? urgentItems[0].kind}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                )}
              </div>
            )}

            {activePhase === "operational" && (
              <div className="p-5 rounded-xl bg-brand-500/5 border border-brand-500/20 text-ink-900 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-brand-500" />
                  <h2 className="text-sm font-semibold text-brand-700 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" />
                    Safety clearance active &mdash; Next priority: {operationalItems.length} operational {operationalItems.length === 1 ? "clearance" : "clearances"}
                  </h2>
                </div>
                <p className="text-xs text-ink-600 leading-relaxed max-w-3xl">
                  Zero safety or personal blockers are pending. Maintenance work orders and job hazard analyses are ready
                  for your review and operational authorization.
                </p>
              </div>
            )}

            {activePhase === "review" && (
              <div className="p-5 rounded-xl bg-surface border border-line text-ink-900 space-y-2 shadow-card">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-ink-400" />
                  <h2 className="text-sm font-semibold text-ink-800 flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-ink-500" />
                    Floor operations active &mdash; Next priority: {reviewItems.length} technical & governance {reviewItems.length === 1 ? "review" : "reviews"}
                  </h2>
                </div>
                <p className="text-xs text-ink-600 leading-relaxed max-w-3xl">
                  All active field work orders and permits are cleared. Method statements, asset category proposals, and
                  maintenance procedures are ready for your technical review.
                </p>
              </div>
            )}

            {/* Metric Panel (Giov Style) */}
            <MetricPanel
              columns={4}
              label="Approvals overview"
              metrics={[
                {
                  key: "urgent",
                  label: "Urgent & personal",
                  value: String(urgentItems.length),
                  count: urgentItems.length,
                  description: personalCount > 0 ? `${personalCount} in your name` : "Permits & direct assignees",
                  status: urgentItems.length > 0 ? "danger" : "plain",
                },
                {
                  key: "operational",
                  label: "Work orders & JHA",
                  value: String(operationalItems.length),
                  count: operationalItems.length,
                  description: "Operational job approvals",
                  status: "plain",
                },
                {
                  key: "review",
                  label: "Governance reviews",
                  value: String(reviewItems.length),
                  count: reviewItems.length,
                  description: "WMS & procedures",
                  status: "plain",
                },
                {
                  key: "total",
                  label: "Total awaiting you",
                  value: String(count),
                  count: count,
                  description: "Ready for your signature",
                  status: "plain",
                },
              ]}
            />

            {count === 0 ? (
              <div className="bg-surface border border-line rounded-xl shadow-card p-10 text-center space-y-4">
                <div className="w-12 h-12 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-600 flex items-center justify-center mx-auto">
                  <Sparkles className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-semibold text-ink-900">
                    Your approval queue is completely clear, {userName}
                  </h3>
                  <p className="text-xs text-ink-500 max-w-md mx-auto">
                    No safety permits, work orders, or method statements are waiting on your signature.
                    All current operations have been authorized.
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                  <Link
                    href="/schedule"
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-ink-900 hover:bg-ink-800 text-white text-xs font-semibold transition-colors"
                  >
                    <span>View master schedule</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                  <Link
                    href="/equipment"
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white border border-line hover:border-ink-300 text-ink-700 text-xs font-semibold transition-colors"
                  >
                    <span>Equipment registry</span>
                  </Link>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Priority Filter Toolbar */}
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <h3 className="text-sm font-semibold text-ink-900">
                      Pending documents requiring your attention
                    </h3>
                    <p className="text-xs text-ink-500">
                      Organized by operational priority. Address top items first.
                    </p>
                  </div>

                  <SegmentedControl
                    ariaLabel="Approvals priority filter"
                    value={priorityFilter}
                    onChange={(v) => setPriorityFilter(v as PriorityFilter)}
                    options={[
                      { value: "ALL", label: "All priority order", count },
                      ...(urgentItems.length > 0
                        ? [{ value: "URGENT", label: "Urgent & personal", count: urgentItems.length }]
                        : []),
                      ...(operationalItems.length > 0
                        ? [{ value: "OPERATIONAL", label: "Work orders & JHA", count: operationalItems.length }]
                        : []),
                      ...(reviewItems.length > 0
                        ? [{ value: "REVIEW", label: "Governance reviews", count: reviewItems.length }]
                        : []),
                    ]}
                  />
                </div>

                {/* Priority Queue Cards */}
                <div className="space-y-3">
                  {displayedItems.map((item) => {
                    const isUrgent = item.priorityTier === "urgent" || item.personal;
                    const isOperational = item.priorityTier === "operational" && !item.personal;

                    return (
                      <div
                        key={item.signoffId}
                        className={`bg-surface border rounded-xl p-5 shadow-card transition-all hover:border-ink-400/60 flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                          isUrgent
                            ? "border-danger-500/30 ring-1 ring-danger-500/10"
                            : "border-line"
                        }`}
                      >
                        <div className="space-y-2 min-w-0 flex-1">
                          {/* Metadata row */}
                          <div className="flex items-center gap-2 flex-wrap">
                            {/* Priority Badge */}
                            {item.personal ? (
                              <Badge className="bg-warn-500/10 text-warn-800 border-warn-500/30">
                                Assigned in your name
                              </Badge>
                            ) : isUrgent ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-danger-500/10 text-danger-700 border border-danger-500/20">
                                <span className="w-1.5 h-1.5 rounded-full bg-danger-600 animate-pulse" />
                                Urgent &middot; Field blocker
                              </span>
                            ) : isOperational ? (
                              <Badge className="bg-brand-500/10 text-brand-700 border-brand-500/20">
                                Operational clearance
                              </Badge>
                            ) : (
                              <Badge className="bg-ink-100 text-ink-700 border-ink-200">
                                Technical review
                              </Badge>
                            )}

                            {/* Kind */}
                            <span className="text-xs font-medium text-ink-500">
                              {item.kind}
                            </span>

                            {/* Code */}
                            {item.code && (
                              <span className="text-xs font-semibold text-ink-700">
                                {item.code}
                              </span>
                            )}
                          </div>

                          {/* Document Title */}
                          <Link
                            href={item.href}
                            className="block text-base font-semibold text-ink-900 hover:text-brand-700 transition-colors line-clamp-1"
                          >
                            {item.title}
                          </Link>

                          {/* Subtitle / Asset context */}
                          {item.subtitle && (
                            <p className="text-xs text-ink-500 line-clamp-1">
                              {item.subtitle}
                            </p>
                          )}

                          {/* Signoff step & authority details */}
                          <div className="flex items-center gap-3 text-xs text-ink-600 flex-wrap pt-0.5">
                            <span className="inline-flex items-center gap-1 font-medium">
                              <CheckCircle2 className="w-3.5 h-3.5 text-brand-600" />
                              Step {item.stepOrder} of {item.totalSteps ?? 2}: {item.roleLabel}
                            </span>
                            <span className="text-ink-300">&middot;</span>
                            <span className="text-ink-500">
                              Signing role: <span className="font-semibold text-ink-800">{item.role}</span>
                            </span>
                          </div>
                        </div>

                        {/* Direct Action CTA */}
                        <div className="shrink-0 flex items-center md:self-center pt-2 md:pt-0">
                          <Link
                            href={item.href}
                            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-colors shadow-2xs ${
                              isUrgent
                                ? "bg-danger-600 hover:bg-danger-700 text-white"
                                : "bg-ink-900 hover:bg-ink-800 text-white"
                            }`}
                          >
                            <span>Review & sign</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
