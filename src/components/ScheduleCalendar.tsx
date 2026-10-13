// src/components/ScheduleCalendar.tsx
// Day-based maintenance calendar with Week / Month / Quarter / Year views.
// Clicking a day opens a modal: if the day has scheduled activities it shows their
// details; if it's empty it offers to schedule work (corrective flow / work order).
"use client";

import Button from "@/components/Button";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus, CalendarDays } from "lucide-react";
import Modal from "@/components/Modal";
import { MONTH_NAMES } from "@/lib/constants";
import SegmentedControl from "@/components/SegmentedControl";
import { toast } from "sonner";
import { useCategoryLabels } from "@/lib/use-category-labels";

type Row = {
  id: string;
  plannedDate: string; // YYYY-MM-DD
  activityType: string; // PM | INS | CM | PRS
  status: string;
  equipmentName: string | null;
  assetId: string | null;
  responsiblePersonName: string | null;
  workOrderId: string | null;
  category: string | null;
  batchId: string | null;
};

type View = "week" | "month" | "quarter" | "year";

const STATUS_DOT: Record<string, string> = {
  COMPLETED: "bg-brand-500",
  OVERDUE: "bg-danger-500",
  MISSED: "bg-danger-500",
  SCHEDULED: "bg-info-500",
  RESCHEDULED: "bg-warn-500",
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

export default function ScheduleCalendar({
  rows,
  canRaiseBatch = false,
}: {
  rows: Row[];
  /** Raising a batch commits other people's time, so it is a foreman's act and above. */
  canRaiseBatch?: boolean;
}) {
  const [raising, setRaising] = useState<string | null>(null);
  const router = useRouter();
  const [view, setView] = useState<View>("month");
  const [cursor, setCursor] = useState(() => new Date());
  const [selected, setSelected] = useState<string | null>(null); // YYYY-MM-DD

  // The batch is raised from the row's CATEGORY and DATE, not from the row.
  // The server works out which machines that means, so a calendar left open
  // since this morning cannot leave one out of the permit meant to cover it.
  const raiseBatch = async (r: Row) => {
    if (!r.category) {
      toast.error("This activity has no equipment category, so it cannot be batched.");
      return;
    }
    setRaising(r.id);
    try {
      const res = await fetch("/api/pm-batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: r.category, plannedDate: r.plannedDate }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(d.error || "Could not raise the batch.");
        return;
      }
      toast.success(
        `${d.batchNumber} raised, covering ${d.machineCount} machine${d.machineCount === 1 ? "" : "s"}.`,
      );
      router.push(`/pm-batches/${d.id}`);
    } catch {
      toast.error("Could not raise the batch.");
    } finally {
      setRaising(null);
    }
  };

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
      return `${MONTH_NAMES[s.getMonth()]} ${s.getDate()}, ${MONTH_NAMES[e.getMonth()]} ${e.getDate()}, ${e.getFullYear()}`;
    }
    if (view === "month") return `${MONTH_NAMES[cursor.getMonth()]} ${cursor.getFullYear()}`;
    if (view === "quarter") {
      const q = Math.floor(cursor.getMonth() / 3);
      return `Q${q + 1} ${cursor.getFullYear()}`;
    }
    return `${cursor.getFullYear()}`;
  }, [view, cursor]);

  const categoryLabels = useCategoryLabels();

  const selectedRows = selected ? byDay.get(selected) ?? [] : [];

  const groupedCategories = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        category: string | null;
        categoryLabel: string;
        activityType: string;
        status: string;
        batchId: string | null;
        plannedDate: string;
        firstRow: Row;
        equipments: Row[];
      }
    >();

    for (const r of selectedRows) {
      const key = r.category ? `${r.activityType}::${r.category}` : `SINGLE::${r.id}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          category: r.category,
          categoryLabel: r.category
            ? (categoryLabels[r.category] ?? r.category)
            : (r.equipmentName ?? r.assetId ?? "Individual Equipment"),
          activityType: r.activityType,
          status: r.status,
          batchId: r.batchId,
          plannedDate: r.plannedDate,
          firstRow: r,
          equipments: [],
        });
      }
      const g = map.get(key)!;
      g.equipments.push(r);
      if (!g.batchId && r.batchId) g.batchId = r.batchId;
      if (r.status === "OVERDUE" || r.status === "MISSED") g.status = "OVERDUE";
    }
    return Array.from(map.values());
  }, [selectedRows, categoryLabels]);

  return (
    <div className="bg-surface border border-line rounded-xl shadow-card overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 border-b border-ink-200">
        <div className="flex items-center gap-2">
          <button onClick={() => shift(-1)} className="p-1.5 rounded-lg hover:bg-ink-100 text-ink-500">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-base font-semibold text-ink-900 min-w-[180px] text-center">{periodLabel}</span>
          <button onClick={() => shift(1)} className="p-1.5 rounded-lg hover:bg-ink-100 text-ink-500">
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => setCursor(new Date())}
            className="ml-1 px-2.5 py-1 rounded-lg border border-ink-200 hover:bg-ink-100 text-xs font-semibold text-ink-600"
          >
            Today
          </button>
        </div>
        {/* `capitalize` was doing the work of a label here, which is fine
            until a view is called something that is not one lowercase word. */}
        <SegmentedControl
          ariaLabel="Calendar range"
          value={view}
          onChange={setView}
          options={[
            { value: "week" as View, label: "Week" },
            { value: "month" as View, label: "Month" },
            { value: "quarter" as View, label: "Quarter" },
            { value: "year" as View, label: "Year" },
          ]}
        />
      </div>

      <div className="p-4">
        {view === "week" && <WeekGrid cursor={cursor} byDay={byDay} todayStr={todayStr} onPick={setSelected} categoryLabels={categoryLabels} />}
        {view === "month" && <MonthGrid year={cursor.getFullYear()} month={cursor.getMonth()} byDay={byDay} todayStr={todayStr} onPick={setSelected} categoryLabels={categoryLabels} />}
        {view === "quarter" && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[0, 1, 2].map((i) => {
              const m = Math.floor(cursor.getMonth() / 3) * 3 + i;
              return <MiniMonth key={m} year={cursor.getFullYear()} month={m} byDay={byDay} todayStr={todayStr} onPick={setSelected} categoryLabels={categoryLabels} />;
            })}
          </div>
        )}
        {view === "year" && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 12 }, (_, m) => (
              <MiniMonth key={m} year={cursor.getFullYear()} month={m} byDay={byDay} todayStr={todayStr} onPick={setSelected} categoryLabels={categoryLabels} />
            ))}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 px-4 py-3 border-t border-ink-200 text-xs text-ink-500">
        <span className="font-semibold">Status:</span>
        {[["SCHEDULED", "Scheduled"], ["COMPLETED", "Completed"], ["OVERDUE", "Overdue/Missed"], ["RESCHEDULED", "Rescheduled"]].map(([k, l]) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-full ${STATUS_DOT[k]}`} /> {l}
          </span>
        ))}
        <span className="ml-auto">Click any day to view category batches & equipment</span>
      </div>

      {/* Day modal */}
      <Modal
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected ? new Date(selected + "T00:00:00").toDateString() : ""}
        subtitle={`${groupedCategories.length} category schedule${groupedCategories.length === 1 ? "" : "s"} (${selectedRows.length} equipment total)`}
      >
        {groupedCategories.length > 0 ? (
          <div className="space-y-4">
            <div className="space-y-3 max-h-[65vh] overflow-y-auto pr-1">
              {groupedCategories.map((g) => (
                <div key={g.key} className="p-3.5 border border-ink-200 rounded-xl bg-surface space-y-3">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-ink-900">{g.categoryLabel}</span>
                        <span className={`w-2.5 h-2.5 rounded-full ${STATUS_DOT[g.status] ?? "bg-ink-400"}`} title={g.status} />
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-ink-500">
                        <span className="px-1.5 py-0.5 rounded bg-ink-100 font-bold text-ink-700">{g.activityType}</span>
                        <span>{g.equipments.length} machine{g.equipments.length === 1 ? "" : "s"} in schedule</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {g.batchId ? (
                        <Link
                          href={`/pm-batches/${g.batchId}`}
                          className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-brand-50 text-brand-700 border border-brand-200 hover:bg-brand-100"
                        >
                          Open PM Batch →
                        </Link>
                      ) : (g.activityType === "PM" || g.activityType === "INS") && g.category ? (
                        canRaiseBatch ? (
                          <button
                            onClick={() => raiseBatch(g.firstRow)}
                            disabled={raising === g.firstRow.id}
                            className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-brand-600 text-white hover:bg-brand-500 disabled:opacity-50"
                          >
                            {raising === g.firstRow.id ? "Raising…" : `Raise PM Batch (${g.equipments.length}) →`}
                          </button>
                        ) : (
                          <span className="text-xs text-ink-400">Foreman raises batch</span>
                        )
                      ) : null}
                    </div>
                  </div>

                  {/* List of equipments in this category */}
                  <div className="border border-ink-100 rounded-lg overflow-hidden divide-y divide-ink-100 bg-ink-50/50">
                    {g.equipments.map((r) => (
                      <div key={r.id} className="p-2.5 flex items-center justify-between gap-3 text-xs">
                        <div className="min-w-0">
                          <p className="font-semibold text-ink-900 truncate">{r.equipmentName ?? r.assetId}</p>
                          <p className="text-xs text-ink-400">
                            {r.assetId} · {r.status}
                            {r.responsiblePersonName ? ` · Responsible: ${r.responsiblePersonName}` : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {r.workOrderId ? (
                            <Link href={`/work-orders/${r.workOrderId}`} className="text-brand-600 hover:underline font-medium">
                              Work Order →
                            </Link>
                          ) : (
                            <Link href={`/equipment/${r.assetId?.replace(/\//g, "-")}`} className="text-ink-500 hover:underline">
                              Equipment →
                            </Link>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="pt-2 border-t border-ink-200">
              <button
                onClick={() => router.push("/corrective/new")}
                className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 border border-danger-200 text-danger-700 hover:bg-danger-50 rounded-lg text-xs font-semibold"
              >
                <Plus className="w-4 h-4" /> Also log a corrective maintenance
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-ink-500">No maintenance scheduled for this day. Schedule work:</p>
            <Button
              variant="danger"
              fullWidth
              icon={Plus}
              onClick={() => router.push("/corrective/new")}
            >
              Schedule Corrective Maintenance
            </Button>
            <button
              onClick={() => router.push("/work-orders/new")}
              className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 border border-ink-200 hover:bg-ink-100 text-ink-700 rounded-lg text-xs font-semibold"
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
  categoryLabels,
}: {
  date: Date;
  inMonth: boolean;
  acts: Row[];
  todayStr: string;
  onPick: (d: string) => void;
  compact?: boolean;
  categoryLabels?: Record<string, string>;
}) {
  const key = ymd(date);
  const isToday = key === todayStr;

  const dayGroups = useMemo(() => {
    const map = new Map<string, { label: string; activityType: string; count: number; status: string }>();
    for (const a of acts) {
      const catKey = a.category ? `${a.activityType}::${a.category}` : `ID::${a.id}`;
      if (!map.has(catKey)) {
        const label = a.category
          ? (categoryLabels?.[a.category] ?? a.category)
          : (a.assetId ?? a.equipmentName ?? "Eq.");
        map.set(catKey, { label, activityType: a.activityType, count: 0, status: a.status });
      }
      const item = map.get(catKey)!;
      item.count += 1;
      if (a.status === "OVERDUE" || a.status === "MISSED") item.status = "OVERDUE";
    }
    return Array.from(map.values());
  }, [acts, categoryLabels]);

  return (
    <button
      onClick={() => onPick(key)}
      className={`relative border border-ink-100 rounded-lg text-left transition-colors hover:bg-brand-50 ${
        compact ? "h-9 p-1" : "min-h-[76px] p-1.5"
      } ${inMonth ? "bg-white" : "bg-ink-50/60"}`}
    >
      <span
        className={`inline-flex items-center justify-center text-xs ${compact ? "" : "font-semibold"} ${
          isToday ? "bg-brand-600 text-white w-4 h-4 rounded-full" : inMonth ? "text-ink-600" : "text-ink-300"
        }`}
      >
        {date.getDate()}
      </span>
      {acts.length > 0 &&
        (compact ? (
          <div className="flex gap-0.5 mt-0.5 flex-wrap">
            {acts.slice(0, 4).map((a, i) => (
              <span key={i} className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[a.status] ?? "bg-ink-400"}`} />
            ))}
          </div>
        ) : (
          <div className="mt-1 space-y-0.5">
            {dayGroups.slice(0, 3).map((g, i) => (
              <div
                key={i}
                className="flex items-center gap-1 text-xs text-ink-700 truncate"
                title={`${g.activityType} · ${g.label} (${g.count} machine${g.count === 1 ? "" : "s"}) · ${g.status}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[g.status] ?? "bg-ink-400"}`} />
                <span className="font-bold text-ink-900">{g.activityType}</span>
                <span className="truncate text-ink-700">{g.label}</span>
                {g.count > 1 && <span className="text-ink-400 font-normal">({g.count})</span>}
              </div>
            ))}
            {dayGroups.length > 3 && <div className="text-xs text-ink-400">+{dayGroups.length - 3} more</div>}
          </div>
        ))}
    </button>
  );
}

function WeekGrid({
  cursor,
  byDay,
  todayStr,
  onPick,
  categoryLabels,
}: {
  cursor: Date;
  byDay: Map<string, Row[]>;
  todayStr: string;
  onPick: (d: string) => void;
  categoryLabels?: Record<string, string>;
}) {
  const start = startOfWeek(cursor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return (
    <div className="grid grid-cols-7 gap-1">
      {DOW.map((d) => (
        <div key={d} className="text-center text-xs font-semibold text-ink-400 pb-1">{d}</div>
      ))}
      {days.map((d) => (
        <div key={ymd(d)} className="min-h-[140px]">
          <DayCell date={d} inMonth acts={byDay.get(ymd(d)) ?? []} todayStr={todayStr} onPick={onPick} categoryLabels={categoryLabels} />
        </div>
      ))}
    </div>
  );
}

function MonthGrid({
  year,
  month,
  byDay,
  todayStr,
  onPick,
  categoryLabels,
}: {
  year: number;
  month: number;
  byDay: Map<string, Row[]>;
  todayStr: string;
  onPick: (d: string) => void;
  categoryLabels?: Record<string, string>;
}) {
  const first = new Date(year, month, 1);
  const gridStart = startOfWeek(first);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  return (
    <div className="grid grid-cols-7 gap-1">
      {DOW.map((d) => (
        <div key={d} className="text-center text-xs font-semibold text-ink-400 pb-1">{d}</div>
      ))}
      {cells.map((d) => (
        <DayCell key={ymd(d)} date={d} inMonth={d.getMonth() === month} acts={byDay.get(ymd(d)) ?? []} todayStr={todayStr} onPick={onPick} categoryLabels={categoryLabels} />
      ))}
    </div>
  );
}

function MiniMonth({
  year,
  month,
  byDay,
  todayStr,
  onPick,
  categoryLabels,
}: {
  year: number;
  month: number;
  byDay: Map<string, Row[]>;
  todayStr: string;
  onPick: (d: string) => void;
  categoryLabels?: Record<string, string>;
}) {
  const first = new Date(year, month, 1);
  const gridStart = startOfWeek(first);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  return (
    <div>
      <p className="text-xs font-bold text-ink-700 mb-1">{MONTH_NAMES[month]}</p>
      <div className="grid grid-cols-7 gap-0.5">
        {DOW.map((d) => (
          <div key={d} className="text-center text-xs text-ink-300">{d[0]}</div>
        ))}
        {cells.map((d) => (
          <DayCell key={ymd(d)} date={d} inMonth={d.getMonth() === month} acts={byDay.get(ymd(d)) ?? []} todayStr={todayStr} onPick={onPick} compact categoryLabels={categoryLabels} />
        ))}
      </div>
    </div>
  );
}
