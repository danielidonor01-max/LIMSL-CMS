// src/lib/doc-number.ts
// Race-safe document numbering (WO-2026-0031, PTW-2026-0007, …). One atomic
// upsert-increment per call against the doc_counters table — two concurrent
// creates can never draw the same number, and numbers are never reused after a
// deletion (both of which count()/max()-based schemes get wrong). Counters are
// per series-and-year, so each new year naturally starts a fresh sequence.
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export async function nextDocNumber(prefix: string, pad = 4): Promise<string> {
  const series = `${prefix}-${new Date().getFullYear()}`;
  const res = await db.execute(sql`
    INSERT INTO doc_counters (series, value) VALUES (${series}, 1)
    ON CONFLICT (series) DO UPDATE SET value = doc_counters.value + 1
    RETURNING value
  `);
  const n = Number((res as unknown as Array<{ value: number }>)[0]?.value ?? 1);
  return `${series}-${String(n).padStart(pad, "0")}`;
}
