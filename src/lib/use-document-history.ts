// src/lib/use-document-history.ts
// Loads the signatures on every revision of a controlled document and turns
// them into the revision-history rows for its header. Read-only on purpose:
// see the bulk path in /api/signoffs.
"use client";

import { useEffect, useMemo, useState } from "react";
import { revisionHistory, type DocKind, type HistoryRow, type SignStep } from "@/lib/document-control";

type Rev = {
  id: string;
  revision: number | null;
  changeSummary?: string | null;
  preparedByName?: string | null;
  status?: string | null;
  approvedAt?: string | null;
  effectiveDate?: string | null;
};

export function useDocumentHistory(kind: DocKind, revisions: Rev[], refreshKey: unknown = null) {
  const ids = revisions.map((r) => r.id).join(",");
  const [steps, setSteps] = useState<Record<string, SignStep[]> | null>(null);

  useEffect(() => {
    if (!ids) return;
    let live = true;
    fetch(`/api/signoffs?entityType=${kind}&entityIds=${encodeURIComponent(ids)}`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((d: Record<string, SignStep[]> | null) => live && setSteps(d && typeof d === "object" ? d : {}))
      .catch(() => live && setSteps({}));
    return () => {
      live = false;
    };
  }, [kind, ids, refreshKey]);

  const rows: HistoryRow[] = useMemo(
    () => (steps ? revisionHistory(kind, revisions.map((r) => ({ ...r, steps: steps[r.id] ?? [] }))) : []),
    // revisions is rebuilt by callers on every render; ids carries its identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kind, ids, steps],
  );

  return { rows, loading: !!ids && steps === null };
}
