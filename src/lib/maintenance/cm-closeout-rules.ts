// src/lib/maintenance/cm-closeout-rules.ts
// The pure half of cm-closeout.ts, safe to import in the browser.

export type CmRecordFacts = {
  failureMode?: string | null;
  verifiedRootCause?: string | null;
  downStartAt?: string | null;
  downEndAt?: string | null;
};

/** What the record still lacks before signing can start. Empty when complete. */
export function closeOutGaps(r: CmRecordFacts): string[] {
  const gaps: string[] = [];
  if (!String(r.failureMode ?? "").trim()) gaps.push("the failure mode");
  if (!String(r.verifiedRootCause ?? "").trim()) gaps.push("the verified root cause");
  const ds = r.downStartAt ? new Date(r.downStartAt).getTime() : NaN;
  const de = r.downEndAt ? new Date(r.downEndAt).getTime() : NaN;
  if (!Number.isFinite(ds) || !Number.isFinite(de)) gaps.push("when the machine went down and was restored");
  else if (de <= ds) gaps.push("a restored time after the machine went down");
  return gaps;
}

/** "a, b and c" */
export function listOf(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
