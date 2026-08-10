// src/components/PermitFace.tsx
// The permit as it was marked: type of work, and the three checklists with the
// tick, cross or N/A each line carries. Read-only, because the marks are what
// the signatures attested to and changing them after the fact would change what
// was signed for.
"use client";

import { Check, X, Minus, Flame } from "lucide-react";
import {
  PERMIT_WORK_TYPES,
  REQUIRED_DOCUMENTS,
  WORK_AREA_PRECAUTIONS,
  PPE_REQUIREMENTS,
  type ChecklistMarks,
  type TriState,
} from "@/lib/hse/permit-form";

const parse = (raw: string | null): ChecklistMarks => {
  if (!raw) return {};
  try {
    const p = JSON.parse(raw);
    return p && typeof p === "object" && !Array.isArray(p) ? p : {};
  } catch {
    return {};
  }
};

const parseList = (raw: string | null): string[] => {
  if (!raw) return [];
  try {
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
};

function Mark({ state }: { state: TriState | undefined }) {
  if (state === "YES") return <Check className="w-4 h-4 text-emerald-600" aria-label="Yes" />;
  if (state === "NO") return <X className="w-4 h-4 text-rose-500" aria-label="No" />;
  if (state === "NA") return <Minus className="w-4 h-4 text-slate-400" aria-label="Not applicable" />;
  return <span className="text-slate-300 text-xs">not marked</span>;
}

function Checklist({
  title,
  items,
  marks,
}: {
  title: string;
  items: readonly { key: string; label: string }[];
  marks: ChecklistMarks;
}) {
  return (
    <div>
      <h4 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">{title}</h4>
      <ul className="border border-slate-200 rounded-lg divide-y divide-slate-100 overflow-hidden">
        {items.map((i) => (
          <li key={i.key} className="flex items-center justify-between gap-3 px-3 py-1.5">
            <span
              className={`text-xs ${
                marks[i.key] === "YES" ? "text-slate-900" : "text-slate-500"
              }`}
            >
              {i.label}
            </span>
            <Mark state={marks[i.key]} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function PermitFace({
  permit,
}: {
  permit: {
    workTypes: string | null;
    facility: string | null;
    workArea: string | null;
    zoneClassification: string | null;
    startDate: string | null;
    startTime: string | null;
    durationHours: number | null;
    workerCount: number | null;
    permitDepartment: string | null;
    taskNo: string | null;
    documentMarks: string | null;
    precautionMarks: string | null;
    ppeMarks: string | null;
    additionalRequirements: string | null;
  };
}) {
  const types = parseList(permit.workTypes);
  const documentMarks = parse(permit.documentMarks);
  const precautionMarks = parse(permit.precautionMarks);
  const ppeMarks = parse(permit.ppeMarks);

  const anyMarks =
    Object.keys(documentMarks).length + Object.keys(precautionMarks).length + Object.keys(ppeMarks).length;

  // Permits raised before the checklists existed have nothing to show here, and
  // an empty grid of "not marked" would read as a permit that failed its own
  // checks rather than one that predates them.
  if (types.length === 0 && anyMarks === 0) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">The permit face</h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            As marked when the permit was raised. These are what the signatures attest to.
          </p>
        </div>
        {permit.taskNo && (
          <span className="text-[10px] font-mono text-slate-500 border border-slate-200 rounded px-2 py-1 shrink-0">
            Task {permit.taskNo}
          </span>
        )}
      </div>

      {types.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {PERMIT_WORK_TYPES.filter((t) => types.includes(t.value)).map((t) => (
            <span
              key={t.value}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-900 text-white"
            >
              {t.value === "HOT_WORK" && <Flame className="w-3 h-3" />}
              {t.label}
            </span>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
        <Field label="Facility" value={permit.facility} />
        <Field label="Work area" value={permit.workArea} />
        <Field label="Zone" value={permit.zoneClassification} />
        <Field label="Department" value={permit.permitDepartment} />
        <Field label="Start" value={[permit.startDate, permit.startTime].filter(Boolean).join(" ")} />
        <Field label="Duration" value={permit.durationHours ? `${permit.durationHours} hrs` : null} />
        <Field label="Workers" value={permit.workerCount ? String(permit.workerCount) : null} />
      </div>

      {anyMarks > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 pt-2">
          <div className="space-y-5">
            <Checklist title="Required documents attached" items={REQUIRED_DOCUMENTS} marks={documentMarks} />
            <Checklist title="PPE requirement" items={PPE_REQUIREMENTS} marks={ppeMarks} />
          </div>
          <Checklist
            title="Work area and safety precautions"
            items={WORK_AREA_PRECAUTIONS}
            marks={precautionMarks}
          />
        </div>
      )}

      {permit.additionalRequirements && (
        <div className="pt-2">
          <h4 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
            Additional requirements
          </h4>
          <p className="text-xs text-slate-700 whitespace-pre-line">{permit.additionalRequirements}</p>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{label}</p>
      <p className="text-slate-800 mt-0.5">{value || "-"}</p>
    </div>
  );
}
