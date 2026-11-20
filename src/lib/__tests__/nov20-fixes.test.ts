import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { CellValue } from "exceljs";
import { dateReadings, resolveChronology } from "@/lib/import/legacy-parse";
import { eligibleForCategoryPm, type BackfillPlanRow } from "@/lib/maintenance/backfill";
import { previewText, renderEmailHtml, renderEmailText } from "@/lib/notifications/email-template";

const TODAY = "2026-11-20";
const stored = (iso: string) => new Date(`${iso}T00:00:00Z`) as unknown as CellValue;

test("a stored date whose day could be a month has two readings; a typed one has one", () => {
  assert.deepEqual(dateReadings(stored("2026-11-04")), ["2026-11-04", "2026-04-11"]);
  assert.deepEqual(dateReadings(stored("2026-01-26")), ["2026-01-26"]);
  assert.deepEqual(dateReadings(stored("2026-05-05")), ["2026-05-05"]);
  assert.deepEqual(dateReadings("13/9/2024" as CellValue), ["2024-09-13"]);
  assert.deepEqual(dateReadings("4/11/2026" as CellValue), ["2026-11-04"]);
  assert.deepEqual(dateReadings(null), []);
});

test("the sheet's date order decides which reading is right", () => {
  // The Sertom plate roller's log as the workbook holds it.
  const sheet = ["2023-12-09", "2024-07-02", "19/6/2024", "25/10/2024", "2026-01-26", "2026-11-04", "2026-12-07", "2026-08-10"].map(
    (v) => dateReadings(/^\d{4}/.test(v) ? stored(v) : (v as CellValue)),
  );
  assert.deepEqual(resolveChronology(sheet, TODAY), [
    "2023-12-09",
    "2024-02-07",
    "2024-06-19",
    "2024-10-25",
    "2026-01-26",
    "2026-04-11",
    "2026-07-12",
    "2026-08-10",
  ]);
});

test("a date after today is never chosen while another reading exists, and order alone changes nothing", () => {
  assert.deepEqual(resolveChronology([dateReadings(stored("2026-12-07"))], TODAY), ["2026-07-12"]);
  const inOrder = [dateReadings(stored("2025-03-04")), dateReadings(stored("2025-06-05")), []];
  assert.deepEqual(resolveChronology(inOrder, TODAY), ["2025-03-04", "2025-06-05", null]);
});

test("a re-import moves an entry imported on the swapped date instead of adding it twice", () => {
  const src = readFileSync("src/lib/import/legacy.ts", "utf8");
  assert.match(src, /existingIds\.get\(dupKey\(equipmentId, row\.asRead, title\)\)/);
  assert.match(src, /set\(\{ occurredAt: dateIso \}\)/);
});

test("the history log is a table in date order with filters", () => {
  const src = readFileSync("src/components/EquipmentLog.tsx", "utf8");
  assert.match(src, /<table/);
  assert.match(src, /aria-sort=/);
  for (const label of ["All types", "All years", "All sources"]) assert.ok(src.includes(label), label);
  const lib = readFileSync("src/lib/equipment-log.ts", "utf8");
  assert.match(lib, /replace\(\/ \\\(backfilled\\\)\$\/, ""\)/);
});

test("a category run takes that category's overdue PMs and nothing else", () => {
  const row = (over: Partial<BackfillPlanRow> = {}): BackfillPlanRow => ({
    id: "r",
    equipmentId: "e",
    category: "CNC_HEAVY",
    plannedDate: "2026-04-14",
    activityType: "PM",
    status: "OVERDUE",
    batchId: null,
    removedAt: null,
    ...over,
  });
  assert.equal(eligibleForCategoryPm(row(), TODAY, "CNC_HEAVY"), true);
  assert.equal(eligibleForCategoryPm(row({ activityType: "INS" }), TODAY, "CNC_HEAVY"), false);
  assert.equal(eligibleForCategoryPm(row({ category: "WELDING" }), TODAY, "CNC_HEAVY"), false);
  assert.equal(eligibleForCategoryPm(row({ status: "SCHEDULED", plannedDate: "2026-11-30" }), TODAY, "CNC_HEAVY"), false);
  assert.equal(eligibleForCategoryPm(row({ batchId: "b" }), TODAY, "CNC_HEAVY"), false);
  const script = readFileSync("src/lib/db/backfill-2026.ts", "utf8");
  assert.doesNotMatch(script, /\(backfilled\)/);
});

test("the email is a table layout with the logo, one button and the address written out", () => {
  const html = renderEmailHtml({
    title: "Permit <PTW-2026-0073> needs your signature",
    body: "Dee Forman asked you to sign.\n\nSee https://limslcms.vercel.app/approvals for the list.",
    link: "https://limslcms.vercel.app/permits/abc?x=1&y=2",
    appUrl: "https://limslcms.vercel.app/",
  });
  assert.match(html, /^<!DOCTYPE html>/);
  assert.match(html, /role="presentation"/);
  assert.match(html, /https:\/\/limslcms\.vercel\.app\/brand\/logo-80\.png/);
  assert.match(html, /Permit &lt;PTW-2026-0073&gt; needs your signature/);
  assert.doesNotMatch(html, /<PTW-2026-0073>/);
  assert.equal(html.match(/Open in LIMSL CMS/g)?.length, 1);
  assert.match(html, /permits\/abc\?x=1&amp;y=2/);
  assert.match(html, /<a href="https:\/\/limslcms\.vercel\.app\/approvals"/);
  assert.doesNotMatch(html, /<style|class=/);
});

test("an email with no link has no button, and the text version says the same thing", () => {
  const html = renderEmailHtml({ title: "Password changed", body: "Your password was changed." });
  assert.doesNotMatch(html, /Open in LIMSL CMS/);
  assert.doesNotMatch(html, /<img/);
  const text = renderEmailText({ title: "T", body: "Body.", link: "https://x.test/a" });
  assert.match(text, /^T\n\nBody\.\n\nOpen in LIMSL CMS: https:\/\/x\.test\/a/);
  assert.equal(previewText("Line one.\n\nhttps://x.test/a  Line two."), "Line one. Line two.");
});
