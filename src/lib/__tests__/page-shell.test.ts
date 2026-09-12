// src/lib/__tests__/page-shell.test.ts
// Every page is one of three widths, and nothing sets its own.
//
// Before this, how wide a page is, how much air surrounds it and how far apart
// its blocks sit were three decisions being made sixty separate times. The
// measurement was seven paddings, six widths and four vertical rhythms — none
// of it chosen, each page written on a different day taking roughly whatever
// the last one looked like.
//
// The administration module was the clearest symptom and the one a person
// actually noticed: Settings at max-w-5xl, Settings → Users at 6xl, Settings →
// Import at 4xl. Three pages, one module, three widths, and the content jumps
// sideways as you move between them.
//
// A person cannot name that when they see it. They just come away thinking the
// software is careless, which is the expensive kind of wrong.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { PAGE_MAIN } from "@/lib/page-shell";

const APP = join(process.cwd(), "src", "app");

function pages(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) pages(full, out);
    else if (entry === "page.tsx") out.push(full);
  }
  return out;
}

const route = (f: string) =>
  relative(APP, f).split(sep).slice(0, -1).join("/") || "/";

// Pages that own their layout for a reason, each of which is a reason and not
// a shrug.
const EXEMPT: Record<string, string> = {
  login: "a split marketing panel, not an app page",
  "forgot-password": "a single centred card, signed out",
  "reset-password": "a single centred card, signed out",
  "change-password": "a single centred card, signed out",
  "account/confirm-email": "a single centred card, signed out",
  offline: "the offline fallback, no chrome at all",
  "equipment/scan/[assetId]": "the public machine passport, read on a phone at the machine",
  "equipment/qr/[assetId]": "a printed sticker, sized in millimetres not breakpoints",
  "equipment/[assetId]/do": "a single centred prompt",
  "reports/print/[type]": "printed on A4 and measured in millimetres",
  "reports/print/asset-history": "printed on A4 and measured in millimetres",
};

test("no page invents its own width", () => {
  // The specific failure: a page that hardcodes max-w-6xl because it looked
  // about right on the day, which is how six widths happened.
  const offenders: string[] = [];

  for (const file of pages(APP)) {
    const r = route(file);
    if (r === "/" || r in EXEMPT) continue;
    const src = readFileSync(file, "utf8");

    // The page's own container, not a card or a modal inside it. Both shapes
    // are in use: <main> on most pages, a bare <div> in administration.
    const container = src.match(/<(?:main|div) className="([^"]*max-w-[^"]*)"/);
    if (!container) continue;

    const cls = container[1];
    // A centred, padded, full-width container IS the page shell. A narrow
    // max-w on a modal or an empty state is not, and does not match this.
    if (/\bw-full\b/.test(cls) && /\bmx-auto\b/.test(cls) && /\bp-\d/.test(cls)) {
      offenders.push(`${r}: ${cls}`);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `these pages set their own width instead of using PAGE_MAIN:\n  ${offenders.join("\n  ")}`,
  );
});

test("the three widths stay three", () => {
  // Adding a fourth is how six happened the first time. If a page genuinely
  // does not fit register, detail or form, that is a conversation rather than
  // a new constant.
  assert.deepEqual(Object.keys(PAGE_MAIN).sort(), ["detail", "form", "register"]);
});

test("every width carries the same padding and rhythm", () => {
  // Only the max-width may differ between them. Padding and vertical rhythm
  // are not per-page decisions and must not become one by the back door.
  const shapes = Object.values(PAGE_MAIN).map((v) =>
    v.split(" ").filter((c) => !c.startsWith("max-w-")).sort().join(" "),
  );
  assert.equal(new Set(shapes).size, 1, `padding or rhythm differs between widths:\n  ${shapes.join("\n  ")}`);
  for (const v of Object.values(PAGE_MAIN)) {
    assert.match(v, /\bp-6 lg:p-8\b/, `${v} does not carry the standard padding`);
    assert.match(v, /\bspace-y-8\b/, `${v} does not carry the standard rhythm`);
  }
});

test("the administration module is internally consistent", () => {
  // The one a person noticed. Named explicitly so that if these three drift
  // apart again the failure says which module and why it matters.
  const widths = ["settings", "settings/users", "settings/import"].map((r) => {
    const src = readFileSync(join(APP, ...r.split("/"), "page.tsx"), "utf8");
    const m = src.match(/className=\{(?:PAGE_MAIN\.(\w+)|pageMain\("(\w+)")/);
    return { route: r, width: m?.[1] ?? m?.[2] ?? "(hardcoded)" };
  });

  const distinct = new Set(widths.map((w) => w.width));
  assert.equal(
    distinct.size,
    1,
    `administration pages disagree about their width:\n  ${widths
      .map((w) => `${w.route}: ${w.width}`)
      .join("\n  ")}`,
  );
});

test("the exemption list is reasons, not a dumping ground", () => {
  // An exemption with no reason beside it is how a rule stops applying to
  // whatever somebody found inconvenient.
  for (const [r, why] of Object.entries(EXEMPT)) {
    assert.ok(why.length > 12, `${r} is exempt without a real reason`);
  }
  const present = new Set(pages(APP).map(route));
  for (const r of Object.keys(EXEMPT)) {
    assert.ok(present.has(r), `${r} is exempt but no longer exists — drop the exemption`);
  }
});
