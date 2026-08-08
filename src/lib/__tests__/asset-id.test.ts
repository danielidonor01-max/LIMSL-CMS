import { test } from "node:test";
import assert from "node:assert/strict";
import {
  nextAssetId,
  parseAssetId,
  formatAssetId,
  normaliseAssetId,
  prefixForCategory,
  isAssetPrefix,
} from "@/lib/asset-id";

// The finding: the generator only knew how to make PE codes, so a facility
// system could only be added by typing an ID and hoping it was free.
test("each series is numbered independently", () => {
  const existing = ["LEE/PE/0001", "LEE/PE/0002", "LEE/SYS/0001"];
  assert.equal(nextAssetId(existing, "PE"), "LEE/PE/0003");
  assert.equal(nextAssetId(existing, "SYS"), "LEE/SYS/0002");
});

test("a busy PE register never pushes the SYS series forward", () => {
  const existing = Array.from({ length: 40 }, (_, i) => formatAssetId("PE", i + 1));
  assert.equal(nextAssetId(existing, "SYS"), "LEE/SYS/0001");
});

test("numbering starts at 0001 on an empty register and skips junk rows", () => {
  assert.equal(nextAssetId([], "PE"), "LEE/PE/0001");
  assert.equal(nextAssetId([null, undefined, "", "SCRAP-7", "LEE/XX/0009"], "SYS"), "LEE/SYS/0001");
});

test("the next code follows the highest serial, not the row count", () => {
  // Gaps from decommissioned assets must not hand out a used number.
  assert.equal(nextAssetId(["LEE/PE/0001", "LEE/PE/0050"], "PE"), "LEE/PE/0051");
});

// A unique constraint sits on this column, so two spellings of one ID surface
// as an unexplained save failure.
test("differently-spelled IDs canonicalise to the same code", () => {
  for (const raw of ["lee/pe/7", "LEE/PE/7", " LEE/pe/0007 ", "Lee/Pe/00007"]) {
    const r = normaliseAssetId(raw);
    assert.equal(r.ok, true, `${raw} should be accepted`);
    assert.equal(r.ok && r.assetId, "LEE/PE/0007");
  }
});

test("an ID that is not in the scheme is refused with a usable message", () => {
  for (const bad of ["", "PE/0001", "LEE/PE/", "LEE/PE/abc", "LEE/OTHER/0001", "0001"]) {
    const r = normaliseAssetId(bad);
    assert.equal(r.ok, false, `"${bad}" should be refused`);
    assert.equal(r.ok === false && r.error.includes("LEE/PE/0001"), true, "the message must show the shape");
  }
});

test("parse round-trips through format", () => {
  const p = parseAssetId("LEE/SYS/0042");
  assert.deepEqual(p, { prefix: "SYS", serial: 42 });
  assert.equal(formatAssetId(p!.prefix, p!.serial), "LEE/SYS/0042");
  assert.equal(parseAssetId("not an id"), null);
});

// Installations are maintained differently from machines, so the category and
// the prefix must never disagree.
test("installation categories map to SYS, machines to PE", () => {
  for (const c of ["SYSTEM", "ELECTRICAL_PANEL", "EARTHING", "FACILITY_AC", "facility_ac"]) {
    assert.equal(prefixForCategory(c), "SYS", `${c} is an installation`);
  }
  for (const c of ["CNC_HEAVY", "WELDING", "CRANE", "COMPRESSOR", "MEASURING", "OTHER", null]) {
    assert.equal(prefixForCategory(c), "PE", `${String(c)} is production equipment`);
  }
});

test("only the two known prefixes are accepted from a query string", () => {
  assert.equal(isAssetPrefix("PE"), true);
  assert.equal(isAssetPrefix("sys"), true);
  assert.equal(isAssetPrefix("DROP TABLE"), false);
  assert.equal(isAssetPrefix(null), false);
  assert.equal(isAssetPrefix(7), false);
});
