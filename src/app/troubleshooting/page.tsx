// src/app/troubleshooting/page.tsx
// The Troubleshooting module (LIMSL, 27 Nov 2026). It used to be a page inside
// each machine's digital twin that nobody found. Now it has its own place:
// what is being diagnosed, which breakdowns are still waiting for someone to
// look, every past session with how it ended, and the causes the engine has
// learned. Every session ends on a breakdown, or as "no fault found"; the
// rules are lib/maintenance/troubleshooting.ts.
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Stethoscope, Search, Play } from "lucide-react";
import { PAGE_MAIN } from "@/lib/page-shell";
import { useApi } from "@/lib/api-cache";
import { formatDate, formatDateTime } from "@/lib/utils";
import { TROUBLESHOOT_ROLES } from "@/lib/roles";
import { OUTCOMES, isOutcome } from "@/lib/maintenance/troubleshooting";
import PageHeader from "@/components/PageHeader";
import PageLead from "@/components/PageLead";
import Tabs from "@/components/Tabs";
import Button from "@/components/Button";
import Modal from "@/components/Modal";
import Select from "@/components/Select";
import MachineSelect from "@/components/MachineSelect";
import EmptyState from "@/components/EmptyState";
import TableSkeleton from "@/components/TableSkeleton";
import { Badge } from "@/components/Badge";
import { FIELD_CLASS } from "@/components/Field";

type Session = {
  id: string;
  symptom: string;
  status: string;
  outcome: string | null;
  resolvedCause: string | null;
  resolutionNote: string | null;
  correctiveId: string | null;
  cmrfNumber: string | null;
  startedByName: string | null;
  closedByName: string | null;
  createdAt: string;
  closedAt: string | null;
  updatedAt: string | null;
  assetId: string | null;
  machineName: string | null;
  href: string;
};
type OpenBreakdown = {
  id: string;
  cmrfNumber: string;
  urgency: string;
  faultDescription: string | null;
  reportedDate: string;
  reportedByName: string | null;
  assetId: string | null;
  machineName: string | null;
  diagnosis: "IN_PROGRESS" | "WAITING" | "TO_VERIFY" | "VERIFIED";
  sessionInProgress: boolean;
  awaitingDiagnosis: boolean;
  startHref: string;
};
type KnownCause = {
  id: string;
  symptom: string;
  errorCode: string | null;
  probableCause: string | null;
  resolutionAction: string | null;
  successCount: number | null;
  assetId: string | null;
  machineName: string | null;
};
type Data = {
  summary: { inProgress: number; awaitingDiagnosis: number; avgHoursToCause: number | null; causesFound90d: number };
  sessions: Session[];
  openBreakdowns: OpenBreakdown[];
  knownCauses: KnownCause[];
};

const OUTCOME_TONE: Record<string, string> = {
  CAUSE_FOUND: "bg-brand-500/10 text-brand-700 border-brand-500/20",
  SPECIALIST: "bg-warn-500/10 text-warn-700 border-warn-500/20",
  NO_FAULT: "bg-ink-100 text-ink-600 border-ink-200",
  ABANDONED: "bg-ink-100 text-ink-500 border-ink-200",
  OPEN: "bg-info-500/10 text-info-700 border-info-500/20",
};

function outcomeLabel(s: Session) {
  if (s.status === "OPEN") return "In progress";
  if (isOutcome(s.outcome)) return OUTCOMES[s.outcome].label;
  return s.status === "RESOLVED" ? "Resolved" : "Stopped";
}

// Time to cause reads in hours for a day or less and in days after that.
function asDuration(hours: number | null) {
  if (hours === null) return "-";
  if (hours < 24) return `${Math.round(hours * 10) / 10}h`;
  const days = Math.round((hours / 24) * 10) / 10;
  return `${days} ${days === 1 ? "day" : "days"}`;
}

const assetKey = (assetId: string | null) => (assetId ?? "").replaceAll("/", "-");

