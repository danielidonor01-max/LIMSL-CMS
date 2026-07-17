// src/components/ScheduleCalendar.tsx
// Day-based maintenance calendar with Week / Month / Quarter / Year views.
// Clicking a day opens a modal: if the day has scheduled activities it shows their
// details; if it's empty it offers to schedule work (corrective flow / work order).
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus, CalendarDays } from "lucide-react";
import Modal from "@/components/Modal";
import { MONTH_NAMES } from "@/lib/constants";

type Row = {
  id: string;
  plannedDate: string; // YYYY-MM-DD
  activityType: string; // PM | INS | CM | PRS
  status: string;
  equipmentName: string | null;
  assetId: string | null;
  responsiblePersonName: string | null;
  workOrderId: string | null;
};

type View = "week" | "month" | "quarter" | "year";

const STATUS_DOT: Record<string, string> = {
  COMPLETED: "bg-emerald-500",
  OVERDUE: "bg-rose-500",
  MISSED: "bg-rose-500",
  SCHEDULED: "bg-sky-500",
  RESCHEDULED: "bg-amber-500",
};

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const startOfWeek = (d: Date) => {
  const x = new Date(d);
  x.setDate(x.getDate() - x.getDay()); // Sunday start
  x.setHours(0, 0, 0, 0);
  return x;
};
const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function ScheduleCalendar({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [view, setView] = useState<View>("month");
  const [cursor, setCursor] = useState(() => new Date());
  const [selected, setSelected] = useState<string | null>(null); // YYYY-MM-DD

  const todayStr = ymd(new Date());

  // Index activities by day.
  const byDay = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of rows) {
      if (!r.plannedDate) continue;
      const key = r.plannedDate.slice(0, 10);
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(r);
    }
    return m;
  }, [rows]);

  const shift = (dir: number) => {
    const c = new Date(cursor);
    if (view === "week") c.setDate(c.getDate() + dir * 7);
    else if (view === "month") c.setMonth(c.getMonth() + dir);
    else if (view === "quarter") c.setMonth(c.getMonth() + dir * 3);
    else c.setFullYear(c.getFullYear() + dir);
    setCursor(c);
  };

  const periodLabel = useMemo(() => {
    if (view === "week") {
      const s = startOfWeek(cursor);
      const e = addDays(s, 6);
      return `${MONTH_NAMES[s.getMonth()]} ${s.getDate()} – ${MONTH_NAMES[e.getMonth()]} ${e.getDate()}, ${e.getFullYear()}`;
    }
    if (view === "month") return `${MONTH_NAMES[cursor.getMonth()]} ${cursor.getFullYear()}`;
    if (view === "quarter") {
      const q = Math.floor(cursor.getMonth() / 3);
      return `Q${q + 1} ${cursor.getFullYear()}`;
    }
    return `${cursor.getFullYear()}`;
  }, [view, cursor]);

  const selectedRows = selected ? byDay.get(selected) ?? [] : [];

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <button onClick={() => shift(-1)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-bold text-slate-900 min-w-[180px] text-center">{periodLabel}</span>
          <button onClick={() => shift(1)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => setCursor(new Date())}
            className="ml-1 px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-100 text-xs font-semibold text-slate-600"
          >
            Today
          </button>
        </div>
        <div className="flex gap-1 bg-slate-100 border border-slate-200 rounded-lg p-1">
          {(["week", "month", "quarter", "year"] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold capitalize transition-all ${
                view === v ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500 hover:text-slate-900"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4">
        {view === "week" && <WeekGrid cursor={cursor} byDay={byDay} todayStr={todayStr} onPick={setSelected} />}
        {view === "month" && <MonthGrid year={cursor.getFullYear()} month={cursor.getMonth()} byDay={byDay} todayStr={todayStr} onPick={setSelected} />}
        {view === "quarter" && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[0, 1, 2].map((i) => {
              const m = Math.floor(cursor.getMonth() / 3) * 3 + i;
              return <MiniMonth key={m} year={cursor.getFullYear()} month={m} byDay={byDay} todayStr={todayStr} onPick={setSelected} />;
            })}
          </div>
        )}
        {view === "year" && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 12 }, (_, m) => (
              <MiniMonth key={m} year={cursor.getFullYear()} month={m} byDay={byDay} todayStr={todayStr} onPick={setSelected} />
            ))}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 px-4 py-3 border-t border-slate-200 text-[10px] text-slate-500">
        <span className="font-semibold uppercase tracking-wider">Status:</span>
        {[["SCHEDULED", "Scheduled"], ["COMPLETED", "Completed"], ["OVERDUE", "Overdue/Missed"], ["RESCHEDULED", "Rescheduled"]].map(([k, l]) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-full ${STATUS_DOT[k]}`} /> {l}
          </span>
        ))}
        <span className="ml-auto font-mono">Click any day for details or to schedule work</span>
      </div>

      {/* Day modal */}
      <Modal
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected ? new Date(selected + "T00:00:00").toDateString() : ""}
        subtitle={`${selectedRows.length} scheduled activit${selectedRows.length === 1 ? "y" : "ies"}`}
      >
        {selectedRows.length > 0 ? (
          <div className="space-y-3">
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {selectedRows.map((r) => (
                <div key={r.id} className="p-3 border border-slate-200 rounded-lg">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900">{r.equipmentName ?? "—"}</span>
                    <span className={`w-2.5 h-2.5 rounded-full ${STATUS_DOT[r.status] ?? "bg-slate-400"}`} title={r.status} />
                  </div>
                  <p className="text-[11px] font-mono text-slate-500">{r.assetId}</p>
                  <div className="flex items-center gap-3 mt-1.5 text-[11px] text-slate-600">
                    <span className="px-1.5 py-0.5 rounded bg-slate-100 font-bold">{r.activityType}</span>
                    <span>{r.status}</span>
                    {r.responsiblePersonName && <span>· {r.responsiblePersonName}</span>}
                  </div>
                  <div className="mt-2">
                    {r.workOrderId ? (
                      <Link href={`/work-orders/${r.workOrderId}`} className="text-xs text-emerald-600 hover:underline">
                        View work order →
                      </Link>
                    ) : (
                      <Link href={`/work-orders/new?scheduleId=${r.id}`} className="text-xs text-sky-600 hover:underline">
                        Raise work order →
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="pt-2 border-t border-slate-200">
              <button
                onClick={() => router.push("/corrective/new")}
                className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 border border-rose-200 text-rose-700 hover:bg-rose-50 rounded-lg text-xs font-semibold"
              >
                <Plus className="w-4 h-4" /> Also log a corrective maintenance
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">No maintenance scheduled for this day. Schedule work:</p>
            <button
              onClick={() => router.push("/corrective/new")}
              className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold"
            >
              <Plus className="w-4 h-4" /> Schedule Corrective Maintenance
            </button>
            <button
              onClick={() => router.push("/work-orders/new")}
              className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold"
            >
              <CalendarDays className="w-4 h-4" /> Raise a Work Order
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ── Day cell ──────────────────────────────────────────────────────────────────
function DayCell({
  date,
  inMonth,
  acts,
  todayStr,
  onPick,
  compact,
}: {
  date: Date;
  inMonth: boolean;
  acts: Row[];
  todayStr: string;
  onPick: (d: string) => void;
  compact?: boolean;
}) {
  const key = ymd(date);
  const isToday = key === todayStr;
  return (
    <button
      onClick={() => onPick(key)}
      className={`relative border border-slate-100 rounded-md text-left transition-colors hover:bg-emerald-50 ${
        compact ? "h-9 p-1" : "min-h-[76px] p-1.5"
      } ${inMonth ? "bg-white" : "bg-slate-50/60"}`}
    >
      <span
        className={`inline-flex items-center justify-center text-[10px] ${compact ? "" : "font-semibold"} ${
          isToday ? "bg-emerald-600 text-white w-4 h-4 rounded-full" : inMonth ? "text-slate-600" : "text-slate-300"
        }`}
      >
        {date.getDate()}
      </span>
      {acts.length > 0 &&
        (compact ? (
          <div className="flex gap-0.5 mt-0.5 flex-wrap">
            {acts.slice(0, 4).map((a, i) => (
              <span key={i} className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[a.status] ?? "bg-slate-400"}`} />
            ))}
          </div>
        ) : (
          <div className="mt-1 space-y-0.5">
            {acts.slice(0, 3).map((a, i) => (
              <div
                key={i}
                className="flex items-center gap-1 text-[9px] text-slate-600 truncate"
                title={`${a.activityType} · ${a.equipmentName} · ${a.status}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[a.status] ?? "bg-slate-400"}`} />
                <span className="font-bold">{a.activityType}</span>
                <span className="truncate text-slate-400">{a.assetId}</span>
              </div>
            ))}
            {acts.length > 3 && <div className="text-[9px] text-slate-400">+{acts.length - 3} more</div>}
          </div>
        ))}
    </button>
  );
}

