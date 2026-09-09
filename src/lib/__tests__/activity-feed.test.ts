// src/lib/__tests__/activity-feed.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isOperational,
  toActivityLine,
  operationalFeed,
  entityLabel,
  stripTelemetry,
  type AuditRow,
} from "../activity-feed";

const row = (over: Partial<AuditRow> = {}): AuditRow => ({
  id: "a1",
  action: "CREATE",
  entityType: "work_order",
  entityDescription: "WO-2026-0031, Quarterly PM",
  userName: "Daniel Idonor",
  timestamp: "2026-09-09T10:00:00Z",
  ...over,
});

test("the exact developer log the audit found is filtered out", () => {
  const noise = row({
    action: "UPDATE",
    entityType: "settings",
    entityDescription: "Performance indexes applied: 62 ok",
    userName: "Daniel Idonor",
  });
  assert.equal(isOperational(noise), false);
});

test("housekeeping is dropped even when it is not filed under settings", () => {
  assert.equal(isOperational(row({ entityDescription: "Migration applied" })), false);
  assert.equal(isOperational(row({ entityDescription: "Seed users cleared" })), false);
  assert.equal(isOperational(row({ entityType: "api_credential" })), false);
});

test("real work survives the filter", () => {
  assert.equal(isOperational(row()), true);
  assert.equal(isOperational(row({ entityType: "permit", action: "SIGN" })), true);
  assert.equal(isOperational(row({ entityType: "equipment", entityDescription: "Marked broken down" })), true);
});

test("a row reads as a sentence, not as a schema", () => {
  const line = toActivityLine(row());
  assert.equal(line.headline, "Daniel Idonor raised a work order");
  assert.equal(line.detail, "WO-2026-0031, Quarterly PM");
});

test("actions use the word a person would say", () => {
  assert.match(toActivityLine(row({ action: "SIGN", entityType: "permit" })).headline, /signed a permit$/);
  assert.match(toActivityLine(row({ action: "REJECT", entityType: "wms" })).headline, /rejected a method statement$/);
  assert.match(toActivityLine(row({ action: "UPDATE", entityType: "jha" })).headline, /updated a hazard analysis$/);
});

test("signing in does not gain a spurious noun", () => {
  assert.equal(toActivityLine(row({ action: "LOGIN" })).headline, "Daniel Idonor signed in");
});

test("an unattributed row names the system rather than leaving a gap", () => {
  assert.match(toActivityLine(row({ userName: null })).headline, /^The system /);
  assert.match(toActivityLine(row({ userName: "   " })).headline, /^The system /);
});

test("an unknown action or entity degrades to something readable", () => {
  const line = toActivityLine(row({ action: "ARCHIVE", entityType: "some_new_thing" }));
  assert.equal(line.headline, "Daniel Idonor archive a some new thing");
  assert.equal(entityLabel("some_new_thing"), "some new thing");
});

test("an empty description is null rather than an empty line", () => {
  assert.equal(toActivityLine(row({ entityDescription: "" })).detail, null);
  assert.equal(toActivityLine(row({ entityDescription: "   " })).detail, null);
});

test("the feed filters before it caps, so noise cannot crowd out the work", () => {
  const rows = [
    row({ id: "n1", entityType: "settings", entityDescription: "Performance indexes applied: 62 ok" }),
    row({ id: "n2", entityType: "settings", entityDescription: "Performance indexes applied: 61 ok" }),
    row({ id: "w1" }),
    row({ id: "w2" }),
  ];
  const feed = operationalFeed(rows, 2);
  assert.deepEqual(feed.map((f) => f.id), ["w1", "w2"]);
});

test("an empty log produces an empty feed rather than throwing", () => {
  assert.deepEqual(operationalFeed([]), []);
});

test("AI telemetry is trimmed from the summary, not from the audit trail", () => {
  // Verbatim from the re-audit's screenshot of the dashboard.
  const line = toActivityLine(
    row({
      action: "ai_chat",
      entityType: "diagnosis_session",
      entityDescription: "AI chat turn (gemini:gemini-flash-latest) \u00b7 913in/350out \u00b7 6 evidence items",
    }),
  );
  assert.equal(line.headline, "Daniel Idonor ran a diagnosis");
  assert.equal(line.detail, "AI chat turn");
});

test("token counts, evidence counts and model names all go", () => {
  assert.equal(
    stripTelemetry('AI analysis (gemini-2.0), "spindle noise" \u00b7 120in/80out tokens \u00b7 4 evidence items'),
    'AI analysis, "spindle noise"',
  );
});

test("an ordinary description is left exactly as written", () => {
  assert.equal(stripTelemetry("WO-2026-0031, Quarterly PM"), "WO-2026-0031, Quarterly PM");
  // A figure that is not telemetry must survive: 6 evidence items is telemetry,
  // 6 machines is the record.
  assert.equal(stripTelemetry("Marked 6 machines for inspection"), "Marked 6 machines for inspection");
});

test("a description that was only telemetry becomes null rather than an empty line", () => {
  assert.equal(
    toActivityLine(row({ entityDescription: "\u00b7 913in/350out \u00b7 6 evidence items" })).detail,
    null,
  );
});
