// src/app/audit/logs/page.tsx
// The auditor's window onto the trail (ISO 9001 7.5.3.2). Filters map 1:1 onto
// /api/audit query params, so what is on screen is exactly what the CSV export
// contains — the export button reruns the same query server-side.
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Download,
  Filter,
  RotateCcw,
  Search,
  Shield,
  User,
  X,
} from "lucide-react";
import Button from "@/components/Button";
import Select from "@/components/Select";
import { Badge } from "@/components/Badge";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import TableSkeleton from "@/components/TableSkeleton";
import { FIELD_CLASS } from "@/components/Field";
import LoadError from "@/components/LoadError";

type AuditRow = {
  id: string;
  userId: string | null;
  userName: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  entityDescription: string | null;
  changes: string | null;
  ipAddress: string | null;
  timestamp: string;
};

const PAGE_SIZE = 100;

const ACTION_BADGE: Record<string, string> = {
  CREATE: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  UPDATE: "bg-sky-500/10 text-sky-600 border-sky-500/20",
  DELETE: "bg-rose-500/10 text-rose-600 border-rose-500/20",
  CANCEL: "bg-rose-500/10 text-rose-600 border-rose-500/20",
  REJECT: "bg-rose-500/10 text-rose-600 border-rose-500/20",
  SIGN: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  APPROVE: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  IMPORT: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  AI_CHAT: "bg-violet-500/10 text-violet-600 border-violet-500/20",
  AI_DIAGNOSE: "bg-violet-500/10 text-violet-600 border-violet-500/20",
};

const titleise = (v: string) =>
  v.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

function stamp(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: iso, time: "" };
  return {
    date: d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
    time: d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
  };
}

