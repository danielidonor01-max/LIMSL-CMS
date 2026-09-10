// src/lib/__tests__/button-consistency.test.ts
// One button.
//
// There were twenty-three hand-rolled action buttons and no two agreed. Height
// came as py-2, py-2.5, py-1.5 or min-h-11; size as text-xs or text-sm; weight
// as font-semibold or font-bold; and the shadow as shadow-sm, a tinted
// shadow-md, or nothing at all. Several sat under the 44px touch floor, which
// is not a style question in a workshop where the people pressing them are
// wearing gloves.
//
// This lands after all twenty-three are converted, on purpose. A guard that
// fails the day it arrives is a guard somebody deletes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC = join(process.cwd(), "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith(".tsx")) out.push(full);
  }
  return out;
}

// Button.tsx is where these classes are supposed to live.
const FILES = walk(SRC).filter((f) => !f.includes("__tests__") && !f.endsWith("Button.tsx"));

test("no element is styled as a primary or danger action by hand", () => {
  const offenders: string[] = [];

  for (const f of FILES) {
    readFileSync(f, "utf8")
      .split("\n")
      .forEach((line, i) => {
        if (/bg-(brand|danger)-600\s+hover:bg-(brand|danger)-500/.test(line)) {
          offenders.push(`${f.replace(SRC, "src")}:${i + 1}`);
        }
      });
  }

  assert.deepEqual(
    offenders,
    [],
    `use <Button>; it owns the size scale, the 44px touch floor and the loading state:\n${offenders.join("\n")}`,
  );
});

test("Button still carries the touch floor its callers depend on", () => {
  // The whole reason to centralise was that hand-rolled buttons kept landing
  // under 44px. If the shared one loses it, every caller loses it at once.
  const button = readFileSync(join(SRC, "components", "Button.tsx"), "utf8");
  const sizes = button.slice(button.indexOf("const SIZES"), button.indexOf("const VARIANTS"));
  assert.ok(/md:.*min-h-11/.test(sizes), "Button md size no longer meets the 44px touch floor");
  assert.ok(/lg:.*min-h-11/.test(sizes), "Button lg size no longer meets the 44px touch floor");
});

test("every Button variant is defined, so a typo cannot render an unstyled button", () => {
  const button = readFileSync(join(SRC, "components", "Button.tsx"), "utf8");
  const declared = [...button.matchAll(/^\s{2}(\w+):\s*"/gm)].map((m) => m[1]);
  for (const v of ["primary", "secondary", "danger", "ghost", "subtle", "dark"]) {
    assert.ok(declared.includes(v), `Button variant "${v}" is missing`);
  }
});
