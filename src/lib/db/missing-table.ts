// src/lib/db/missing-table.ts
// New registers ship before their one-off table script has been run against a
// given database (the scripts are run by hand). Reading a table that is not
// there yet should show an empty register with a setup note, not a 500 that
// takes the whole page down with it.

export const SETUP_MESSAGE =
  "This register needs a one-off database step before it can be used: run src/lib/db/apply-premob-verification.ts.";

export function isMissingTable(err: unknown): boolean {
  // postgres.js puts the SQLSTATE on the error; Drizzle wraps it in `cause`.
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code === "42P01" || e?.cause?.code === "42P01";
}
