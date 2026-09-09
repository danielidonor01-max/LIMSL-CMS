// src/lib/markdown-table.ts
// Pipe-table parsing for the procedure renderer.
//
// The Equipment Maintenance Procedure is a controlled document with revision
// tables in it, and the renderer had no table support, so auditors opening it
// saw raw pipes and dashes down the page. For a compliance document that is not
// a cosmetic bug: the first thing an auditor concludes is that nobody has read
// the page.
//
// Parsed here rather than in the component so the grammar can be tested without
// a DOM, and kept dependency-free so the renderer keeps the property it was
// built for: it can never inject raw HTML.

export type MarkdownTable = {
  header: string[];
  rows: string[][];
  // Revision tables in the real document carry a delimiter row under a row of
  // empty cells. That is a table with no headings, not a table whose headings
  // failed to load, and rendering an empty grey header band would be worse than
  // rendering none.
  hasHeader: boolean;
};

// A cell may contain an escaped pipe (\|), which is not a column break.
export function splitRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells: string[] = [];
  let current = "";
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === "\\" && trimmed[i + 1] === "|") {
      current += "|";
      i++;
      continue;
    }
    if (ch === "|") {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

// The row of dashes that makes the line above it a header: | --- | :--: | ---: |
export function isDelimiterRow(line: string): boolean {
  if (!line.includes("|")) return false;
  const cells = splitRow(line);
  if (cells.length === 0) return false;
  return cells.every((c) => /^:?-{1,}:?$/.test(c));
}

function looksLikeRow(line: string): boolean {
  return line.includes("|") && !isDelimiterRow(line);
}

// Reads a table starting at `start`, or returns null if there isn't one there.
// `next` is the first line index after the table.
export function parseTableAt(
  lines: string[],
  start: number,
): { table: MarkdownTable; next: number } | null {
  const head = lines[start];
  const delim = lines[start + 1];
  if (head === undefined || delim === undefined) return null;
  if (!looksLikeRow(head) || !isDelimiterRow(delim)) return null;

  const header = splitRow(head);
  const rows: string[][] = [];
  let i = start + 2;
  while (i < lines.length && looksLikeRow(lines[i]) && lines[i].trim() !== "") {
    const cells = splitRow(lines[i]);
    // Pad or trim to the header width so a malformed row cannot shift the grid
    // or throw off React's column count.
    const normalised = Array.from({ length: header.length }, (_, c) => cells[c] ?? "");
    rows.push(normalised);
    i++;
  }

  return {
    table: { header, rows, hasHeader: header.some((c) => c !== "") },
    next: i,
  };
}
