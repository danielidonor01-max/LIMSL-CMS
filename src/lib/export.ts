// src/lib/export.ts
// Lightweight client-side CSV export for interoperability with the legacy
// XLSB/XLSM registers the CMS replaces.

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
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
