// src/lib/diagnostics/retrieval.ts
// Full-text retrieval over document_chunks for the troubleshooting module
// (docs/TROUBLESHOOTING-ENGINE.md §3). Postgres FTS via websearch_to_tsquery —
// tolerant of arbitrary technician input (quotes, dashes, error codes) — ranked
// with ts_rank, snippeted with ts_headline. Plant-wide chunks (equipment_id
// NULL, e.g. the maintenance procedure) surface for every machine.
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export type Passage = {
  id: string;
  sourceType: string;
  sourceLabel: string;
  heading: string | null;
  pageStart: number | null;
  pageEnd: number | null;
  snippet: string; // highlighted terms wrapped in **…**
  rank: number;
};

export async function searchPassages(
  equipmentId: string,
  query: string,
  limit = 5,
): Promise<Passage[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  // websearch_to_tsquery ANDs terms — precise, but a multi-word symptom
  // ("spindle stops burnt smell E-041") often has no single chunk containing
  // every word. Try strict first; fall back to OR for recall.
  const strict = await runSearch(equipmentId, q, limit);
  if (strict.length > 0) return strict;

  const terms = q.split(/\s+/).filter((w) => w.replace(/[^a-zA-Z0-9]/g, "").length > 1);
  if (terms.length < 2) return strict;
  return runSearch(equipmentId, terms.join(" or "), limit);
}

async function runSearch(equipmentId: string, q: string, limit: number): Promise<Passage[]> {
  const rows = (await db.execute(sql`
    SELECT
      dc.id,
      dc.source_type,
      dc.source_label,
      dc.heading,
      dc.page_start,
      dc.page_end,
      ts_rank(to_tsvector('english', dc.content), query) AS rank,
      ts_headline(
        'english', dc.content, query,
        'StartSel=**, StopSel=**, MaxWords=45, MinWords=15, MaxFragments=2, FragmentDelimiter= … '
      ) AS snippet
    FROM document_chunks dc,
         websearch_to_tsquery('english', ${q}) query
    WHERE (dc.equipment_id = ${equipmentId} OR dc.equipment_id IS NULL)
      AND to_tsvector('english', dc.content) @@ query
    ORDER BY rank DESC
    LIMIT ${limit}
  `)) as unknown as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    id: String(r.id),
    sourceType: String(r.source_type),
    sourceLabel: String(r.source_label),
    heading: (r.heading as string) ?? null,
    pageStart: (r.page_start as number) ?? null,
    pageEnd: (r.page_end as number) ?? null,
    snippet: String(r.snippet),
    rank: Number(r.rank),
  }));
}
