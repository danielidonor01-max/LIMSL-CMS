// src/lib/__tests__/design-tokens.test.ts
// Keeps the palette a contract rather than a convention.
//
// Before this, colour was named by pigment in 3,746 places across 93 of 98
// component files. The convention was consistent, which is exactly why nobody
// noticed it was unenforced: it held together on everyone remembering it, and
// changing the accent meant 210 edits and a reviewer's attention. One feature
// written in a hurry with bg-slate-50 puts it back, and nothing would say so.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC = join(process.cwd(), "src");
const CSS = readFileSync(join(SRC, "app", "globals.css"), "utf8");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith(".ts") || full.endsWith(".tsx")) out.push(full);
  }
  return out;
}

const SOURCES = walk(SRC).filter((f) => !f.includes("__tests__") && !f.endsWith(".test.ts"));

const COLOUR_PREFIX =
  "bg|text|border|ring|divide|from|to|via|shadow|outline|accent|caret|fill|stroke|placeholder|decoration";

// The five families that carry meaning in this app, each now owned by a role.
const RETIRED: Record<string, string> = {
  slate: "ink",
  emerald: "brand",
  rose: "danger",
  amber: "warn",
  sky: "info",
};

const ROLES = ["ink", "brand", "danger", "warn", "info"];
const SHADES = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"];

test("no source file names a retired palette directly", () => {
  const pattern = new RegExp(`\\b(${COLOUR_PREFIX})-(${Object.keys(RETIRED).join("|")})-(\\d{2,3})\\b`, "g");
  const offenders: string[] = [];

  for (const file of SOURCES) {
    for (const m of readFileSync(file, "utf8").matchAll(pattern)) {
      const [util, prefix, palette, shade] = m;
      offenders.push(
        `${file.replace(SRC, "src")}: ${util} should be ${prefix}-${RETIRED[palette]}-${shade}`,
      );
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `colour must be named by role, not by pigment:\n${offenders.slice(0, 20).join("\n")}`,
  );
});

test("every role ramp is complete", () => {
  // A half-defined ramp is the dangerous failure. A utility pointing at a token
  // nobody declared emits no CSS rule at all, so the element renders with no
  // colour, the build succeeds and the typecheck passes. Nothing reports it
  // except somebody noticing the page looks slightly wrong.
  const missing: string[] = [];
  for (const role of ROLES) {
    for (const shade of SHADES) {
      if (!CSS.includes(`--color-${role}-${shade}:`)) missing.push(`--color-${role}-${shade}`);
    }
  }
  assert.deepEqual(missing, [], `incomplete ramp, these tokens are used but never defined:\n${missing.join("\n")}`);
});

test("every role token resolves to something", () => {
  // Catches a token declared but left pointing at nothing, e.g. after a reskin
  // half-replaces a ramp.
  const empty = [...CSS.matchAll(/--color-(ink|brand|danger|warn|info)-(\d{2,3}):\s*;/g)].map((m) => m[0]);
  assert.deepEqual(empty, [], `these tokens are declared with no value:\n${empty.join("\n")}`);
});

test("the surface aliases exist, so a page never has to pick a grey", () => {
  for (const token of ["--color-canvas", "--color-surface", "--color-line"]) {
    assert.ok(CSS.includes(`${token}:`), `${token} is missing from the palette contract`);
  }
});

test("every token utility in source points at a declared token", () => {
  // The reverse of the ramp check: catches a typo like text-ink-450, which is a
  // plausible shade that does not exist and would silently render colourless.
  const pattern = new RegExp(`\\b(?:${COLOUR_PREFIX})-(${ROLES.join("|")})-(\\d{2,3})\\b`, "g");
  const bad = new Set<string>();

  for (const file of SOURCES) {
    for (const m of readFileSync(file, "utf8").matchAll(pattern)) {
      if (!CSS.includes(`--color-${m[1]}-${m[2]}:`)) bad.add(`${m[0]} (in ${file.replace(SRC, "src")})`);
    }
  }

  assert.deepEqual([...bad], [], `these utilities reference tokens that do not exist:\n${[...bad].join("\n")}`);
});

test("a checkbox is coloured with accent-, not text-", () => {
  // `text-brand-500` on an <input type="checkbox"> is a Tailwind-forms-plugin
  // idiom, and this project does not load that plugin. Without it the class is
  // inert: the box renders in the browser's default blue while the source reads
  // as though it were brand green. Nothing looks wrong in review, and the tick
  // ends up the one control on the page wearing another product's colour.
  //
  // `accent-brand-600` is the property that actually paints a native control,
  // and is what the permit, checklist and troubleshooting forms already use.
  const offenders: string[] = [];

  for (const file of walk(join(SRC, "app")).concat(walk(join(SRC, "components")))) {
    if (file.includes("__tests__")) continue;
    const src = readFileSync(file, "utf8");
    // Each checkbox input and whatever follows it up to the closing bracket,
    // since className routinely sits several lines below the type attribute.
    for (const m of src.matchAll(/type="checkbox"[\s\S]{0,400}?\/?>/g)) {
      const cls = m[0].match(/className="([^"]*)"/)?.[1] ?? "";
      const inert = cls.match(/\btext-(brand|danger|warn|info|success)-\d{2,3}\b/);
      if (inert) offenders.push(`${file.slice(SRC.length + 1)}: ${inert[0]}`);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `these render the browser's default blue, not the token:\n  ${offenders.join("\n  ")}`,
  );
});
