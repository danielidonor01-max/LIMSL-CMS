// src/app/my-tasks/page.tsx
// A technician's own work, in the order they will do it.
//
// The alternative was: open the schedule, filter to your own name, read down 81
// rows for the three that are yours. That is a filter, not a task list, and it
// puts the burden of spotting an overdue job on the person least able to see
// the whole picture.
"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ChevronRight, ClipboardCheck, Lock } from "lucide-react";
import { useApi } from "@/lib/api-cache";
import PageHeader from "@/components/PageHeader";
import PageLead from "@/components/PageLead";
import EmptyState from "@/components/EmptyState";
import TableSkeleton from "@/components/TableSkeleton";
import LoadError from "@/components/LoadError";
import { formatDate } from "@/lib/utils";
import {
  groupTasks,
  headlineFor,
  totalOutstanding,
  BUCKET_LABEL,
  type Bucket,
  type Task,
} from "@/lib/my-tasks";

const ORDER: Bucket[] = ["OVERDUE", "TODAY", "SOON", "LATER", "UNDATED"];

const BUCKET_TONE: Record<Bucket, string> = {
  OVERDUE: "text-danger-600",
  TODAY: "text-ink-900",
  SOON: "text-ink-700",
  LATER: "text-ink-500",
  UNDATED: "text-ink-500",
};

export default function MyTasksPage() {
  const { data, loading, error, refresh } = useApi<{ tasks: Task[]; firstName: string | null }>(
    "/api/my-tasks",
    { tasks: [], firstName: null },
  );

  const today = new Date().toISOString().slice(0, 10);
  const grouped = useMemo(() => groupTasks(data?.tasks ?? [], today), [data, today]);
  const total = totalOutstanding(grouped);

  return (
    <div className="min-h-screen bg-canvas text-ink-900 flex flex-col font-sans">
      <main className="flex-1 p-6 lg:p-8 max-w-5xl w-full mx-auto space-y-8">
        <PageHeader
          title="My work"
          subtitle="The jobs assigned to you, soonest first, with anything overdue at the top"
          backHref="/"
          backLabel="Dashboard"
        />

        {error ? (
          <LoadError onRetry={refresh} />
        ) : loading ? (
          <div className="bg-surface border border-line rounded-xl shadow-card overflow-hidden">
            <TableSkeleton rows={4} cols={3} />
          </div>
        ) : (
          <>
            <PageLead
              headingId="my-tasks-lead"
              headline={headlineFor(grouped, data?.firstName)}
              supporting={
                grouped.OVERDUE.length > 0
                  ? "The oldest is first. A job that has been waiting longest is the one most likely to have been forgotten."
                  : total === 0
                    ? "Nothing is assigned to you at the moment. Your supervisor assigns work orders and scheduled activities."
                    : "Work down the list. Open a job to start it, tick the checklist as you go, and mark it complete."
              }
              actions={total === 0 ? [{ href: "/schedule", label: "Open the schedule" }] : []}
              figure={{
                label: "Assigned to you",
                value: String(total),
                tone: grouped.OVERDUE.length > 0 ? "bad" : grouped.TODAY.length > 0 ? "warn" : "good",
              }}
              stats={[
                { label: "overdue", value: grouped.OVERDUE.length, tone: "bad" },
                { label: "today", value: grouped.TODAY.length, tone: "warn" },
                { label: "this week", value: grouped.SOON.length },
              ]}
            />

            {total === 0 ? (
              <EmptyState
                icon={ClipboardCheck}
                title="No work assigned to you"
                message="Jobs appear here as soon as a supervisor puts your name on a work order or a scheduled activity."
              />
            ) : (
              ORDER.filter((b) => grouped[b].length > 0).map((b) => (
                <section key={b} className="space-y-3">
                  <h2 className={`text-sm font-semibold ${BUCKET_TONE[b]}`}>
                    {BUCKET_LABEL[b]}{" "}
                    <span className="text-ink-400 font-normal tabular-nums">({grouped[b].length})</span>
                  </h2>
                  <div className="bg-surface border border-line rounded-xl shadow-card overflow-hidden divide-y divide-line">
                    {grouped[b].map((t) => (
                      <Link
                        key={`${t.kind}-${t.id}`}
                        href={t.href}
                        className="flex items-start justify-between gap-4 px-6 py-4 hover:bg-ink-50 transition-colors group"
                      >
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            {t.code && (
                              <span className="text-xs font-semibold text-ink-600">{t.code}</span>
                            )}
                            {t.assisting && (
                              <span className="text-xs font-semibold px-2 py-0.5 rounded-full border bg-ink-500/10 text-ink-600 border-ink-500/20">
                                Assisting
                              </span>
                            )}
                          </div>
                          <p className="text-sm font-medium text-ink-900 line-clamp-2">{t.title}</p>
                          <p className="text-xs text-ink-600 tabular-nums">
                            {t.dueDate ? formatDate(t.dueDate) : "No date set"}
                          </p>
                          {/* Blocked work is shown, never filtered out. A
                              technician who cannot see the job waiting on a
                              signature has no way to know to go and chase it. */}
                          {t.blockedReason && (
                            <p className="text-xs text-warn-700 inline-flex items-start gap-1.5 leading-snug">
                              <Lock className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                              {t.blockedReason}
                            </p>
                          )}
                        </div>
                        <ChevronRight className="w-4 h-4 text-ink-300 group-hover:text-ink-900 shrink-0 mt-1" />
                      </Link>
                    ))}
                  </div>
                </section>
              ))
            )}
          </>
        )}
      </main>
    </div>
  );
}