export default function TroubleshootingPage() {
  const router = useRouter();
  const { data: authSession } = useSession();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const canStart = mounted && TROUBLESHOOT_ROLES.includes((authSession?.user as { role?: string } | undefined)?.role ?? "");

  const { data, loading } = useApi<Data | null>("/api/troubleshooting", null);
  const [tab, setTab] = useState<"now" | "history" | "known">("now");
  const [query, setQuery] = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState("ALL");

  const [startOpen, setStartOpen] = useState(false);
  const [mode, setMode] = useState<"breakdown" | "machine">("breakdown");
  const [cmId, setCmId] = useState("");
  const [machineId, setMachineId] = useState("");
  const [equipmentList, setEquipmentList] = useState<{ id: string; assetId: string; name: string; category: string }[]>([]);

  useEffect(() => {
    if (!startOpen || equipmentList.length) return;
    fetch("/api/equipment")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => setEquipmentList(Array.isArray(rows) ? rows : []))
      .catch(() => {});
  }, [startOpen, equipmentList.length]);

  const sessions = useMemo(() => data?.sessions ?? [], [data]);
  const open = data?.openBreakdowns ?? [];
  const inProgress = sessions.filter((s) => s.status === "OPEN");
  const waiting = open.filter((b) => b.awaitingDiagnosis);

  const history = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sessions.filter((s) => {
      if (outcomeFilter !== "ALL") {
        const key = s.status === "OPEN" ? "OPEN" : s.outcome ?? (s.status === "RESOLVED" ? "CAUSE_FOUND" : "ABANDONED");
        if (key !== outcomeFilter) return false;
      }
      if (!q) return true;
      return [s.symptom, s.resolvedCause, s.machineName, s.assetId, s.cmrfNumber, s.startedByName]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [sessions, query, outcomeFilter]);

  const start = () => {
    if (mode === "breakdown") {
      const b = open.find((x) => x.id === cmId);
      if (b) router.push(b.startHref);
      return;
    }
    const m = equipmentList.find((e) => e.id === machineId);
    if (m) router.push(`/equipment/${assetKey(m.assetId)}/troubleshoot`);
  };

  const summary = data?.summary;
  const headline = !summary
    ? "Troubleshooting"
    : summary.awaitingDiagnosis > 0
      ? `${summary.awaitingDiagnosis} breakdown${summary.awaitingDiagnosis === 1 ? "" : "s"} waiting for a diagnosis`
      : summary.inProgress > 0
        ? `${summary.inProgress} diagnosis${summary.inProgress === 1 ? "" : "es"} in progress`
        : "Nothing is waiting for a diagnosis";
  const supporting =
    "Every session ends on a breakdown record, or as no fault found. A cause found here is suggested to the breakdown, and the technician verifies it there.";

  return (
    <div className="min-h-screen bg-canvas text-ink-900 flex flex-col font-sans">
      <main className={PAGE_MAIN.register}>
        <PageHeader
          title="Troubleshooting"
          subtitle="Diagnose faults with the engine and the AI assistant, tied to the breakdown record."
          actions={
            canStart ? (
              <Button icon={Play} onClick={() => setStartOpen(true)}>
                Start troubleshooting
              </Button>
            ) : undefined
          }
        />

        {loading && !data ? (
          <TableSkeleton rows={6} />
        ) : (
          <>
            <PageLead
              headingId="ts-lead"
              headline={headline}
              supporting={supporting}
              figure={{
                label: "Average time to cause, 90 days",
                value: asDuration(summary?.avgHoursToCause ?? null),
                tone: "good",
              }}
              stats={[
                { label: "waiting for a diagnosis", value: summary?.awaitingDiagnosis ?? 0, tone: summary?.awaitingDiagnosis ? "warn" : "plain" },
                { label: "in progress", value: summary?.inProgress ?? 0 },
                { label: "causes found, 90 days", value: summary?.causesFound90d ?? 0 },
              ]}
            />

            <Tabs
              ariaLabel="Troubleshooting views"
              value={tab}
              onChange={setTab}
              items={[
                { value: "now", label: "Open now", count: inProgress.length + waiting.length },
                { value: "history", label: "History", count: sessions.length },
                { value: "known", label: "Known causes", count: data?.knownCauses.length ?? 0 },
              ]}
            />

            {tab === "now" && (
              <div className="space-y-6">
                <section className="bg-surface border border-line rounded-xl shadow-card overflow-hidden">
                  <div className="px-5 py-3 border-b border-line">
                    <h2 className="text-sm font-semibold text-ink-900">Open breakdowns</h2>
                    <p className="text-xs text-ink-500 mt-0.5">Every breakdown not yet closed, and whether anyone is diagnosing it.</p>
                  </div>
                  {open.length === 0 ? (
                    <EmptyState icon={Stethoscope} title="No open breakdowns" message="When a fault is reported it appears here until it is closed." />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="border-b border-line text-ink-500 text-xs">
                            <th className="py-2.5 pl-5 pr-3 font-medium">Breakdown</th>
                            <th className="py-2.5 px-3 font-medium">Machine</th>
                            <th className="py-2.5 px-3 font-medium">Fault</th>
                            <th className="py-2.5 px-3 font-medium whitespace-nowrap">Diagnosis</th>
                            <th className="py-2.5 pl-3 pr-5" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-line">
                          {open.map((b) => {
                            const live = inProgress.find((s) => s.correctiveId === b.id);
                            return (
                              <tr key={b.id} className="hover:bg-ink-50 align-top">
                                <td className="py-3 pl-5 pr-3 whitespace-nowrap">
                                  <Link href={`/corrective/${b.id}`} className="font-medium text-ink-900 hover:text-brand-700 hover:underline">
                                    {b.cmrfNumber}
                                  </Link>
                                  <p className="text-xs text-ink-500 mt-0.5">{formatDate(b.reportedDate)} · {b.urgency.toLowerCase()}</p>
                                </td>
                                <td className="py-3 px-3 text-ink-800">{b.machineName ?? b.assetId}</td>
                                <td className="py-3 px-3 text-ink-600 min-w-56">{b.faultDescription || "-"}</td>
                                <td className="py-3 px-3 whitespace-nowrap">
                                  {live ? (
                                    <Badge className={OUTCOME_TONE.OPEN}>In progress</Badge>
                                  ) : b.diagnosis === "WAITING" ? (
                                    <Badge className={OUTCOME_TONE.SPECIALIST}>Waiting</Badge>
                                  ) : b.diagnosis === "TO_VERIFY" ? (
                                    <Badge className={OUTCOME_TONE.OPEN}>Cause found, to verify</Badge>
                                  ) : (
                                    <Badge className={OUTCOME_TONE.CAUSE_FOUND}>Root cause verified</Badge>
                                  )}
                                </td>
                                <td className="py-3 pl-3 pr-5 text-right whitespace-nowrap">
                                  {live ? (
                                    <Button size="sm" variant="secondary" href={live.href}>
                                      Continue
                                    </Button>
                                  ) : canStart && b.awaitingDiagnosis ? (
                                    <Button size="sm" href={b.startHref}>
                                      Diagnose
                                    </Button>
                                  ) : b.diagnosis === "TO_VERIFY" ? (
                                    <Button size="sm" variant="secondary" href={`/corrective/${b.id}`}>
                                      Verify
                                    </Button>
                                  ) : null}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>

                {inProgress.filter((s) => !s.correctiveId).length > 0 && (
                  <section className="bg-surface border border-line rounded-xl shadow-card overflow-hidden">
                    <div className="px-5 py-3 border-b border-line">
                      <h2 className="text-sm font-semibold text-ink-900">Sessions not yet on a breakdown</h2>
                      <p className="text-xs text-ink-500 mt-0.5">Started from a machine. Each ends by attaching to a breakdown, raising one, or no fault found.</p>
                    </div>
                    <ul className="divide-y divide-line">
                      {inProgress
                        .filter((s) => !s.correctiveId)
                        .map((s) => (
                          <li key={s.id} className="px-5 py-3 flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-ink-900">{s.machineName ?? s.assetId}</p>
                              <p className="text-sm text-ink-600 truncate">{s.symptom}</p>
                              <p className="text-xs text-ink-500 mt-0.5">
                                Started {formatDateTime(s.createdAt)}
                                {s.startedByName ? ` by ${s.startedByName}` : ""}
                              </p>
                            </div>
                            <Button size="sm" variant="secondary" href={s.href}>
                              {canStart ? "Continue" : "Open"}
                            </Button>
                          </li>
                        ))}
                    </ul>
                  </section>
                )}
              </div>
            )}

            {tab === "history" && (
              <section className="bg-surface border border-line rounded-xl shadow-card overflow-hidden">
                <div className="px-5 py-3 border-b border-line flex flex-wrap items-center gap-3">
                  <div className="relative flex-1 min-w-56">
                    <Search className="w-4 h-4 text-ink-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search symptom, cause, machine, breakdown or person"
                      className={`${FIELD_CLASS} pl-9`}
                      aria-label="Search sessions"
                    />
                  </div>
                  <Select value={outcomeFilter} onChange={setOutcomeFilter} ariaLabel="Outcome" className="w-48">
                    <option value="ALL">Every outcome</option>
                    <option value="OPEN">In progress</option>
                    <option value="CAUSE_FOUND">Cause found</option>
                    <option value="SPECIALIST">Needs a specialist</option>
                    <option value="NO_FAULT">No fault found</option>
                    <option value="ABANDONED">Stopped</option>
                  </Select>
                </div>
                {history.length === 0 ? (
                  <EmptyState
                    icon={Stethoscope}
                    title={sessions.length ? "No session matches" : "No troubleshooting yet"}
                    message={sessions.length ? "Change the search or the outcome filter." : "Sessions appear here once someone starts one."}
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-line text-ink-500 text-xs">
                          <th className="py-2.5 pl-5 pr-3 font-medium whitespace-nowrap">Started</th>
                          <th className="py-2.5 px-3 font-medium">Machine</th>
                          <th className="py-2.5 px-3 font-medium">Symptom</th>
                          <th className="py-2.5 px-3 font-medium">Outcome</th>
                          <th className="py-2.5 px-3 font-medium whitespace-nowrap">Breakdown</th>
                          <th className="py-2.5 pl-3 pr-5" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {history.map((s) => (
                          <tr key={s.id} className="hover:bg-ink-50 align-top">
                            <td className="py-3 pl-5 pr-3 whitespace-nowrap">
                              <p className="text-ink-900">{formatDate(s.createdAt)}</p>
                              {s.startedByName && <p className="text-xs text-ink-500 mt-0.5">{s.startedByName}</p>}
                            </td>
                            <td className="py-3 px-3 text-ink-800">{s.machineName ?? s.assetId}</td>
                            <td className="py-3 px-3 text-ink-600 min-w-56">
                              <p className="line-clamp-2">{s.symptom}</p>
                              {s.resolvedCause && <p className="text-xs text-ink-900 mt-1">Cause: {s.resolvedCause}</p>}
                              {!s.resolvedCause && s.resolutionNote && <p className="text-xs text-ink-500 mt-1">{s.resolutionNote}</p>}
                            </td>
                            <td className="py-3 px-3 whitespace-nowrap">
                              <Badge className={OUTCOME_TONE[s.status === "OPEN" ? "OPEN" : s.outcome ?? (s.status === "RESOLVED" ? "CAUSE_FOUND" : "ABANDONED")]}>
                                {outcomeLabel(s)}
                              </Badge>
                            </td>
                            <td className="py-3 px-3 whitespace-nowrap">
                              {s.correctiveId && s.cmrfNumber ? (
                                <Link href={`/corrective/${s.correctiveId}`} className="text-brand-700 hover:underline">
                                  {s.cmrfNumber}
                                </Link>
                              ) : (
                                <span className="text-ink-400">Not linked</span>
                              )}
                            </td>
                            <td className="py-3 pl-3 pr-5 text-right whitespace-nowrap">
                              <Link href={s.href} className="text-sm font-medium text-brand-700 hover:underline">
                                Open
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}

            {tab === "known" && (
              <section className="bg-surface border border-line rounded-xl shadow-card overflow-hidden">
                <div className="px-5 py-3 border-b border-line">
                  <p className="text-sm text-ink-600">
                    Causes the engine has learned, per machine. Each confirmed cause makes it rank faster next time.
                  </p>
                </div>
                {(data?.knownCauses.length ?? 0) === 0 ? (
                  <EmptyState icon={Stethoscope} title="Nothing learned yet" message="When a session finds a cause, the engine learns it here." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-line text-ink-500 text-xs">
                          <th className="py-2.5 pl-5 pr-3 font-medium">Machine</th>
                          <th className="py-2.5 px-3 font-medium">Symptom</th>
                          <th className="py-2.5 px-3 font-medium">Cause</th>
                          <th className="py-2.5 px-3 font-medium">Fix</th>
                          <th className="py-2.5 pl-3 pr-5 font-medium text-right whitespace-nowrap">Confirmed</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {data!.knownCauses.map((k) => (
                          <tr key={k.id} className="hover:bg-ink-50 align-top">
                            <td className="py-3 pl-5 pr-3 text-ink-800">{k.machineName ?? k.assetId ?? "-"}</td>
                            <td className="py-3 px-3 text-ink-600">
                              {k.errorCode ? `${k.errorCode} · ` : ""}
                              {k.symptom}
                            </td>
                            <td className="py-3 px-3 text-ink-900">{k.probableCause || "-"}</td>
                            <td className="py-3 px-3 text-ink-600">{k.resolutionAction || "-"}</td>
                            <td className="py-3 pl-3 pr-5 text-right tabular-nums">{k.successCount ?? 0}×</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </main>

      <Modal open={startOpen} onClose={() => setStartOpen(false)} title="Start troubleshooting">
        <div className="space-y-4">
          <fieldset className="space-y-3">
            <legend className="sr-only">What are you troubleshooting?</legend>
            <label className={`block cursor-pointer rounded-lg border p-3 ${mode === "breakdown" ? "border-brand-500 bg-brand-50" : "border-line"}`}>
              <span className="flex items-center gap-2">
                <input type="radio" name="ts-mode" checked={mode === "breakdown"} onChange={() => setMode("breakdown")} className="accent-brand-600" />
                <span className="text-sm font-semibold text-ink-900">An open breakdown</span>
              </span>
              <span className="block text-xs text-ink-500 mt-1 ml-6">The session, and the cause it finds, go on that record.</span>
            </label>
            {mode === "breakdown" &&
              (open.length ? (
                <Select value={cmId} onChange={setCmId} ariaLabel="Open breakdown" className="w-full">
                  <option value="">Choose the breakdown</option>
                  {open.map((b) => (
                    <option key={b.id} value={b.id} data-keywords={[b.assetId, b.machineName].filter(Boolean).join(" ")}>
                      {b.cmrfNumber} · {b.machineName ?? b.assetId} · {(b.faultDescription || "fault reported").slice(0, 60)}
                    </option>
                  ))}
                </Select>
              ) : (
                <p className="text-sm text-ink-500 ml-6">No breakdown is open. Choose a machine instead.</p>
              ))}

            <label className={`block cursor-pointer rounded-lg border p-3 ${mode === "machine" ? "border-brand-500 bg-brand-50" : "border-line"}`}>
              <span className="flex items-center gap-2">
                <input type="radio" name="ts-mode" checked={mode === "machine"} onChange={() => setMode("machine")} className="accent-brand-600" />
                <span className="text-sm font-semibold text-ink-900">Something&apos;s wrong with a machine</span>
              </span>
              <span className="block text-xs text-ink-500 mt-1 ml-6">
                For a fault nobody has reported yet. If you find a cause, you attach it to a breakdown or raise one at the end.
              </span>
            </label>
            {mode === "machine" && (
              <MachineSelect label="Machine" value={machineId} onChange={setMachineId} equipmentList={equipmentList} />
            )}
          </fieldset>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setStartOpen(false)}>
              Cancel
            </Button>
            <Button icon={Play} disabled={mode === "breakdown" ? !cmId : !machineId} onClick={start}>
              Start
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
