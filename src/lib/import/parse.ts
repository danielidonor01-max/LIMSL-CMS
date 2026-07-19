// src/lib/import/parse.ts
// Parses an uploaded register into plain row objects keyed by column header.
// Accepts CSV (via papaparse) and Excel .xlsx/.xls (via exceljs) so an admin can
// upload the workbook they already keep, or a CSV export of it.
import Papa from "papaparse";
import ExcelJS from "exceljs";

export type Row = Record<string, string>;

// Case-insensitive, whitespace-tolerant column lookup. `aliases` lets one logical
// field accept a few header spellings (e.g. "Asset ID" / "Asset Code" / "Tag").
export function field(row: Row, ...aliases: string[]): string {
  const keys = Object.keys(row);
  for (const alias of aliases) {
    const target = alias.toLowerCase().trim();
    const hit = keys.find((k) => k.toLowerCase().trim() === target);
    if (hit && row[hit] != null) return String(row[hit]).trim();
  }
  return "";
}

function cellToString(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    const o = v as { text?: unknown; result?: unknown; hyperlink?: unknown };
    if (o.text != null) return String(o.text);
    if (o.result != null) return String(o.result);
    if (o.hyperlink != null) return String(o.hyperlink);
    return "";
  }
  return String(v);
}

export async function parseSpreadsheet(file: File): Promise<Row[]> {
  const name = (file.name || "").toLowerCase();

  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    const ws = wb.worksheets[0];
    if (!ws) return [];

    const headers: string[] = [];
    const rows: Row[] = [];
    ws.eachRow((row, rowNumber) => {
      const values = row.values as unknown[]; // exceljs arrays are 1-indexed
      if (rowNumber === 1) {
        for (let i = 1; i < values.length; i++) headers[i] = cellToString(values[i]).trim();
        return;
      }
      const obj: Row = {};
      let hasValue = false;
      for (let i = 1; i < headers.length; i++) {
        const h = headers[i];
        if (!h) continue;
        const v = cellToString(values[i]).trim();
        obj[h] = v;
        if (v) hasValue = true;
      }
      if (hasValue) rows.push(obj);
    });
    return rows;
  }

  // CSV / plain text
  const text = await file.text();
  const parsed = Papa.parse<Row>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  return (parsed.data || [])
    .map((r) => {
      const o: Row = {};
      for (const k of Object.keys(r)) o[k] = (r[k] ?? "").toString().trim();
      return o;
    })
    .filter((r) => Object.values(r).some((v) => v));
}

// Build a CSV string from headers + example rows (used for template downloads).
export function toCsv(headers: string[], rows: string[][]): string {
  return Papa.unparse({ fields: headers, data: rows });
}
