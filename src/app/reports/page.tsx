// src/app/reports/page.tsx
"use client";

import { useEffect, useState } from "react";
import {
  FileBarChart,
  Loader2,
  Download,
  Printer,
  ShieldCheck,
  Clock,
  DollarSign,
  Layers,
} from "lucide-react";
import { downloadCSV } from "@/lib/export";
import { formatCurrency } from "@/lib/utils";
import { EQUIPMENT_CATEGORY_LABELS, EQUIPMENT_STATUS_LABELS } from "@/lib/constants";

export default function ReportsPage() {
  const [equipment, setEquipment] = useState<any[]>([]);
  const [schedule, setSchedule] = useState<any[]>([]);
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [kpi, setKpi] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/equipment").then((r) => r.json()),
      fetch("/api/schedule").then((r) => r.json()),
      fetch("/api/work-orders").then((r) => r.json()),
      fetch("/api/kpi").then((r) => r.json()),
    ])
      .then(([eq, sc, wo, k]) => {
        setEquipment(Array.isArray(eq) ? eq : []);
        setSchedule(Array.isArray(sc) ? sc : []);
        setWorkOrders(Array.isArray(wo) ? wo : []);
        setKpi(k);
      })
      .finally(() => setLoading(false));
  }, []);

  const TODAY = new Date().toISOString().slice(0, 10);
  const pmDue = schedule.filter((s) => s.activityType === "PM" && s.plannedDate <= TODAY);
  const pmDone = pmDue.filter((s) => s.status === "COMPLETED").length;
  const pmCompliance = pmDue.length ? Math.round((pmDone / pmDue.length) * 100) : 0;
  const overdue = schedule.filter((s) => s.status === "OVERDUE").length;
  const totalDowntime = (kpi?.monthly ?? []).reduce((a: number, m: any) => a + (m.downtimeHours ?? 0), 0);
  const totalCost = (kpi?.monthly ?? []).reduce((a: number, m: any) => a + (m.maintenanceCost ?? 0), 0);

  // Status breakdown
  const statusCounts: Record<string, number> = {};
  equipment.forEach((e) => (statusCounts[e.status] = (statusCounts[e.status] ?? 0) + 1));
  const categoryCounts: Record<string, number> = {};
  equipment.forEach((e) => (categoryCounts[e.category] = (categoryCounts[e.category] ?? 0) + 1));

  const exportEquipment = () =>
    downloadCSV(
      "limsl-equipment-register",
      equipment.map((e) => ({
        AssetID: e.assetId,
        Name: e.name,
        Category: EQUIPMENT_CATEGORY_LABELS[e.category] ?? e.category,
        Location: e.location,
        OEM: e.oem,
        Status: EQUIPMENT_STATUS_LABELS[e.status] ?? e.status,
        Frequency: e.maintenanceFrequency,
        Criticality: e.criticality,
        LastMaintenance: e.lastMaintenanceDate,
        NextMaintenance: e.nextMaintenanceDate,
      })),
    );

  const exportSchedule = () =>
    downloadCSV(
      "limsl-maintenance-schedule-2026",
      schedule.map((s) => ({
        Planned: s.plannedDate,
        AssetID: s.assetId,
        Equipment: s.equipmentName,
        Activity: s.activityType,
        Frequency: s.maintenanceFrequency,
        Responsible: s.responsiblePersonName,
        Status: s.status,
        Completed: s.completedDate,
      })),
    );

  const exportWorkOrders = () =>
    downloadCSV(
      "limsl-work-orders",
      workOrders.map((w) => ({
        WO: w.workOrderNumber,
        Equipment: w.equipmentName,
        AssetID: w.assetId,
        Type: w.type,
        Priority: w.priority,
        Status: w.status,
        Planned: w.plannedDate,
        Completed: w.completionDate,
        Technician: w.technicianName,
      })),
    );

  const reportCard = "bg-white border border-slate-200 rounded-xl p-5";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      <main className="flex-1 p-6 max-w-6xl w-full mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
              <FileBarChart className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight">Reports & Data Export</h2>
              <p className="text-xs text-slate-500 font-mono">
                Compliance · downtime · cost · equipment status
              </p>
            </div>
          </div>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-900 hover:bg-slate-100 rounded-lg text-xs font-semibold"
          >
            <Printer className="w-4 h-4" /> Print
          </button>
        </div>

        {loading || !kpi ? (
          <div className="py-24 flex justify-center items-center text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
            <span className="text-xs ml-2 font-mono">Compiling reports…</span>
          </div>
        ) : (
          <>
            {/* Headline report cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Head icon={<ShieldCheck className="w-4 h-4 text-emerald-600" />} label="PM Compliance" value={`${pmCompliance}%`} sub={`${pmDone}/${pmDue.length} due PM done`} />
              <Head icon={<Clock className="w-4 h-4 text-rose-600" />} label="Overdue Activities" value={String(overdue)} sub="Across all schedules" />
              <Head icon={<Clock className="w-4 h-4 text-amber-600" />} label="YTD Downtime" value={`${totalDowntime} hrs`} sub="Jan–Jun 2026" />
              <Head icon={<DollarSign className="w-4 h-4 text-sky-600" />} label="YTD Maint. Cost" value={formatCurrency(totalCost)} sub="Jan–Jun 2026" />
            </div>

            {/* Equipment status + category */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className={reportCard}>
                <h3 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-emerald-600" /> Equipment Status Breakdown
                </h3>
                <div className="space-y-2">
                  {Object.entries(statusCounts).map(([status, count]) => (
                    <Row key={status} label={EQUIPMENT_STATUS_LABELS[status] ?? status} count={count} total={equipment.length} />
                  ))}
                </div>
              </div>
              <div className={reportCard}>
                <h3 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-emerald-600" /> Assets by Category
                </h3>
                <div className="space-y-2">
                  {Object.entries(categoryCounts)
                    .sort((a, b) => b[1] - a[1])
                    .map(([cat, count]) => (
                      <Row key={cat} label={EQUIPMENT_CATEGORY_LABELS[cat] ?? cat} count={count} total={equipment.length} />
                    ))}
                </div>
              </div>
            </div>

            {/* Export */}
            <div className={reportCard}>
              <h3 className="text-sm font-semibold text-slate-900 mb-1">Data Export (CSV)</h3>
              <p className="text-[11px] text-slate-500 mb-4">
                Export registers for archival or interoperability with legacy XLSB/XLSM workbooks.
              </p>
              <div className="flex flex-wrap gap-3">
                <ExportBtn onClick={exportEquipment} label={`Equipment Register (${equipment.length})`} />
                <ExportBtn onClick={exportSchedule} label={`Maintenance Schedule (${schedule.length})`} />
                <ExportBtn onClick={exportWorkOrders} label={`Work Orders (${workOrders.length})`} />
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function Head({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{label}</span>
        {icon}
      </div>
      <div className="text-2xl font-bold mt-2 text-slate-900">{value}</div>
      <p className="text-[10px] text-slate-500 mt-1">{sub}</p>
    </div>
  );
}

function Row({ label, count, total }: { label: string; count: number; total: number }) {
  const pct = total ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-slate-700">{label}</span>
        <span className="text-slate-500 font-mono">{count} ({pct}%)</span>
      </div>
      <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
        <div className="h-full bg-emerald-500/70 rounded-full" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function ExportBtn({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600/90 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition-all"
    >
      <Download className="w-4 h-4" /> {label}
    </button>
  );
}
