// src/lib/export.ts
// Lightweight client-side CSV export for interoperability with the legacy
// XLSB/XLSM registers the CMS replaces.

// Excel and Sheets execute a cell that opens with = + - @ (or a leading tab /
// carriage return before one). Our exports carry free text written by users, // fault descriptions, audit entries, remarks, so a crafted record could run a
// formula on the auditor's machine that opens the file. Prefixing an apostrophe
// makes the spreadsheet treat it as literal text; the value still reads
// correctly to a human and to any CSV parser.
function neutraliseFormula(s: string): string {
  return /^[\t\r]*[=+\-@]/.test(s) ? `'${s}` : s;
}

export function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = neutraliseFormula(String(value));
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCSV(rows: Record<string, unknown>[], columns?: string[]): string {
  if (!rows.length) return "";
  const cols = columns ?? Object.keys(rows[0]);
  const header = cols.map(escapeCell).join(",");
  const body = rows
    .map((r) => cols.map((c) => escapeCell(r[c])).join(","))
    .join("\n");
  return `${header}\n${body}`;
}

export function downloadCSV(
  filename: string,
  rows: Record<string, unknown>[],
  columns?: string[],
): void {
  const csv = toCSV(rows, columns);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
