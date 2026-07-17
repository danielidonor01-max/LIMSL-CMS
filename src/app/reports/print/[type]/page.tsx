// src/app/reports/print/[type]/page.tsx
// Renders one of the printable ISO evidence registers. Config-driven: each type
// declares its data source, columns and row mapping.
"use client";

import { use, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { Loader2 } from "lucide-react";
import PrintableReport, { type Column } from "@/components/PrintableReport";
import { formatDate } from "@/lib/utils";

type ReportDef = {
  title: string;
  ref: string;
  endpoint: string;
  columns: Column[];
  // Extract the array of records from the endpoint payload.
  extract?: (data: any) => any[];
  map: (row: any) => Record<string, unknown>;
  summary?: (rows: any[]) => React.ReactNode;
};

const LEVELS = ["None", "Aware", "Competent", "Proficient", "Expert"];

const REPORTS: Record<string, ReportDef> = {
  "ptw-register": {
    title: "Permit-to-Work Register",
    ref: "LIMSL-RPT-PTW",
    endpoint: "/api/permits",
    columns: [
      { key: "permit", label: "Permit" },
      { key: "asset", label: "Asset" },
      { key: "equipment", label: "Equipment" },
      { key: "holder", label: "Permit Holder" },
      { key: "status", label: "Status" },
      { key: "issued", label: "Issued" },
      { key: "expiry", label: "Expiry" },
      { key: "approval", label: "Sign-off" },
    ],
    map: (p) => ({
      permit: p.permitNumber,
      asset: p.assetId ?? "—",
      equipment: p.equipmentName ?? "—",
      holder: p.permitHolderName ?? "—",
      status: p.status,
      issued: p.issuedDate ? formatDate(p.issuedDate) : "—",
      expiry: p.expiryDate ? formatDate(p.expiryDate) : "—",
      approval: p.approval ? `${p.approval.signed}/${p.approval.total}` : "—",
    }),
  },
  "pm-completion": {
    title: "Preventive Maintenance Completion",
    ref: "LIMSL-RPT-PM",
    endpoint: "/api/schedule",
    extract: (d) => (Array.isArray(d) ? d.filter((s) => s.activityType === "PM") : []),
    columns: [
      { key: "planned", label: "Planned" },
      { key: "asset", label: "Asset" },
      { key: "equipment", label: "Equipment" },
      { key: "responsible", label: "Responsible" },
      { key: "status", label: "Status" },
      { key: "completed", label: "Completed" },
    ],
    map: (s) => ({
      planned: s.plannedDate ? formatDate(s.plannedDate) : "—",
      asset: s.assetId ?? "—",
      equipment: s.equipmentName ?? "—",
      responsible: s.responsiblePersonName ?? "—",
      status: s.status,
      completed: s.completedDate ? formatDate(s.completedDate) : "—",
    }),
    summary: (rows) => {
      const today = new Date().toISOString().slice(0, 10);
      const due = rows.filter((s) => (s.plannedDate ?? "") <= today);
      const done = due.filter((s) => s.status === "COMPLETED").length;
      const pct = due.length ? Math.round((done / due.length) * 100) : 0;
      return (
        <div className="flex gap-6 text-xs bg-slate-50 border border-slate-200 rounded-lg p-3">
          <span><strong>{pct}%</strong> compliance</span>
          <span>{done}/{due.length} due PM completed</span>
          <span>{rows.filter((s) => s.status === "OVERDUE").length} overdue</span>
        </div>
      );
    },
  },
  calibration: {
    title: "Calibration Status Register",
    ref: "LIMSL-RPT-CAL",
    endpoint: "/api/calibration",
    columns: [
      { key: "instrument", label: "Instrument" },
      { key: "serial", label: "Serial" },
      { key: "last", label: "Last Cal." },
      { key: "next", label: "Next Cal." },
      { key: "cert", label: "Certificate" },
      { key: "status", label: "Status" },
    ],
    map: (c) => ({
      instrument: c.instrumentName,
      serial: c.serialNumber ?? "—",
      last: c.lastCalibrationDate ? formatDate(c.lastCalibrationDate) : "—",
      next: c.nextCalibrationDate ? formatDate(c.nextCalibrationDate) : "—",
      cert: c.certificateNumber ?? "—",
      status: c.status ?? "—",
    }),
  },
  competency: {
    title: "Competency Matrix",
    ref: "LIMSL-RPT-CMP",
    endpoint: "/api/training",
    extract: (d) => (Array.isArray(d?.competencies) ? d.competencies : []),
    columns: [
      { key: "person", label: "Personnel" },
      { key: "role", label: "Role" },
      { key: "skill", label: "Skill Area" },
      { key: "level", label: "Level" },
      { key: "required", label: "Required" },
      { key: "gap", label: "Gap" },
      { key: "recert", label: "Recert Due" },
    ],
    map: (c) => ({
      person: c.employeeName,
      role: c.role ?? "—",
      skill: c.skillArea,
      level: `${c.level} · ${LEVELS[c.level] ?? ""}`,
      required: `${c.requiredLevel ?? 0} · ${LEVELS[c.requiredLevel ?? 0] ?? ""}`,
      gap: c.level < (c.requiredLevel ?? 0) ? "GAP" : "OK",
      recert: c.expiryDate ? formatDate(c.expiryDate) : "—",
    }),
  },
  "non-conformity": {
    title: "Non-Conformity Log",
    ref: "LIMSL-RPT-NC",
    endpoint: "/api/non-conformities",
    columns: [
      { key: "nc", label: "NC No." },
      { key: "type", label: "Type" },
      { key: "severity", label: "Severity" },
      { key: "detected", label: "Detected" },
      { key: "by", label: "Detected By" },
      { key: "status", label: "Status" },
    ],
    map: (n) => ({
      nc: n.ncNumber,
      type: n.type,
      severity: n.severity,
      detected: n.detectedDate ? formatDate(n.detectedDate) : "—",
      by: n.detectedBy ?? "—",
      status: n.status,
    }),
  },
};

export default function PrintReportPage({ params }: { params: Promise<{ type: string }> }) {
  const { type } = use(params);
  const { data: session } = useSession();
  const def = REPORTS[type];

  const [raw, setRaw] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!def) {
      setLoading(false);
      return;
    }
    fetch(def.endpoint)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setRaw(def.extract ? def.extract(d) : Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  }, [def, type]);

  const rows = useMemo(() => raw.map((r) => def?.map(r) ?? {}), [raw, def]);
  // Client-only date is fine here (not a workflow script).
  const generatedAt = useMemo(() => new Date().toLocaleString(), []);

  if (!def) {
    return <div className="p-10 text-center text-slate-500 text-sm">Unknown report type.</div>;
  }
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <PrintableReport
      title={def.title}
      reference={def.ref}
      generatedBy={session?.user?.name ?? "—"}
      generatedAt={generatedAt}
      columns={def.columns}
      rows={rows}
      csvName={`limsl-${type}`}
      summary={def.summary?.(raw)}
    />
  );
}
