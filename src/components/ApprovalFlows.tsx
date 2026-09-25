// src/components/ApprovalFlows.tsx
// Every approval flow you can see, and where each one has got to.
//
// The queue above it is what is waiting on you. This is everything else that
// is moving: the permit waiting on HSE, the method statement waiting on QA/QC,
// the category change the Factory Manager raised. Each row says how far along
// it is and who it is waiting on, so "has that been signed yet" is answered
// without opening five modules or asking around.
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, GitPullRequestArrow } from "lucide-react";
import { useApi } from "@/lib/api-cache";
import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/Badge";
import SegmentedControl from "@/components/SegmentedControl";
import TableSkeleton from "@/components/TableSkeleton";
import EmptyState from "@/components/EmptyState";

type Flow = {
  entityType: string;
  entityId: string;
  kind: string;
  status: "IN_PROGRESS" | "RETURNED" | "COMPLETE";
  signed: number;
  total: number;
  waitingOn: string | null;
  waitingOnPerson: string | null;
  returnedBy: string | null;
  lastActivity: string;
  yours: boolean;
  title: string;
  code: string | null;
  href: string;
};

type Scope = "IN_PROGRESS" | "RETURNED" | "COMPLETE";

const STATUS_BADGE: Record<Scope, string> = {
  IN_PROGRESS: "bg-warn-500/10 text-warn-700 border-warn-500/20",
  RETURNED: "bg-danger-500/10 text-danger-600 border-danger-500/20",
  COMPLETE: "bg-brand-500/10 text-brand-700 border-brand-500/20",
};

export default function ApprovalFlows() {
  const { data, loading } = useApi<{ flows: Flow[] }>("/api/approvals/flows", { flows: [] });
  const flows = data?.flows ?? [];
  const [scope, setScope] = useState<Scope>("IN_PROGRESS");

  const counts = useMemo(
    () => ({
      IN_PROGRESS: flows.filter((f) => f.status === "IN_PROGRESS").length,
      RETURNED: flows.filter((f) => f.status === "RETURNED").length,
      COMPLETE: flows.filter((f) => f.status === "COMPLETE").length,
    }),
    [flows],
  );
  const rows = flows.filter((f) => f.status === scope);

  return (
    <section className="space-y-4" aria-labelledby="flows-heading">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h2 id="flows-heading" className="text-base font-semibold text-ink-900">
            Approval flows
          </h2>
          <p className="text-xs text-ink-500 mt-0.5">
            Everything moving through sign-off that you can open, and who it is waiting on.
          </p>
        </div>
        <SegmentedControl
          ariaLabel="Approval flow status"
          value={scope}
          onChange={setScope}
          options={[
            { value: "IN_PROGRESS", label: "In progress", count: counts.IN_PROGRESS },
            { value: "RETURNED", label: "Returned", count: counts.RETURNED },
            { value: "COMPLETE", label: "Completed", count: counts.COMPLETE },
          ]}
        />
      </div>

      <div className="bg-surface border border-line rounded-xl shadow-card overflow-hidden">
        {loading ? (
          <TableSkeleton rows={4} cols={3} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={GitPullRequestArrow}
            title={
              scope === "IN_PROGRESS"
                ? "Nothing is moving through sign-off"
                : scope === "RETURNED"
                  ? "Nothing has been returned"
                  : "Nothing completed in the last 30 days"
            }
            message={
              scope === "IN_PROGRESS"
                ? "When a document is raised for signature it appears here until every signature is in."
                : scope === "RETURNED"
                  ? "A document sent back for changes shows here with who returned it."
                  : "Completed flows stay here for a month."
            }
          />
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((f) => {
              const pct = f.total ? Math.round((f.signed / f.total) * 100) : 0;
              return (
                <li key={`${f.entityType}:${f.entityId}`}>
                  <Link
                    href={f.href}
                    className="flex items-center gap-4 px-6 py-4 hover:bg-ink-50 transition-colors group"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold tracking-[0.08em] text-ink-500">{f.kind}</span>
                        {f.code && <span className="text-xs text-ink-500">{f.code}</span>}
                        {f.yours && (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full border bg-warn-500/10 text-warn-700 border-warn-500/20">
                            Your signature
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-medium text-ink-900 line-clamp-1">{f.title}</p>
                      <p className="text-xs text-ink-600">
                        {f.status === "IN_PROGRESS" && f.waitingOn && (
                          <>
                            Waiting on <span className="font-medium text-ink-800">{f.waitingOn}</span>
                            {f.waitingOnPerson ? ` (${f.waitingOnPerson})` : ""}
                          </>
                        )}
                        {f.status === "RETURNED" && (
                          <>Returned{f.returnedBy ? ` by ${f.returnedBy}` : ""} for changes</>
                        )}
                        {f.status === "COMPLETE" && <>Fully signed</>}
                        {f.lastActivity && <span className="text-ink-400"> · {formatDate(f.lastActivity)}</span>}
                      </p>
                    </div>

                    {/* How far along, as a number and a bar. */}
                    <div className="shrink-0 w-28 text-right">
                      <Badge className={STATUS_BADGE[f.status]}>
                        {f.signed} of {f.total}
                      </Badge>
                      <div className="mt-2 h-1 rounded-full bg-ink-200 overflow-hidden" aria-hidden="true">
                        <div
                          className={`h-full ${f.status === "RETURNED" ? "bg-danger-500" : "bg-brand-500"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-ink-300 group-hover:text-ink-900 shrink-0" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