function WeekGrid({ cursor, byDay, todayStr, onPick }: { cursor: Date; byDay: Map<string, Row[]>; todayStr: string; onPick: (d: string) => void }) {
  const start = startOfWeek(cursor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return (
    <div className="grid grid-cols-7 gap-1">
      {DOW.map((d) => (
        <div key={d} className="text-center text-[10px] font-semibold text-slate-400 uppercase pb-1">{d}</div>
      ))}
      {days.map((d) => (
        <div key={ymd(d)} className="min-h-[140px]">
          <DayCell date={d} inMonth acts={byDay.get(ymd(d)) ?? []} todayStr={todayStr} onPick={onPick} />
        </div>
      ))}
    </div>
  );
}

function MonthGrid({ year, month, byDay, todayStr, onPick }: { year: number; month: number; byDay: Map<string, Row[]>; todayStr: string; onPick: (d: string) => void }) {
  const first = new Date(year, month, 1);
  const gridStart = startOfWeek(first);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  return (
    <div className="grid grid-cols-7 gap-1">
      {DOW.map((d) => (
        <div key={d} className="text-center text-[10px] font-semibold text-slate-400 uppercase pb-1">{d}</div>
      ))}
      {cells.map((d) => (
        <DayCell key={ymd(d)} date={d} inMonth={d.getMonth() === month} acts={byDay.get(ymd(d)) ?? []} todayStr={todayStr} onPick={onPick} />
      ))}
    </div>
  );
}

function MiniMonth({ year, month, byDay, todayStr, onPick }: { year: number; month: number; byDay: Map<string, Row[]>; todayStr: string; onPick: (d: string) => void }) {
  const first = new Date(year, month, 1);
  const gridStart = startOfWeek(first);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  return (
    <div>
      <p className="text-xs font-bold text-slate-700 mb-1">{MONTH_NAMES[month]}</p>
      <div className="grid grid-cols-7 gap-0.5">
        {DOW.map((d) => (
          <div key={d} className="text-center text-[8px] text-slate-300">{d[0]}</div>
        ))}
        {cells.map((d) => (
          <DayCell key={ymd(d)} date={d} inMonth={d.getMonth() === month} acts={byDay.get(ymd(d)) ?? []} todayStr={todayStr} onPick={onPick} compact />
        ))}
      </div>
    </div>
  );
}