export default function AuditTrailLogs() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [entityType, setEntityType] = useState("");
  const [action, setAction] = useState("");
  const [entityId, setEntityId] = useState("");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");

  const [rows, setRows] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [facets, setFacets] = useState<{ actions: string[]; entityTypes: string[] }>({
    actions: [],
    entityTypes: [],
  });

  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // The filter option lists come from the data, so a new module's entity type is
  // filterable the day it starts writing to the trail.
  useEffect(() => {
    fetch("/api/audit?facets=1")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && Array.isArray(d.actions)) setFacets({ actions: d.actions, entityTypes: d.entityTypes ?? [] });
      })
      .catch(() => undefined);
  }, []);

  const queryString = useCallback(
    (extra: Record<string, string>) => {
      const p = new URLSearchParams();
      if (from) p.set("from", from);
      if (to) p.set("to", to);
      if (entityType) p.set("entityType", entityType);
      if (action) p.set("action", action);
      if (entityId) p.set("entityId", entityId);
      if (q) p.set("q", q);
      for (const [k, v] of Object.entries(extra)) p.set(k, v);
      return p.toString();
    },
    [from, to, entityType, action, entityId, q],
  );

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/audit?${queryString({ limit: String(PAGE_SIZE), offset: "0" })}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return { data: await r.json(), count: Number(r.headers.get("X-Total-Count") ?? "0") };
      })
      .then(({ data, count }) => {
        if (!alive) return;
        setRows(Array.isArray(data) ? data : []);
        setTotal(Number.isFinite(count) ? count : 0);
        setError(false);
      })
      .catch(() => {
        if (alive) setError(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [queryString, reloadKey]);

  const loadMore = () => {
    setLoadingMore(true);
    fetch(`/api/audit?${queryString({ limit: String(PAGE_SIZE), offset: String(rows.length) })}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (Array.isArray(data) && data.length) setRows((prev) => [...prev, ...data]);
      })
      .catch(() => toast.error("Couldn't load more entries."))
      .finally(() => setLoadingMore(false));
  };

  const exportCsv = () => {
    const a = document.createElement("a");
    a.href = `/api/audit?${queryString({ format: "csv" })}`;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast.success("Audit trail export started.");
  };

  const reset = () => {
    setFrom("");
    setTo("");
    setEntityType("");
    setAction("");
    setEntityId("");
    setSearch("");
  };

  const filtered = useMemo(
    () => Boolean(from || to || entityType || action || entityId || q),
    [from, to, entityType, action, entityId, q],
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      <main className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-6">
        <PageHeader
          icon={Shield}
          title="System Audit Log"
          subtitle="Every recorded change — who did it, when, and to which record"
          code="ISO 9001 7.5.3"
          backHref="/"
          backLabel="Dashboard"
          actions={
            <Button variant="secondary" icon={Download} onClick={exportCsv}>
              Export CSV
            </Button>
          }
        />

        {/* Filter bar */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">From</span>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={FIELD_CLASS} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">To</span>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={FIELD_CLASS} />
            </label>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Record type</span>
              <Select value={entityType} onChange={setEntityType} ariaLabel="Filter by record type" placeholder="All records">
                <option value="">All records</option>
                {facets.entityTypes.map((t) => (
                  <option key={t} value={t}>
                    {titleise(t)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Action</span>
              <Select value={action} onChange={setAction} ariaLabel="Filter by action" placeholder="All actions">
                <option value="">All actions</option>
                {facets.actions.map((a) => (
                  <option key={a} value={a}>
                    {titleise(a)}
                  </option>
                ))}
              </Select>
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Search</span>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Asset, document no., description…"
                  className={`${FIELD_CLASS} pl-9`}
                />
              </div>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500">
              <Filter className="w-3.5 h-3.5" />
              {loading ? "Searching…" : `${rows.length} shown of ${total} matching entr${total === 1 ? "y" : "ies"}`}
            </span>
            {entityId && (
              <button
                onClick={() => setEntityId("")}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border bg-emerald-500/10 text-emerald-700 border-emerald-500/20"
                title="Clear the record filter"
              >
                Record {entityId}
                <X className="w-3 h-3" />
              </button>
            )}
            {filtered && (
              <Button variant="ghost" size="sm" icon={RotateCcw} onClick={reset} className="ml-auto">
                Clear filters
              </Button>
            )}
          </div>
        </div>

        {error ? (
          <div className="bg-white border border-slate-200 rounded-xl">
            <LoadError what="the audit trail" onRetry={() => setReloadKey((k) => k + 1)} />
          </div>
        ) : loading ? (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <TableSkeleton rows={8} cols={5} />
          </div>
        ) : rows.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl">
            {filtered ? (
              <EmptyState
                icon={Search}
                title="No entries match these filters"
                message="Nothing in the trail falls inside the current date range, record type, action and search."
                actionLabel="Clear filters"
                onAction={reset}
              />
            ) : (
              <EmptyState
                icon={Shield}
                title="No activity recorded yet"
                message="Every create, update, sign-off and approval lands here automatically as people start using the system."
              />
            )}
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block bg-white border border-slate-200 rounded-xl">
              <div className="overflow-x-auto rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                      <th className="py-3 px-4 font-medium whitespace-nowrap">When</th>
                      <th className="py-3 px-4 font-medium">Action</th>
                      <th className="py-3 px-4 font-medium">Record</th>
                      <th className="py-3 px-4 font-medium">Description</th>
                      <th className="py-3 px-4 font-medium">User</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {rows.map((log) => {
                      const t = stamp(log.timestamp);
                      return (
                        <tr key={log.id} className="hover:bg-slate-50 transition-colors align-top">
                          <td className="py-3 px-4 whitespace-nowrap">
                            <div className="text-slate-900 font-medium">{t.date}</div>
                            <div className="text-[10px] text-slate-400 font-mono">{t.time}</div>
                          </td>
                          <td className="py-3 px-4">
                            <Badge className={ACTION_BADGE[log.action] ?? "bg-slate-100 text-slate-600 border-slate-200"}>
                              {titleise(log.action)}
                            </Badge>
                          </td>
                          <td className="py-3 px-4">
                            <div className="text-slate-700">{titleise(log.entityType)}</div>
                            {log.entityId && (
                              <button
                                onClick={() => setEntityId(log.entityId ?? "")}
                                className="text-[10px] text-slate-400 font-mono hover:text-emerald-700 truncate max-w-[12rem] block text-left"
                                title="Show every entry for this record"
                              >
                                {log.entityId}
                              </button>
                            )}
                          </td>
                          <td className="py-3 px-4 text-slate-600 max-w-md">
                            {log.entityDescription || <span className="text-slate-300">—</span>}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap text-slate-600">
                            {log.userName || "System"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-3">
              {rows.map((log) => {
                const t = stamp(log.timestamp);
                return (
                  <div key={log.id} className="bg-white border border-slate-200 rounded-xl p-4">
                    <div className="flex items-start justify-between gap-3">
                      <Badge className={ACTION_BADGE[log.action] ?? "bg-slate-100 text-slate-600 border-slate-200"}>
                        {titleise(log.action)}
                      </Badge>
                      <div className="text-right">
                        <div className="text-[11px] text-slate-600">{t.date}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{t.time}</div>
                      </div>
                    </div>
                    <p className="text-xs text-slate-700 mt-2">
                      {log.entityDescription || "No description recorded."}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[10px] text-slate-500">
                      <span className="flex items-center gap-1">
                        <User className="w-3.5 h-3.5" /> {log.userName || "System"}
                      </span>
                      <span className="truncate">
                        {titleise(log.entityType)}
                        {log.entityId ? <span className="font-mono"> · {log.entityId}</span> : ""}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {rows.length < total && (
              <div className="flex justify-center">
                <Button variant="secondary" onClick={loadMore} loading={loadingMore}>
                  Load {Math.min(PAGE_SIZE, total - rows.length)} more
                </Button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
