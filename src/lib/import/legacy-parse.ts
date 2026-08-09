// src/lib/import/legacy-parse.ts
// Pure workbook-shape parsers for the three legacy LIMSL registers (no DB
// access, the DB-aware half lives in ./legacy.ts). Each parser tolerates the
// quirks the real files contain: merged cells that repeat values, formula
// cells, d/m/y date strings mixed with Date objects, "N/A"/"Nill" markers, and
// per-sheet layout drift. Anything it cannot resolve becomes a row-level error
// the admin sees in the import preview instead of a guess.
import ExcelJS from "exceljs";

// ── Cell helpers ─────────────────────────────────────────────────────────────

function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    const o = v as { text?: unknown; result?: unknown; richText?: Array<{ text: string }>; error?: unknown };
    if (o.richText) return o.richText.map((r) => r.text).join("").trim();
    if (o.result != null) return cellText(o.result as ExcelJS.CellValue);
    if (o.error != null) return "";
    if (o.text != null) return String(o.text).trim();
    return "";
  }
  return String(v).trim();
}

const at = (ws: ExcelJS.Worksheet, row: number, col: number): string =>
  cellText(ws.getRow(row).getCell(col).value);

// "N/A", "Nill", "-" and friends mean "no value" throughout these workbooks.
const NA = /^(n\/?a|nill?|nil|none|-+)$/i;
const clean = (s: string): string => (NA.test(s.trim()) ? "" : s.trim());

// ── Dates ────────────────────────────────────────────────────────────────────
// The workbooks mix Date objects, formula cells resolving to Dates, Excel date
// serials, and hand-typed d/m/y strings. A date the parser cannot pin to a real
// year is an error, never a guess.

export type ParsedDate = { iso: string | null; error: string | null };

const OK = (iso: string): ParsedDate => ({ iso, error: null });
const BAD = (error: string): ParsedDate => ({ iso: null, error });
const EMPTY: ParsedDate = { iso: null, error: null };

function serialToIso(n: number): string {
  return new Date(Math.round((n - 25569) * 86400000)).toISOString().slice(0, 10);
}

function checkYear(iso: string): ParsedDate {
  const y = Number(iso.slice(0, 4));
  if (y < 2000 || y > 2100) return BAD(`Date "${iso}" is outside a plausible range`);
  return OK(iso);
}

