import { test } from "node:test";
import assert from "node:assert/strict";
import { toCSV, escapeCell } from "@/lib/export";

// CSV exports carry free text written by users — fault descriptions, audit
// entries, remarks. Excel and Sheets EXECUTE a cell that opens with = + - @,
// so an unescaped export is a code-execution path onto the machine of whoever
// opens it (typically the auditor).
test("formula-leading cells are neutralised", () => {
  assert.equal(escapeCell("=1+1"), "'=1+1");
  assert.equal(escapeCell("+44 800"), "'+44 800");
  assert.equal(escapeCell("-2"), "'-2");
  assert.equal(escapeCell("@SUM(A1)"), "'@SUM(A1)");
  assert.equal(escapeCell("\t=cmd|'/c calc'!A1"), "'\t=cmd|'/c calc'!A1");
});

test("ordinary values are untouched", () => {
  assert.equal(escapeCell("Bearing replaced"), "Bearing replaced");
  assert.equal(escapeCell("LEE/PE/0012"), "LEE/PE/0012");
  assert.equal(escapeCell(42), "42");
  assert.equal(escapeCell(null), "");
  assert.equal(escapeCell(undefined), "");
});

test("quoting still applies, and applies after neutralising", () => {
  assert.equal(escapeCell('say "hi"'), '"say ""hi"""');
  assert.equal(escapeCell("a,b"), '"a,b"');
  assert.equal(escapeCell("=a,b"), `"'=a,b"`);
  assert.equal(escapeCell("line1\nline2"), '"line1\nline2"');
});

test("toCSV emits a header and neutralises every cell", () => {
  const csv = toCSV([{ ref: "NC-2026-0001", note: "=HYPERLINK(\"evil\")" }]);
  const [header, row] = csv.split("\n");
  assert.equal(header, "ref,note");
  assert.ok(row.includes("'=HYPERLINK"), "formula must be neutralised in the body");
});
