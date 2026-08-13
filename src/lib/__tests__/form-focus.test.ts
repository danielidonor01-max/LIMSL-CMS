// src/lib/__tests__/form-focus.test.ts
// Guards the two ways a React form in this app can lose focus after every
// keystroke, which is the same symptom from two different causes and is
// invisible to a typecheck, a build and every other test here.
//
// It happened for real: Modal's focus-management effect listed `onClose` in its
// dependencies, every caller passes `onClose={() => setOpen(false)}` (a new
// function each render), so typing one character tore the effect down and set it
// up again. The teardown restores focus to whatever opened the dialog. Every
// create form in the app is a dialog, so every create form in the app could only
// be filled one character per click.
//
// These are text scans rather than DOM tests because there is no React test
// renderer in this project, and the same approach already guards search
// coverage. A scan that catches the real defect is worth more than a perfect
// test that does not exist.
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

const TSX = walk(SRC);

test("Modal's focus effect does not depend on the onClose prop", () => {
  const modal = readFileSync(join(SRC, "components", "Modal.tsx"), "utf8");

  // The effect that installs focus management must key off `open` alone. Any
  // function prop in there is unstable by construction, because callers write
  // inline arrows, and the effect's teardown moves the caret.
  assert.ok(
    /\}, \[open\]\);/.test(modal),
    "Modal's focus effect must depend on [open] only",
  );
  assert.ok(
    !/\}, \[open, onClose\]\);/.test(modal),
    "onClose is back in Modal's effect dependencies, every keystroke will steal focus again",
  );

  // Reading the handler through a ref is what makes the narrow dependency safe:
  // Escape must still call the CURRENT onClose, not the one from first render.
  assert.ok(
    modal.includes("onCloseRef.current()"),
    "Modal must call onClose through a ref so Escape uses the current handler",
  );
});

test("no component is declared inside another component", () => {
  // A component defined in another component's body is a new type on every
  // render, so React unmounts and remounts its whole subtree. If such a
  // component wraps an input, the input loses focus on every keystroke.
  const nested = /^(\s{2,})(?:const\s+([A-Z][A-Za-z0-9]*)\s*=\s*(?:\([^)]*\)|[A-Za-z0-9_]+)\s*=>|function\s+([A-Z][A-Za-z0-9]*)\s*\()/;

  const offenders: string[] = [];
  for (const file of TSX) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      const m = nested.exec(line);
      if (m) offenders.push(`${file.replace(SRC, "src")}:${i + 1} ${m[2] ?? m[3]}`);
    });
  }

  assert.deepEqual(
    offenders,
    [],
    `these components are declared inside another component and will remount their subtree on every render:\n${offenders.join("\n")}`,
  );
});