// The calendar date a Date OBJECT represents, without a timezone shift.
// ExcelJS hands back UTC-midnight dates, while Date.parse of a hand-typed
// string ("March 5, 2026") yields LOCAL midnight, reading UTC components off
// the latter loses a day everywhere east of Greenwich (LIMSL runs at UTC+1).
// Whichever midnight it actually sits on is the one that names the day.
function calendarIso(d: Date): string {
  const isUtcMidnight = d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0;
  const y = isUtcMidnight ? d.getUTCFullYear() : d.getFullYear();
  const m = (isUtcMidnight ? d.getUTCMonth() : d.getMonth()) + 1;
  const day = isUtcMidnight ? d.getUTCDate() : d.getDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseLegacyDate(v: ExcelJS.CellValue): ParsedDate {
  if (v == null) return EMPTY;
  if (v instanceof Date) return checkYear(calendarIso(v));
  if (typeof v === "object") {
    const o = v as { result?: unknown; text?: unknown; error?: unknown };
    if (o.result != null) return parseLegacyDate(o.result as ExcelJS.CellValue);
    if (o.error != null) return EMPTY;
    if (o.text != null) return parseLegacyDate(String(o.text));
    return EMPTY;
  }
  if (typeof v === "number") {
    if (v > 36526 && v < 73050) return checkYear(serialToIso(v)); // 2000..2099
    return BAD(`"${v}" is not a recognisable date`);
  }
  const s = String(v).trim();
  if (!s || NA.test(s)) return EMPTY;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return checkYear(s.slice(0, 10));
  const dmY = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
  if (dmY) {
    let d = Number(dmY[1]);
    let m = Number(dmY[2]);
    let y = Number(dmY[3]);
    if (y < 100) y += 2000;
    if (m > 12 && d <= 12) [d, m] = [m, d]; // a hand-typed m/d slip
    if (m < 1 || m > 12 || d < 1 || d > 31) return BAD(`"${s}" is not a valid d/m/y date`);
    return checkYear(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  if (/^\d{1,2}[\/.\-]\d{1,2}$/.test(s)) return BAD(`Date "${s}" has no year`);
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return checkYear(calendarIso(new Date(t)));
  return BAD(`Could not read "${s}" as a date`);
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Loose name matching: "Serton Rolling Machine (10m" (a truncated sheet tab)
// must find "Serton Rolling Machine (10mm - 35mm)".
export const normName = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

export async function loadWorkbook(data: ArrayBuffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data);
  return wb;
}

// ── 1. Equipment/calibration register (LIMS Maintenance Log .xlsm) ──────────

export type LegacyRegisterRow = {
  excelRow: number;
  name: string;
  serviceProvider: string;
  manufacturer: string;
  leeTag: string;
  typeModel: string;
  serialNumber: string;
  location: string;
  calDate: ParsedDate;
  calExpire: ParsedDate;
  pmServiceDate: ParsedDate;
  pmDueDate: ParsedDate;
  remarks: string;
};

export type LegacyRegisterParse = { sheetName: string; rows: LegacyRegisterRow[]; errors: string[] };

export function parseRegisterWorkbook(wb: ExcelJS.Workbook): LegacyRegisterParse {
  const ws =
    wb.worksheets.find((w) => /maintenance\s*log/i.test(w.name) && /database/i.test(w.name)) ??
    wb.worksheets[0];
  if (!ws) return { sheetName: "-", rows: [], errors: ["The workbook has no sheets"] };

  // The sub-header row is the one carrying "Cal. Date"; its group labels
  // (Calibration / Preventive Maintenance) sit on the row above, repeated
  // across each merged band.
  let subRow = 0;
  for (let r = 1; r <= Math.min(ws.rowCount, 15); r++) {
    for (let c = 1; c <= ws.columnCount; c++) {
      if (/^cal\.?\s*date$/i.test(at(ws, r, c))) { subRow = r; break; }
    }
    if (subRow) break;
  }
  if (!subRow) return { sheetName: ws.name, rows: [], errors: [`Could not find the header row (no "Cal. Date" column) on sheet "${ws.name}"`] };
  const groupRow = subRow - 1;

  const cols: Record<string, number> = {};
  const put = (key: string, c: number) => { if (!cols[key]) cols[key] = c; };
  for (let c = 1; c <= ws.columnCount; c++) {
    const sub = at(ws, subRow, c);
    const group = at(ws, groupRow, c);
    if (/^id\.?\s*no/i.test(sub)) put("id", c);
    else if (/^equipment$/i.test(sub)) put("name", c);
    else if (/service\s*provider/i.test(sub)) put("serviceProvider", c);
    else if (/manufacturer/i.test(sub)) put("manufacturer", c);
    else if (/lee\s*tag/i.test(sub)) put("leeTag", c);
    else if (/type\s*\/?\s*model/i.test(sub)) put("typeModel", c);
    else if (/serial/i.test(sub)) put("serialNumber", c);
    else if (/location/i.test(sub)) put("location", c);
    else if (/remark/i.test(sub)) put("remarks", c);
    else if (/calibration/i.test(group) && /^cal/i.test(sub)) put("calDate", c);
    else if (/calibration/i.test(group) && /expire/i.test(sub)) put("calExpire", c);
    else if (/preventive/i.test(group) && /service|start/i.test(sub)) put("pmServiceDate", c);
    else if (/preventive/i.test(group) && /due/i.test(sub)) put("pmDueDate", c);
  }

  const errors: string[] = [];
  for (const need of ["name", "leeTag", "manufacturer"]) {
    if (!cols[need]) errors.push(`Sheet "${ws.name}" is missing the "${need}" column`);
  }
  if (errors.length) return { sheetName: ws.name, rows: [], errors };

  const txt = (r: number, key: string) => (cols[key] ? clean(at(ws, r, cols[key])) : "");
  // Register date cells double as status notes ("UNDER REPAIR", "TBA"): words
  // that fail date parsing mean "no date", they must not sink the whole row.
  const date = (r: number, key: string): ParsedDate => {
    if (!cols[key]) return EMPTY;
    const raw = ws.getRow(r).getCell(cols[key]).value;
    if (typeof raw === "string" && NA.test(raw.trim())) return EMPTY;
    const p = parseLegacyDate(raw);
    if (p.error && typeof raw === "string" && /[a-z]/i.test(raw)) return EMPTY;
    return p;
  };

  const rows: LegacyRegisterRow[] = [];
  for (let r = subRow + 1; r <= ws.rowCount; r++) {
    const name = txt(r, "name");
    if (!name) continue; // filler rows keep a pre-printed serial number but no equipment
    rows.push({
      excelRow: r,
      name,
      serviceProvider: txt(r, "serviceProvider"),
      manufacturer: txt(r, "manufacturer"),
      leeTag: txt(r, "leeTag").toUpperCase(),
      typeModel: txt(r, "typeModel"),
      serialNumber: txt(r, "serialNumber"),
      location: txt(r, "location"),
      calDate: date(r, "calDate"),
      calExpire: date(r, "calExpire"),
      pmServiceDate: date(r, "pmServiceDate"),
      pmDueDate: date(r, "pmDueDate"),
      remarks: txt(r, "remarks"),
    });
  }
  return { sheetName: ws.name, rows, errors };
}

// ── 2. Equipment history log (one sheet per machine) ─────────────────────────

export const HISTORY_TICK_CATEGORY: Record<string, string> = {
  A: "CALIBRATION",
  B: "INSPECTION",
  C: "PM",
  D: "CM",
  E: "TRANSFER",
  F: "ACCIDENT",
  G: "CM",
  H: "OTHER",
};

export function classifyHistoryText(description: string): string {
  const d = description.toLowerCase();
  // Both spellings appear in the hand-typed logs ("preventative" is common).
  if (/preventive|preventative|\bpm\b|servicing/.test(d)) return "PM";
  if (/corrective|broken|repair|fault|fix(ed|ing)?\b|replac/.test(d)) return "CM";
  if (/accident|incident/.test(d)) return "ACCIDENT";
  if (/calibrat/.test(d)) return "CALIBRATION";
  return "NOTE";
}

export type LegacyHistoryRow = {
  excelRow: number;
  date: ParsedDate;
  ticks: string[]; // tick letters (A..H) that are checked
  description: string;
  remark: string;
};

export type LegacyHistorySheet = {
  sheetName: string;
  description: string; // form block: equipment name
  typeModel: string;
  assetCode: string;
  rows: LegacyHistoryRow[];
  errors: string[]; // sheet-level (layout) problems
};

// Form-block values live in a merged band starting at column F; reading H (as
// the physical forms label it) or F yields the same value thanks to the merge.
function formValue(ws: ExcelJS.Worksheet, row: number): string {
  for (const col of [8, 6]) {
    const v = clean(at(ws, row, col));
    if (v && !v.endsWith(":")) return v;
  }
  return "";
}

export function parseHistoryWorkbook(wb: ExcelJS.Workbook): LegacyHistorySheet[] {
  const sheets: LegacyHistorySheet[] = [];
  for (const ws of wb.worksheets) {
    const sheet: LegacyHistorySheet = {
      sheetName: ws.name,
      description: formValue(ws, 6),
      typeModel: formValue(ws, 7),
      assetCode: formValue(ws, 8).toUpperCase(),
      rows: [],
      errors: [],
    };

    // The tick header row spells out the tick letters (B..I hold "A".."H").
    let headerRow = 0;
    for (let r = 8; r <= Math.min(ws.rowCount, 16); r++) {
      if (at(ws, r, 2).toUpperCase() === "A" && at(ws, r, 3).toUpperCase() === "B") { headerRow = r; break; }
    }
    if (!headerRow) {
      sheet.errors.push(`Sheet "${ws.name}": could not find the A-H tick header row`);
      sheets.push(sheet);
      continue;
    }

    const tickCols: Array<{ col: number; letter: string }> = [];
    let descCol = 0;
    let remarkCol = 0;
    for (let c = 2; c <= ws.columnCount; c++) {
      const h = at(ws, headerRow, c).toUpperCase();
      const hAbove = at(ws, headerRow - 1, c).toUpperCase();
      if (/^[A-H]$/.test(h)) tickCols.push({ col: c, letter: h });
      else if (!descCol && (h.includes("DESCRIPTION") || hAbove.includes("DESCRIPTION"))) descCol = c;
      else if (!remarkCol && (h.includes("REMARK") || hAbove.includes("REMARK"))) remarkCol = c;
    }
    if (!descCol) sheet.errors.push(`Sheet "${ws.name}": no DESCRIPTION column in the log table`);

    for (let r = headerRow + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const rawDate = row.getCell(1).value;
      // Every sheet ends with a LEGEND footer block explaining the tick
      // letters, the log table stops there.
      if (/^legend\b/i.test(cellText(rawDate))) break;
      const description = descCol ? clean(at(ws, r, descCol)) : "";
      const remark = remarkCol ? clean(at(ws, r, remarkCol)) : "";
      const ticks = tickCols.filter((t) => row.getCell(t.col).value === true).map((t) => t.letter);
      const hasDate = rawDate != null && cellText(rawDate) !== "";
      // A row with neither a description nor a tick says nothing, including
      // bare pre-filled dates. Skip, don't error.
      if (!description && ticks.length === 0) continue;
      sheet.rows.push({
        excelRow: r,
        date: hasDate ? parseLegacyDate(rawDate) : BAD("Row has no date"),
        ticks,
        description,
        remark,
      });
    }
    sheets.push(sheet);
  }
  return sheets;
}

// ── 3. Annual maintenance master schedule ────────────────────────────────────
// The category-overview sheet maps each category to free-text machine names and
// a frequency; the calendar sheets (annual + Q1-Q4) carry PM/CM marks in
// day-numbered columns whose anchor date sits in row 3 of the same column.

export type LegacyCategoryInfo = {
  excelRow: number;
  sn: string;
  category: string;
  assetNames: string[];
  frequencyRaw: string;
  responsible: string;
};

export type LegacyScheduleMark = {
  sheetName: string;
  excelRow: number;
  sn: string;
  category: string;
  taskDescription: string;
  frequencyRaw: string;
  responsible: string;
  date: ParsedDate;
  typeRaw: string;
};

export type LegacyScheduleParse = {
  categories: LegacyCategoryInfo[];
  marks: LegacyScheduleMark[];
  errors: string[];
};

// Qualifiers in parens ("(2units)", "(Bay 1-3/Dishing Plant, Feeder Pillar)")
// go before splitting, so their commas don't shred the list.
const splitAssetNames = (s: string): string[] =>
  s
    .replace(/\(.*?\)/g, " ")
    .split(/,|;|\n|\band\b|&|\+/i)
    .map((p) => p.trim())
    .filter((p) => p && !NA.test(p));

export function parseScheduleWorkbook(wb: ExcelJS.Workbook): LegacyScheduleParse {
  const out: LegacyScheduleParse = { categories: [], marks: [], errors: [] };

  // Category overview: the sheet whose header row names an "Asset IDs" column.
  for (const ws of wb.worksheets) {
    let headerRow = 0;
    let assetCol = 0;
    for (let r = 1; r <= Math.min(ws.rowCount, 10) && !headerRow; r++) {
      for (let c = 1; c <= ws.columnCount; c++) {
        if (/^asset\s*ids?$/i.test(at(ws, r, c))) { headerRow = r; assetCol = c; break; }
      }
    }
    if (!headerRow) continue;
    let catCol = 0, freqCol = 0, respCol = 0, snCol = 0;
    for (let c = 1; c <= ws.columnCount; c++) {
      const h = at(ws, headerRow, c);
      if (/^s\/?n$/i.test(h)) snCol = snCol || c;
      else if (/category/i.test(h)) catCol = catCol || c;
      else if (/frequency/i.test(h)) freqCol = freqCol || c;
      else if (/responsible/i.test(h)) respCol = respCol || c;
    }
    for (let r = headerRow + 1; r <= ws.rowCount; r++) {
      const category = catCol ? clean(at(ws, r, catCol)) : "";
      const assets = clean(at(ws, r, assetCol));
      if (!category && !assets) continue;
      out.categories.push({
        excelRow: r,
        sn: snCol ? at(ws, r, snCol) : "",
        category,
        assetNames: splitAssetNames(assets),
        frequencyRaw: freqCol ? clean(at(ws, r, freqCol)) : "",
        responsible: respCol ? clean(at(ws, r, respCol)) : "",
      });
    }
    break; // one overview sheet is enough
  }
  if (out.categories.length === 0) {
    out.errors.push('No category-overview sheet found (looked for an "Asset IDs" column)');
  }

  // Calendar sheets: row 5 numbers the day columns, row 3 anchors each column
  // to its quarter (or year) start date.
  for (const ws of wb.worksheets) {
    const headerRow = 5;
    if (ws.rowCount < headerRow + 1) continue;
    const dayCols: Array<{ col: number; day: number }> = [];
    for (let c = 2; c <= ws.columnCount; c++) {
      const v = ws.getRow(headerRow).getCell(c).value;
      const n = typeof v === "number" ? v : typeof v === "object" && v != null && "result" in v ? Number((v as { result?: unknown }).result) : NaN;
      if (Number.isInteger(n) && n >= 1 && n <= 366) dayCols.push({ col: c, day: n });
    }
    if (dayCols.length < 10) continue; // not a calendar sheet

    const anchorFor = (col: number): string | null => {
      for (let c = col; c >= 1; c--) {
        for (const r of [3, 4]) {
          const p = parseLegacyDate(ws.getRow(r).getCell(c).value);
          if (p.iso) return p.iso;
        }
      }
      return null;
    };

    let snCol = 1, catCol = 2, taskCol = 0, freqCol = 0, respCol = 0;
    for (let c = 1; c <= ws.columnCount; c++) {
      const h = at(ws, headerRow, c);
      if (/^s\/?n$/i.test(h)) snCol = c;
      else if (/task/i.test(h)) taskCol = taskCol || c;
      else if (/frequency/i.test(h)) freqCol = freqCol || c;
      else if (/responsible/i.test(h)) respCol = respCol || c;
    }
    const firstDayCol = dayCols[0].col;

    for (let r = headerRow + 1; r <= ws.rowCount; r++) {
      const category = clean(at(ws, r, catCol));
      // Calendar sheets end with a merged "Legend:" band that repeats across
      // every day column, the schedule table stops there.
      if (/^legend\b/i.test(category) || /^legend\b/i.test(at(ws, r, 1))) break;
      if (!category) continue;
      for (const { col, day } of dayCols) {
        if (col <= Math.max(catCol, taskCol, freqCol, respCol) && col < firstDayCol) continue;
        const mark = clean(at(ws, r, col));
        if (!mark) continue;
        const anchor = anchorFor(col);
        out.marks.push({
          sheetName: ws.name,
          excelRow: r,
          sn: at(ws, r, snCol),
          category,
          taskDescription: taskCol ? clean(at(ws, r, taskCol)) : "",
          frequencyRaw: freqCol ? clean(at(ws, r, freqCol)) : "",
          responsible: respCol ? clean(at(ws, r, respCol)) : "",
          date: anchor ? OK(addDays(anchor, day - 1)) : BAD(`Sheet "${ws.name}" has no anchor date in row 3 for column ${col}`),
          typeRaw: mark,
        });
      }
    }
  }

  // The same mark can appear on both the annual calendar and its quarter sheet.
  const seen = new Set<string>();
  out.marks = out.marks.filter((m) => {
    const key = `${normName(m.category)}|${m.date.iso ?? m.sheetName + m.excelRow}|${m.typeRaw.toUpperCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return out;
}
