// src/app/incidents/page.tsx
// The safety incident and near-miss register.
//
// The headline counts near misses on purpose. A register full of injuries and
// empty of near misses is not a safe workshop, it is a workshop where nobody
// files the warnings, and that is the number an HSE officer should be watching.
"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ChevronRight, Siren, Plus } from "lucide-react";
import { useApi } from "@/lib/api-cache";
import PageHeader from "@/components/PageHeader";
import PageLead from "@/components/PageLead";
import Button from "@/components/Button";
import EmptyState from "@/components/EmptyState";
import TableSkeleton from "@/components/TableSkeleton";
import LoadError from "@/components/LoadError";
import { Badge } from "@/components/Badge";
import { formatDate } from "@/lib/utils";
import {
  INCIDENT_TYPE_LABEL,
  INCIDENT_STATUS_LABEL,
  INCIDENT_STATUS_BADGE,
  isSerious,
} from "@/lib/hse/incidents";

type Incident = {
  id: string;
  incidentNumber: string;
  type: string;
  status: string;
  occurredAt: string;
  location: string | null;
  description: string;
  reportedByName: string | null;
  equipmentName: string | null;
  assetId: string | null;
};

export default function IncidentsPage() {
  const { data: rows, loading, error, refresh } = useApi<Incident[]>("/api/incidents", []);

  const stats = useMemo(() => {
    const list = rows ?? [];
    return {
      total: list.length,
      open: list.filter((r) => r.status !== "CLOSED").length,
      nearMiss: list.filter((r) => r.type === "NEAR_MISS").length,
      serious: list.filter((r) => isSerious(r.type)).length,
    };
  }, [rows]);

  return (
    <div className="min-h-screen bg-canvas text-ink-900 flex flex-col font-sans">
      <main className="flex-1 p-6 lg:p-8 max-w-5xl w-full mx-auto space-y-8">
        <PageHeader
          title="Incidents & near misses"
          subtitle="Every event where somebody was hurt, or nearly was, with its investigation"
          backHref="/"
          backLabel="Dashboard"
          actions={
            <Button href="/incidents/new" icon={Plus}>
              Report an event
            </Button>
          }
        />

        {error ? (
          <LoadError onRetry={refresh} />
        ) : loading ? (
          <div className="bg-surface border border-line rounded-2xl shadow-card overflow-hidden">
            <TableSkeleton rows={4} cols={4} />
          </div>
        ) : (
          <>
            <PageLead
              headingId="incidents-lead"
              headline={
                stats.serious > 0
                  ? `${stats.serious === 1 ? "One event" : `${stats.serious} events`} needs a documented root cause.`
                  : stats.total === 0
                    ? "Nothing has been reported yet."
                    : stats.open > 0
                      ? `${stats.open === 1 ? "One event is" : `${stats.open} events are`} still open.`
                      : "Every reported event is closed."
              }
              supporting={
                stats.total === 0
                  ? "An empty register is not the same as a safe workshop. Near misses are the warnings that arrive before anybody is hurt, and they only help if they are filed."
                  : stats.nearMiss === 0
                    ? "No near misses have been reported. A register holding only injuries usually means the warnings are not being written down."
                    : "Near misses are the cheap warnings. Keep them coming."
              }
              actions={[{ href: "/incidents/new", label: "Report an event" }]}
              figure={{
                label: "Open events",
                value: String(stats.open),
                tone: stats.serious > 0 ? "bad" : stats.open > 0 ? "warn" : "good",
              }}
              stats={[
                { label: "near misses", value: stats.nearMiss },
                { label: "serious", value: stats.serious, tone: "bad" },
                { label: "all time", value: stats.total },
              ]}
            />

            {stats.total === 0 ? (
              <EmptyState
                icon={Siren}
                title="No events reported"
                message="Anyone can report a near miss. It takes three questions and it is the cheapest safety warning there is."
                actionLabel="Report an event"
                actionHref="/incidents/new"
              />
            ) : (
              <div className="bg-surface border border-line rounded-2xl shadow-card overflow-hidden divide-y divide-line">
                {rows!.map((r) => (
                  <Link
                    key={r.id}
                    href={`/incidents/${r.id}`}
                    className="flex items-start justify-between gap-4 px-6 py-4 hover:bg-ink-50 transition-colors group"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-ink-600">
                          {r.incidentNumber}
                        </span>
                        <Badge className={INCIDENT_STATUS_BADGE[r.status] ?? INCIDENT_STATUS_BADGE.REPORTED}>
                          {INCIDENT_STATUS_LABEL[r.status] ?? r.status}
                        </Badge>
                        <span className="text-xs text-ink-500">
                          {INCIDENT_TYPE_LABEL[r.type] ?? r.type}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-ink-900 line-clamp-2">{r.description}</p>
                      <p className="text-xs text-ink-600 tabular-nums">
                        {formatDate(r.occurredAt.slice(0, 10))}
                        {r.location ? ` · ${r.location}` : ""}
                        {r.assetId ? ` · ${r.assetId}` : ""}
                        {r.reportedByName ? ` · reported by ${r.reportedByName}` : ""}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-ink-300 group-hover:text-ink-900 shrink-0 mt-1" />
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
