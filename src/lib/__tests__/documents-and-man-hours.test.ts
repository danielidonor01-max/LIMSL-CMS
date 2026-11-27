// src/lib/__tests__/documents-and-man-hours.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { jobTime, type TimeSession } from "@/lib/maintenance/time-log";
import { DOCUMENT_DELETE_ROLES } from "@/lib/roles";

const s = (userId: string, startedAt: string, endedAt: string | null): TimeSession => ({
  id: Math.random().toString(36),
  userId,
  userName: userId,
  startedAt,
  endedAt,
});

test("man-hours add up everybody's time on every machine", () => {
  const t = jobTime(
    [
      // Two people on machine one for three hours each, one on machine two for one and a half.
      s("ada", "2026-11-26T08:00:00Z", "2026-11-26T11:00:00Z"),
      s("bayo", "2026-11-26T08:00:00Z", "2026-11-26T11:00:00Z"),
      s("ada", "2026-11-27T09:00:00Z", "2026-11-27T10:30:00Z"),
    ],
    "2026-11-27T10:45:00Z",
  );
  assert.equal(t.manHours, 7.5);
  assert.equal(t.people, 2);
  assert.equal(t.startedAt, "2026-11-26T08:00:00Z");
  // Elapsed is the calendar: first clock-on to the last machine finished.
  assert.equal(t.elapsedHours, 26.75);
});

test("a clock still running is not counted, but is reported", () => {
  const t = jobTime([s("ada", "2026-11-26T08:00:00Z", "2026-11-26T09:00:00Z"), s("bayo", "2026-11-26T08:30:00Z", null)], null);
  assert.equal(t.manHours, 1);
  assert.equal(t.running, 1);
});

test("a job still under way has no elapsed time: its last clock-off is a pause", () => {
  const t = jobTime([s("ada", "2026-11-26T08:00:00Z", "2026-11-26T09:00:00Z")], null);
  assert.equal(t.finishedAt, null);
  assert.equal(t.elapsedHours, null);
});

test("no clock-on means no elapsed time, not a made-up one", () => {
  const t = jobTime([], "2026-11-27T10:45:00Z");
  assert.equal(t.manHours, 0);
  assert.equal(t.startedAt, null);
  assert.equal(t.elapsedHours, null);
});

test("deleting a document is gated and audited", () => {
  assert.ok(!DOCUMENT_DELETE_ROLES.includes("TECHNICIAN"));
  assert.ok(!DOCUMENT_DELETE_ROLES.includes("VIEWER"));
  const route = readFileSync("src/app/api/documents/[id]/route.ts", "utf8");
  assert.match(route, /requireRoles\(MAINTENANCE_WRITE_ROLES\)/);
  assert.match(route, /DOCUMENT_DELETE_ROLES\.includes\(gate\.actor\?\.role \?\? ""\) && !ownUpload/);
  assert.match(route, /action: "DELETE"[\s\S]*entityType: "equipment_document"/);
  // Its derived rows go first, or the delete is refused by the foreign keys.
  assert.ok(route.indexOf("delete(documentChunks)") < route.indexOf("delete(equipmentDocuments)"));
  assert.ok(route.indexOf("delete(schematicTiles)") < route.indexOf("delete(equipmentDocuments)"));
});
