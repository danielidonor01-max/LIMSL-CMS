// src/components/ScheduleCalendar.tsx
"use client";

import { Fragment, useMemo } from "react";
import Link from "next/link";
import { MONTH_NAMES, EQUIPMENT_CATEGORY_LABELS } from "@/lib/constants";

type Row = {
  equipmentId: string;
  month: number | null;
  activityType: string;
  status: string;
  equipmentName: string | null;
  assetId: string | null;
  category: string | null;
};

// Excel-style annual maintenance planner: equipment rows grouped by category,
// 12 month columns, activity codes colour-coded by status.
const STATUS_CELL: Record<string, string> = {
  COMPLETED: "bg-emerald-500 text-white",
  OVERDUE: "bg-rose-500 text-white",
  MISSED: "bg-rose-500 text-white",
  SCHEDULED: "bg-sky-500 text-white",
  RESCHEDULED: "bg-amber-500 text-white",
};

const CATEGORY_ORDER = Object.keys(EQUIPMENT_CATEGORY_LABELS);

export default function ScheduleCalendar({ rows }: { rows: Row[] }) {
  const { grouped, cells } = useMemo(() => {
    type EqItem = { id: string; name: string; assetId: string; category: string };
    // unique equipment
    const eqMap = new Map<string, EqItem>();
    const cellMap = new Map<string, Map<number, { activityType: string; status: string }[]>>();

    for (const r of rows) {
      if (!eqMap.has(r.equipmentId)) {
        eqMap.set(r.equipmentId, {
          id: r.equipmentId,
          name: r.equipmentName ?? "—",
          assetId: r.assetId ?? "",
          category: r.category ?? "OTHER",
        });
      }
      if (r.month) {
        if (!cellMap.has(r.equipmentId)) cellMap.set(r.equipmentId, new Map());
        const m = cellMap.get(r.equipmentId)!;
        if (!m.has(r.month)) m.set(r.month, []);
        m.get(r.month)!.push({ activityType: r.activityType, status: r.status });
      }
    }

    const byCategory = new Map<string, EqItem[]>();
    for (const eq of eqMap.values()) {
      if (!byCategory.has(eq.category)) byCategory.set(eq.category, []);
      byCategory.get(eq.category)!.push(eq);
    }
    const grouped = CATEGORY_ORDER.filter((c) => byCategory.has(c)).map((c) => ({
      category: c,
      items: byCategory.get(c)!.sort((a, b) => a.name.localeCompare(b.name)),
    }));
    // include any categories not in the canonical order
    for (const [c, items] of byCategory) {
      if (!CATEGORY_ORDER.includes(c)) grouped.push({ category: c, items });
    }
    return { grouped, cells: cellMap };
  }, [rows]);

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="border-collapse text-[11px] w-full">
          <thead>
            <tr className="bg-slate-100 text-slate-600">
              <th className="sticky left-0 z-10 bg-slate-100 text-left font-semibold px-3 py-2 border border-slate-200 min-w-[240px]">
                Equipment
              </th>
              {MONTH_NAMES.map((m) => (
                <th key={m} className="font-semibold px-2 py-2 border border-slate-200 text-center min-w-[52px]">
                  {m}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grouped.map((group) => (
              <Fragment key={group.category}>
                <tr>
                  <td
                    colSpan={13}
                    className="bg-emerald-50 text-emerald-700 font-semibold uppercase text-[10px] tracking-wider px-3 py-1.5 border border-slate-200"
                  >
                    {EQUIPMENT_CATEGORY_LABELS[group.category] ?? group.category} · {group.items.length}
                  </td>
                </tr>
                {group.items.map((eq) => {
                  const monthMap = cells.get(eq.id);
                  return (
                    <tr key={eq.id} className="hover:bg-slate-50">
                      <td className="sticky left-0 z-10 bg-white hover:bg-slate-50 px-3 py-2 border border-slate-200">
                        <Link
                          href={`/equipment/${eq.assetId.replace(/\//g, "-")}`}
                          className="font-medium text-slate-900 hover:text-emerald-600 block truncate max-w-[220px]"
                        >
                          {eq.name}
                        </Link>
                        <span className="text-[9px] font-mono text-slate-400">{eq.assetId}</span>
                      </td>
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => {
                        const acts = monthMap?.get(month) ?? [];
                        return (
                          <td key={month} className="border border-slate-200 text-center align-middle p-1">
                            <div className="flex flex-wrap gap-0.5 justify-center">
                              {acts.map((a, idx) => (
                                <span
                                  key={idx}
                                  title={`${a.activityType} · ${a.status}`}
                                  className={`inline-block px-1 py-0.5 rounded text-[8px] font-bold leading-none ${
                                    STATUS_CELL[a.status] ?? "bg-slate-400 text-white"
                                  }`}
                                >
                                  {a.activityType}
                                </span>
                              ))}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 px-4 py-3 border-t border-slate-200 text-[10px] text-slate-500">
        <span className="font-semibold uppercase tracking-wider">Legend:</span>
        {[
          ["COMPLETED", "Completed"],
          ["SCHEDULED", "Scheduled"],
          ["OVERDUE", "Overdue"],
          ["RESCHEDULED", "Rescheduled"],
        ].map(([k, label]) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className={`w-3 h-3 rounded ${STATUS_CELL[k]}`} />
            {label}
          </span>
        ))}
        <span className="ml-auto font-mono">Codes: PM · INS · CM · PRS</span>
      </div>
    </div>
  );
}
