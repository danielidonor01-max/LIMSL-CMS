// src/components/TroubleshootingTrail.tsx
// The troubleshooting sessions behind one breakdown, on the breakdown record
// (LIMSL, 27 Nov 2026). The latest cause found is handed to the page as a
// suggestion for a blank root cause; the technician's Save is what verifies it.
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Stethoscope } from "lucide-react";
import Button from "@/components/Button";
import { Badge } from "@/components/Badge";
import { formatDate } from "@/lib/utils";
import { isOutcome, OUTCOMES } from "@/lib/maintenance/troubleshooting";

type Session = {
  id: string;
  symptom: string;
  status: string;
  outcome: string | null;
  resolvedCause: string | null;
  resolutionNote: string | null;
  startedByName: string | null;
  createdAt: string;
  closedAt: string | null;
  href: string;
};

const TONE: Record<string, string> = {
  CAUSE_FOUND: "bg-brand-500/10 text-brand-700 border-brand-500/20",
  SPECIALIST: "bg-warn-500/10 text-warn-700 border-warn-500/20",
  OPEN: "bg-info-500/10 text-info-700 border-info-500/20",
};

export default function TroubleshootingTrail({
  correctiveId,
  assetId,
  isClosed,
  canStart,
  onSuggestCause,
}: {
  correctiveId: string;
  assetId: string | null;
  isClosed: boolean;
  canStart: boolean;
  onSuggestCause?: (s: { cause: string; at: string }) => void;
}) {
  const [sessions, setSessions] = useState<Session[] | null>(null);

  useEffect(() => {
    fetch(`/api/troubleshooting?correctiveId=${encodeURIComponent(correctiveId)}`)
      .then((r) => (r.ok ? r.json() : { sessions: [] }))
      .then((d) => setSessions(Array.isArray(d.sessions) ? d.sessions : []))
      .catch(() => setSessions([]));
  }, [correctiveId]);

  const found = (sessions ?? []).find((s) => s.outcome === "CAUSE_FOUND" && s.resolvedCause);
  useEffect(() => {
    if (found?.resolvedCause) onSuggestCause?.({ cause: found.resolvedCause, at: found.closedAt ?? found.createdAt });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [found?.id]);

  const live = (sessions ?? []).find((s) => s.status === "OPEN");
  const key = (assetId ?? "").replaceAll("/", "-");

  return (
    <div className="p-5 bg-surface border border-line rounded-xl shadow-card space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-ink-900 flex items-center gap-2">
          <Stethoscope className="w-4 h-4 text-brand-600" /> Troubleshooting
        </h2>
        {!isClosed && canStart && key && (
          <Button size="sm" variant={live ? "secondary" : "primary"} href={live ? live.href : `/equipment/${key}/troubleshoot?cm=${correctiveId}`}>
            {live ? "Continue" : sessions?.length ? "Troubleshoot again" : "Troubleshoot this breakdown"}
          </Button>
        )}
      </div>
      {sessions === null ? (
        <p className="text-xs text-ink-400">Loading…</p>
      ) : sessions.length === 0 ? (
        <p className="text-xs text-ink-500">Nobody has troubleshot this breakdown in the system yet.</p>
      ) : (
        <ul className="space-y-2">
          {sessions.map((s) => {
            const key2 = s.status === "OPEN" ? "OPEN" : s.outcome ?? "";
            return (
              <li key={s.id} className="p-3 rounded-lg border border-line text-xs space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <Badge className={TONE[key2] ?? "bg-ink-100 text-ink-600 border-ink-200"}>
                    {s.status === "OPEN" ? "In progress" : isOutcome(s.outcome) ? OUTCOMES[s.outcome].label : s.status.toLowerCase()}
                  </Badge>
                  <Link href={s.href} className="font-medium text-brand-700 hover:underline">
                    Open
                  </Link>
                </div>
                {s.resolvedCause && <p className="text-ink-900">Cause: {s.resolvedCause}</p>}
                {!s.resolvedCause && s.resolutionNote && <p className="text-ink-600">{s.resolutionNote}</p>}
                <p className="text-ink-500">
                  {formatDate(s.createdAt)}
                  {s.startedByName ? ` · ${s.startedByName}` : ""}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
