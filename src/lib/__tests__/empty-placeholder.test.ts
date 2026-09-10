// src/lib/__tests__/empty-placeholder.test.ts
// "No value" is an em dash, not a comma.
//
// Thirteen places rendered `", "` where a figure or a date should be: a stray
// comma and a space, which on screen is an almost invisible smudge and on a
// printed ISO evidence register looks like a typo in an audit document. It was
// one encoding accident that turned an em dash into a comma and then got copied
// outward, and by the end one call site had grown a filter to work around the
// sentinel rather than fix it.
//
// The shape this guards is `", "` used as a VALUE, which is the placeholder
// bug. `", "` as a list separator is correct and common, so the two are
// distinguished rather than the string being banned outright.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC = join(process.cwd(), "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith(".ts") || full.endsWith(".tsx")) out.push(full);
  }
  return out;
}

const FILES = walk(SRC).filter((f) => !f.includes("__tests__") && !f.endsWith(".test.ts"));

test("nothing renders a comma where a value should be", () => {
  const offenders: string[] = [];

  // The false branch of a ternary, or a nullish fallback. Both mean "there is
  // no value here", and both used to say it with a comma.
  //   x == null ? ", " : y        x ? y : ", "        x ?? ", "
  const placeholder = /(\?\s*", "\s*:)|(:\s*", "\s*[,;)\n])|(\?\?\s*", ")/;

  for (const f of FILES) {
    readFileSync(f, "utf8")
      .split("\n")
      .forEach((line, i) => {
        // `? ", " : ""` is a list separator: "a, b, c". Not a placeholder.
        if (/\?\s*", "\s*:\s*""/.test(line)) return;
        if (placeholder.test(line)) offenders.push(`${f.replace(SRC, "src")}:${i + 1}`);
      });
  }

  assert.deepEqual(
    offenders,
    [],
    `use an em dash for "no value"; a comma reads as a typo, and on a printed ` +
      `register it reads as a typo in an audit document:\n${offenders.join("\n")}`,
  );
});

test("a viewer has no department rather than a punctuation mark for one", () => {
  // ROLE_DEPARTMENT mapped VIEWER to ", ", so importing a viewer wrote that
  // into their department column and the settings page filtered it back out.
  const roles = readFileSync(join(SRC, "lib", "roles.ts"), "utf8");
  const block = roles.slice(
    roles.indexOf("export const ROLE_DEPARTMENT"),
    roles.indexOf("export const ROLE_RANK"),
  );
  assert.ok(!/VIEWER:/.test(block), "VIEWER is mapped to a department again");
  for (const dept of block.matchAll(/:\s*"([^"]*)"/g)) {
    assert.match(dept[1], /^[A-Z_]+$/, `"${dept[1]}" is not a department name`);
  }
});
