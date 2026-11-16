// src/app/document-control/page.tsx
// Document control: one register of every numbered record, what it is, where
// it stands, and what it traces to. Search a number from a paper form and the
// row says where it came from and what hangs off it.
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FileSearch, Search } from "lucide-react";
import { useApi } from "@/lib/api-cache";
import { PAGE_MAIN } from "@/lib/page-shell";
import PageHeader from "@/components/PageHeader";
import Select from "@/components/Select";
import EmptyState from "@/components/EmptyState";
import TableSkeleton from "@/components/TableSkeleton";
import { Badge } from "@/components/Badge";
import { FIELD_CLASS } from "@/components/Field";
import { formatDate } from "@/lib/utils";
import { REGISTER_KIND_LABEL, type RegisterKind, type RegisterRow } from "@/lib/document-register-kinds";

const KINDS = Object.keys(REGISTER_KIND_LABEL) as RegisterKind[];

const statusLabel = (s: string) => s.toLowerCase().replace(/_/g, " ");

export default function DocumentControlPage() {
  const { data, loading } = useApi<{ rows: RegisterRow[] }>("/api/document-register", { rows: [] });
  const [kind, setKind] = useState<"ALL" | RegisterKind>("ALL");
  const [q, setQ] = useState("");

  const rows = data?.rows ?? [];
  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (kind !== "ALL" && r.kind !== kind) return false;
      if (!needle) return true;
      return [r.number, r.title, r.taskNo ?? "", ...r.tracesTo.map((t) => t.number)]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [rows, kind, q]);

  const countOf = (k: RegisterKind) => rows.filter((r) => r.kind === k).length;

  return (
    <div className="min-h-screen bg-canvas text-ink-900 flex flex-col font-sans">
      <main className={PAGE_MAIN.register}>
        <PageHeader
          title="Document Control"
          subtitle="Every numbered record: work orders, batches, method statements, hazard analyses, permits and reports, with what each traces to"
          backHref="/"
          backLabel="Dashboard"
        />

        <div className="flex flex-wrap items-end gap-3">
          <div className="relative flex-1 min-w-[16rem]">
            <Search className="w-4 h-4 text-ink-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search a number, task number or title, e.g. WO-2026-0035"
              aria-label="Search the register"
              className={`${FIELD_CLASS} pl-9`}
            />
          </div>
          <div className="w-60">
            <Select value={kind} onChange={(v) => setKind(v as "ALL" | RegisterKind)} ariaLabel="Document type" className="w-full">
              <option value="ALL">All types ({rows.length})</option>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {REGISTER_KIND_LABEL[k]} ({countOf(k)})
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="bg-surface border border-line rounded-xl shadow-card overflow-hidden">
          {loading ? (
            <TableSkeleton rows={8} cols={7} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-ink-200 text-ink-500">
                    <th className="py-3 px-4 font-medium">Number</th>
                    <th className="py-3 px-4 font-medium">Type</th>
                    <th className="py-3 px-4 font-medium">Title</th>
                    <th className="py-3 px-4 font-medium">Traces to</th>
                    <th className="py-3 px-4 font-medium whitespace-nowrap">Task no.</th>
                    <th className="py-3 px-4 font-medium">Status</th>
                    <th className="py-3 px-4 font-medium">Date</th>
                    <th className="py-3 px-4 font-medium">By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-200">
                  {visible.length === 0 && (
                    <tr>
                      <td colSpan={8}>
                        <EmptyState
                          icon={FileSearch}
                          title={rows.length ? "Nothing matches that search" : "No numbered records yet"}
                          message={
                            rows.length
                              ? "Try the number as printed, or clear the type filter."
                              : "Records appear here as soon as they are numbered."
                          }
                        />
                      </td>
                    </tr>
                  )}
                  {visible.map((r) => (
                    <tr key={r.key} className="hover:bg-ink-50 align-top">
                      <td className="py-3 px-4 whitespace-nowrap">
                        <Link href={r.href} className="font-semibold text-ink-900 hover:text-brand-700 hover:underline">
                          {r.number}
                        </Link>
                        {r.revision !== null && <div className="text-ink-500">Rev {r.revision}</div>}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap text-ink-700">{REGISTER_KIND_LABEL[r.kind]}</td>
                      <td className="py-3 px-4 min-w-[14rem] text-ink-900">
                        <span className="line-clamp-2">{r.title}</span>
                      </td>
                      <td className="py-3 px-4">
                        {r.tracesTo.length ? (
                          <div className="flex flex-wrap gap-1">
                            {r.tracesTo.map((t) => (
                              <Link
                                key={`${r.key}:${t.href}`}
                                href={t.href}
                                className="px-1.5 py-0.5 rounded-lg bg-ink-100 border border-line text-ink-700 hover:border-brand-400 whitespace-nowrap"
                              >
                                {t.number}
                              </Link>
                            ))}
                          </div>
                        ) : (
                          <span className="text-ink-400">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap text-ink-700">{r.taskNo ?? <span className="text-ink-400">-</span>}</td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <Badge className="bg-ink-500/10 text-ink-700 border-ink-500/20">{statusLabel(r.status)}</Badge>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap tabular-nums text-ink-700">{r.date ? formatDate(r.date) : "-"}</td>
                      <td className="py-3 px-4 whitespace-nowrap text-ink-700">{r.by ?? <span className="text-ink-400">-</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
