// src/lib/__tests__/markdown-table.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { splitRow, isDelimiterRow, parseTableAt } from "../markdown-table";

test("a row splits on pipes and trims its cells", () => {
  assert.deepEqual(splitRow("| Rev | Date | Note |"), ["Rev", "Date", "Note"]);
  assert.deepEqual(splitRow("Rev | Date"), ["Rev", "Date"]);
});

test("an escaped pipe is content, not a column break", () => {
  assert.deepEqual(splitRow("| a \\| b | c |"), ["a | b", "c"]);
});

test("empty cells survive as empty strings", () => {
  assert.deepEqual(splitRow("| | | |"), ["", "", ""]);
});

test("delimiter rows are recognised in every alignment form", () => {
  for (const row of ["| --- | --- |", "|---|---|", "| :--- | ---: | :---: |", "| ---------- |"]) {
    assert.equal(isDelimiterRow(row), true, row);
  }
});

test("a normal row is not mistaken for a delimiter", () => {
  assert.equal(isDelimiterRow("| Rev | Date |"), false);
  assert.equal(isDelimiterRow("| 1 | 2 |"), false);
  // A horizontal rule is not a table.
  assert.equal(isDelimiterRow("---"), false);
});

test("the real revision table from the procedure document parses", () => {
  // Verbatim from the page the audit flagged, headings blank and all.
  const lines = [
    "| | | | | | |",
    "| --- | --- | --- | --- | --- | --- |",
    "| 1 | | Issued for Implementation | | | |",
  ];
  const out = parseTableAt(lines, 0);
  assert.ok(out);
  assert.equal(out.table.header.length, 6);
  assert.equal(out.table.hasHeader, false);
  assert.equal(out.table.rows.length, 1);
  assert.deepEqual(out.table.rows[0], ["1", "", "Issued for Implementation", "", "", ""]);
  assert.equal(out.next, 3);
});

test("a table with real headings keeps them", () => {
  const lines = ["| Rev | Date | Change |", "| --- | --- | --- |", "| 0 | 2026-01-04 | First issue |"];
  const out = parseTableAt(lines, 0);
  assert.ok(out);
  assert.equal(out.table.hasHeader, true);
  assert.deepEqual(out.table.header, ["Rev", "Date", "Change"]);
});

test("a short row is padded to the column count rather than shifting the grid", () => {
  const lines = ["| A | B | C |", "| --- | --- | --- |", "| 1 |"];
  const out = parseTableAt(lines, 0);
  assert.ok(out);
  assert.deepEqual(out.table.rows[0], ["1", "", ""]);
});

test("an over-long row is trimmed to the column count", () => {
  const lines = ["| A | B |", "| --- | --- |", "| 1 | 2 | 3 | 4 |"];
  const out = parseTableAt(lines, 0);
  assert.ok(out);
  assert.deepEqual(out.table.rows[0], ["1", "2"]);
});

test("the table ends at the first line that is not a row", () => {
  const lines = ["| A |", "| --- |", "| 1 |", "", "Ordinary paragraph."];
  const out = parseTableAt(lines, 0);
  assert.ok(out);
  assert.equal(out.table.rows.length, 1);
  assert.equal(out.next, 3);
});

test("prose containing a pipe is not turned into a table", () => {
  const lines = ["Use the A | B selector.", "Then continue."];
  assert.equal(parseTableAt(lines, 0), null);
});

test("a header with no delimiter under it is not a table", () => {
  assert.equal(parseTableAt(["| A | B |", "| 1 | 2 |"], 0), null);
});

test("a delimiter row at the very end does not read past the array", () => {
  assert.equal(parseTableAt(["| A |"], 0), null);
  assert.equal(parseTableAt(["| A |", "| --- |"], 0)?.table.rows.length, 0);
});
