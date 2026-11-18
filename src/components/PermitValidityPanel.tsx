// src/components/PermitValidityPanel.tsx
// A permit's validity and renewal record anywhere the permit is not the page
// (the PM batch, LIMSL 17 Nov 2026), with the one action each person has:
//
//   the permit holder   asks the Factory Manager for today's revalidation
//   the asset holder    signs the day on the grid (PermitRenewalGrid)
//
// `RevalidationAsk` is the holder's button on its own, for the permit page.
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useSession } from "next-auth/react";
import PermitRenewalGrid from "@/components/PermitRenewalGrid";
import Button from "@/components/Button";
import { PERMIT_RENEW_ROLES } from "@/lib/roles";
import type { RenewalDay, RenewalSummary } from "@/lib/hse/permit-validity";
import { isPaperRecord } from "@/lib/maintenance/backfill";

type PermitView = {
  id: string;
  permitNumber: string;
  status: string;
  permitHolderId: string | null;
  permitHolderName: string | null;
  closureNote?: string | null;
  validity: {
    startDate: string;
    days: string[];
    marks: Record<string, RenewalDay>;
    summary: RenewalSummary;
    endedOn?: string | null;
  } | null;
};

const timeOf = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "";

/** The permit holder's request for today's revalidation, or who it waits on. */
export function RevalidationAsk({
  permit,
  onAsked,
}: {
  permit: Pick<PermitView, "id" | "status" | "permitHolderId" | "permitHolderName" | "validity">;
  onAsked: () => void;
}) {
  const { data: session } = useSession();
  const myId = (session?.user as { id?: string } | undefined)?.id ?? null;
  const [asking, setAsking] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const v = permit.validity;
  const today = new Date().toISOString().slice(0, 10);
  if (!mounted || !v || permit.status !== "ACTIVE" || !v.days.includes(today) || today === v.startDate) {
    return null;
  }
  const mark = v.marks[today];
  if (mark && mark.status !== "REQUESTED") return null;

  const ask = async () => {
    setAsking(true);
    try {
      const res = await fetch(`/api/permits/${permit.id}/revalidation-request`, { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(d.error || "Could not send the request.");
        return;
      }
      toast.success("Asked. The Factory Manager has been told to revalidate the permit for today.");
      onAsked();
    } finally {
      setAsking(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warn-200 bg-warn-50 px-4 py-3">
      <p className="text-sm text-warn-900 min-w-0 flex-1">
        {mark?.status === "REQUESTED"
          ? `${mark.requestedByName ?? "The permit holder"} asked for today's revalidation at ${timeOf(mark.requestedAt)}. Waiting on the Factory Manager.`
          : `Today needs revalidating before work starts. ${
              permit.permitHolderId === myId ? "You hold this permit, so you ask." : `${permit.permitHolderName ?? "The permit holder"} asks the Factory Manager.`
            }`}
      </p>
      {!mark && (!permit.permitHolderId || permit.permitHolderId === myId) && (
        <Button size="sm" loading={asking} onClick={ask}>
          Ask the Factory Manager
        </Button>
      )}
    </div>
  );
}

export default function PermitValidityPanel({ permitId }: { permitId: string }) {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role ?? "";
  const [permit, setPermit] = useState<PermitView | null>(null);

  const load = useCallback(() => {
    fetch(`/api/permits/${permitId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setPermit(d && d.id ? d : null))
      .catch(() => setPermit(null));
  }, [permitId]);
  useEffect(load, [load]);

  if (!permit?.validity) return null;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold text-ink-900">Permit validity</h3>
        <Link href={`/permits/${permit.id}`} className="text-sm text-brand-700 hover:underline">
          Open {permit.permitNumber}
        </Link>
      </div>
      <RevalidationAsk permit={permit} onAsked={load} />
      <PermitRenewalGrid
        permitId={permit.id}
        days={permit.validity.days}
        marks={permit.validity.marks}
        summary={permit.validity.summary}
        endedOn={permit.validity.endedOn ?? null}
        onPaper={isPaperRecord(permit.closureNote)}
        canRenew={PERMIT_RENEW_ROLES.includes(role) && permit.status === "ACTIVE"}
        onSaved={load}
      />
    </div>
  );
}
