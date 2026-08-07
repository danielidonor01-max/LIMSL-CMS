// src/app/api/audit/route.ts
// The retrieval surface for the audit trail (ISO 9001 7.5.3.2). A trail that can
// only return its newest 100 rows is not retrievable evidence — an auditor asking
// "every approval on LEE/PE/0012 in FY2024" must get an answer, and a file they
// can take away. Hence the filters below plus `format=csv`.
//
// Backward compatibility: with no query params this still returns a bare JSON
// array of the newest 100 entries, which is what the dashboard activity feed
// consumes. Paging metadata rides on response headers, not in the body.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/db/schema";
import { and, count, desc, eq, gte, ilike, lte, type SQL } from "drizzle-orm";
import { isoSeconds } from "@/lib/utils";
import { toCSV } from "@/lib/export";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
// An export is a different act from a page fetch: the auditor wants the whole
// filtered set, not a screen of it. Still bounded, so a filterless export can
// never try to stream the entire table through a lambda.
const CSV_MAX_ROWS = 5000;

const CSV_COLUMNS = [
  "Timestamp",
  "Action",
  "Entity Type",
  "Entity ID",
  "Description",
  "User",
  "User ID",
  "IP Address",
  "Changes",
  "Record ID",
];

// Timestamps are stored as second-precision ISO text, so a lexicographic
// comparison is a chronological one — provided both sides are in that exact
// format. A bare date means the auditor's whole day, inclusive at both ends.
function boundary(raw: string | null, edge: "start" | "end"): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return `${value}T${edge === "start" ? "00:00:00" : "23:59:59"}Z`;
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return isoSeconds(d);
}

function intParam(raw: string | null, fallback: number, max: number): number {
  const n = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(n, max);
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;

    // The filter bar's option lists come from the data itself, so an action or
    // entity type introduced by a new module is filterable without a UI change.
    if (params.get("facets")) {
      const [actions, entityTypes] = await Promise.all([
        db.selectDistinct({ v: auditLog.action }).from(auditLog).orderBy(auditLog.action),
        db.selectDistinct({ v: auditLog.entityType }).from(auditLog).orderBy(auditLog.entityType),
      ]);
      return NextResponse.json({
        actions: actions.map((r) => r.v).filter(Boolean),
        entityTypes: entityTypes.map((r) => r.v).filter(Boolean),
      });
    }

    const from = boundary(params.get("from"), "start");
    const to = boundary(params.get("to"), "end");
    const entityType = (params.get("entityType") ?? "").trim();
    const entityId = (params.get("entityId") ?? "").trim();
    const userId = (params.get("userId") ?? "").trim();
    const action = (params.get("action") ?? "").trim();
    const q = (params.get("q") ?? "").trim();

    const conditions: SQL[] = [];
    if (from) conditions.push(gte(auditLog.timestamp, from));
    if (to) conditions.push(lte(auditLog.timestamp, to));
    if (entityType) conditions.push(eq(auditLog.entityType, entityType));
    if (entityId) conditions.push(eq(auditLog.entityId, entityId));
    if (userId) conditions.push(eq(auditLog.userId, userId));
    if (action) conditions.push(eq(auditLog.action, action));
    if (q) {
      // Escape LIKE wildcards so a literal "%" can't turn into a full scan.
      conditions.push(ilike(auditLog.entityDescription, `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`));
    }
    const where = conditions.length ? and(...conditions) : undefined;

    const isCsv = (params.get("format") ?? "").toLowerCase() === "csv";
    const explicitLimit = params.get("limit");
    const limit = isCsv
      ? intParam(explicitLimit, CSV_MAX_ROWS, CSV_MAX_ROWS)
      : intParam(explicitLimit, DEFAULT_LIMIT, MAX_LIMIT);
    const offset = intParam(params.get("offset"), 0, Number.MAX_SAFE_INTEGER);

    // Timestamp alone is not a stable sort — several rows share a second, and a
    // page boundary landing inside that second would drop or repeat entries.
    const rows = await db
      .select()
      .from(auditLog)
      .where(where)
      .orderBy(desc(auditLog.timestamp), desc(auditLog.id))
      .limit(Math.max(1, limit))
      .offset(offset);

    if (isCsv) {
      const mapped = rows.map((r) => ({
        Timestamp: r.timestamp,
        Action: r.action,
        "Entity Type": r.entityType,
        "Entity ID": r.entityId ?? "",
        Description: r.entityDescription ?? "",
        User: r.userName ?? "",
        "User ID": r.userId ?? "",
        "IP Address": r.ipAddress ?? "",
        Changes: r.changes ?? "",
        "Record ID": r.id,
      }));
      // An empty result still needs its header row: the file is the evidence
      // that the query was run and returned nothing.
      const body = mapped.length ? toCSV(mapped, CSV_COLUMNS) : CSV_COLUMNS.join(",");
      const stamp = `${(params.get("from") || "start").slice(0, 10)}_${(params.get("to") || "today").slice(0, 10)}`;
      return new NextResponse(body, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="limsl-audit-trail-${stamp}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const [totals] = await db.select({ value: count() }).from(auditLog).where(where);

    return NextResponse.json(rows, {
      headers: {
        "X-Total-Count": String(totals?.value ?? rows.length),
        "X-Limit": String(limit),
        "X-Offset": String(offset),
      },
    });
  } catch (error) {
    console.error("Failed to fetch audit log:", error);
    return NextResponse.json({ error: "Failed to fetch audit logs" }, { status: 500 });
  }
}
