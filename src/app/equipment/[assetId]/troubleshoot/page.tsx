// src/app/equipment/[assetId]/troubleshoot/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import SchematicViewer from "@/components/SchematicViewer";
import {
  ArrowLeft,
  Loader2,
  Stethoscope,
  Search,
  FileText,
  Cpu,
  CheckCircle2,
  History as HistoryIcon,
  BookOpen,
  Sparkles,
  MapPin,
} from "lucide-react";

type Component = {
  componentTag: string;
  name: string;
  type: string;
  location: string | null;
  schematicReference: string | null;
  status: string | null;
};
type Diagnosis = {
  rank: number;
  cause: string;
  confidence: number;
  source: "GUIDE" | "HISTORY" | "GUIDE+HISTORY";
  guideId?: string | null;
  errorCode?: string | null;
  evidence: string[];
  steps: string[];
  resolution?: string | null;
  components: Component[];
  historyRefs: { cmrf: string; date: string; rootCause: string; parts?: string | null }[];
};
type Schematic = { id: string; title: string; type: string; sheet: string | null; fileUrl: string | null };
type Passage = {
  id: string;
  sourceType: string;
  sourceLabel: string;
  heading: string | null;
  pageStart: number | null;
  pageEnd: number | null;
  snippet: string;
  rank: number;
};
type DiagnoseResult = {
  equipment: { id: string; name: string; assetId: string; category: string; status: string };
  diagnoses: Diagnosis[];
  passages?: Passage[];
  schematics: Schematic[];
  components: Component[];
  knownSymptoms: { id: string; symptom: string; errorCode: string | null }[];
  historyCount: number;
  guideCount: number;
};

// ts_headline wraps matched terms in **…** — render those highlighted, safely
// (plain text split, no HTML injection).
function Snippet({ text }: { text: string }) {
  const parts = text.split("**");
  return (
    <span>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="bg-amber-100 text-slate-900 rounded px-0.5">{p}</mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </span>
  );
}

const SOURCE_BADGE: Record<string, string> = {
  GUIDE: "bg-sky-50 text-sky-700 border-sky-200",
  HISTORY: "bg-violet-50 text-violet-700 border-violet-200",
  "GUIDE+HISTORY": "bg-emerald-50 text-emerald-700 border-emerald-200",
};
const SOURCE_LABEL: Record<string, string> = {
  GUIDE: "Guide",
  HISTORY: "Learned from history",
  "GUIDE+HISTORY": "Guide + history",
};

export default function TroubleshootPage() {
  const { assetId } = useParams<{ assetId: string }>();
  const [meta, setMeta] = useState<DiagnoseResult | null>(null);
  const [symptom, setSymptom] = useState("");
  const [result, setResult] = useState<DiagnoseResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [diagnosing, setDiagnosing] = useState(false);
  const [checked, setChecked] = useState<Record<string, Record<number, boolean>>>({});
  const [learned, setLearned] = useState<Record<number, string>>({});
  const [viewer, setViewer] = useState<{ docId: string; title: string; reference?: string | null } | null>(null);

  // Load machine context (schematics, known symptoms, counts)
  useEffect(() => {
    fetch(`/api/equipment/${assetId}/diagnose`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setMeta(d))
      .finally(() => setLoading(false));
  }, [assetId]);

  const runDiagnosis = async (sym?: string) => {
    const s = (sym ?? symptom).trim();
    if (s.length < 2) return;
    setSymptom(s);
    setDiagnosing(true);
    setLearned({});
    const res = await fetch(`/api/equipment/${assetId}/diagnose?symptom=${encodeURIComponent(s)}`).then((r) => r.json());
    setResult(res);
    setDiagnosing(false);
  };

  const toggleStep = (rank: number, i: number) =>
    setChecked((c) => ({ ...c, [rank]: { ...(c[rank] ?? {}), [i]: !(c[rank]?.[i]) } }));

  const resolveWith = async (d: Diagnosis) => {
    const res = await fetch(`/api/equipment/${assetId}/diagnose`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resolved: true,
        symptom,
        matchedGuideId: d.guideId ?? undefined,
        probableCause: d.cause,
        resolutionAction: d.resolution ?? "",
        componentTag: d.components[0]?.componentTag ?? "",
        errorCode: d.errorCode ?? "",
        diagnosticSteps: d.steps,
      }),
    }).then((r) => r.json());
    setLearned((l) => ({
      ...l,
      [d.rank]: res.learned === "created" ? "Learned as a new guide ✓" : "Reinforced (success +1) ✓",
    }));
  };

  const ctx = result ?? meta;

  // Schematic *documents* (preparable into tiles) vs external diagram links —
  // the diagnose route appends documents with their docType as `type`.
  const schematicDocs = (ctx?.schematics ?? []).filter(
    (s) => s.type === "ELECTRICAL_SCHEMATIC" || s.type === "OPERATIONAL_MANUAL",
  );
  const openOnSchematic = (reference?: string | null) => {
    const doc = schematicDocs.find((s) => s.type === "ELECTRICAL_SCHEMATIC") ?? schematicDocs[0];
    if (doc) setViewer({ docId: doc.id, title: doc.title, reference });
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
      </div>
    );
  }
  if (!meta || (meta as { error?: string }).error) {
    return (
      <div className="p-10 text-center text-slate-500">
        Equipment not found.{" "}
        <Link href="/equipment" className="text-emerald-600 hover:underline">Back</Link>
      </div>
    );
  }

  const eq = meta.equipment;

  return (
    <div className="p-6 max-w-6xl w-full mx-auto space-y-6">
      <Link href={`/equipment/${assetId}`} className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900">
        <ArrowLeft className="w-3.5 h-3.5" /> Back to digital twin
      </Link>

      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200">
          <Stethoscope className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">Diagnostic Engine</h2>
          <p className="text-xs text-slate-500 font-mono">
            {eq.name} · {eq.assetId} · learns from {meta.guideCount} guides + {meta.historyCount} historical cases
          </p>
        </div>
      </div>

      {/* Symptom input */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
        <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
          Describe the fault, symptom, or error code
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={symptom}
              onChange={(e) => setSymptom(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runDiagnosis()}
              placeholder="e.g. No motion X axis, error E-041"
              className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500/40"
            />
          </div>
          <button
            onClick={() => runDiagnosis()}
            disabled={diagnosing || symptom.trim().length < 2}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white rounded-lg text-sm font-semibold"
          >
            {diagnosing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Diagnose
          </button>
        </div>
        {meta.knownSymptoms.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            <span className="text-[10px] text-slate-400 self-center">Known:</span>
            {meta.knownSymptoms.map((k) => (
              <button
                key={k.id}
                onClick={() => runDiagnosis(k.errorCode ? `${k.symptom} ${k.errorCode}` : k.symptom)}
                className="px-2 py-1 rounded-md text-[10px] font-medium bg-slate-100 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 border border-slate-200"
              >
                {k.errorCode ? `[${k.errorCode}] ` : ""}{k.symptom}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Diagnoses */}
        <div className="lg:col-span-2 space-y-4">
          {!result ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-400">
              Enter a symptom and run the engine to see ranked probable causes.
            </div>
          ) : result.diagnoses.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-400">
              No confident match found. Resolve the fault, then record the outcome so the engine learns it.
              <div className="mt-4">
                <NewGuideForm assetId={assetId} symptom={symptom} onDone={() => runDiagnosis()} />
              </div>
            </div>
          ) : (
            result.diagnoses.map((d) => (
              <div key={d.rank} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="p-5 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-sm font-bold text-slate-700 shrink-0">
                        {d.rank}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{d.cause}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className={`text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border ${SOURCE_BADGE[d.source]}`}>
                            {d.source === "GUIDE" ? <BookOpen className="w-2.5 h-2.5 inline mr-1" /> : d.source === "HISTORY" ? <HistoryIcon className="w-2.5 h-2.5 inline mr-1" /> : <Sparkles className="w-2.5 h-2.5 inline mr-1" />}
                            {SOURCE_LABEL[d.source]}
                          </span>
                          {d.errorCode && <span className="text-[10px] font-mono text-slate-500">{d.errorCode}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-lg font-bold text-emerald-600">{d.confidence}%</div>
                      <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden mt-1">
                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${d.confidence}%` }} />
                      </div>
                    </div>
                  </div>

                  {/* Evidence */}
                  <div className="flex flex-wrap gap-1.5">
                    {d.evidence.map((ev, i) => (
                      <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-slate-50 border border-slate-200 text-slate-600">
                        {ev}
                      </span>
                    ))}
                  </div>

                  {/* Implicated components + schematic refs */}
                  {d.components.length > 0 && (
                    <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 space-y-1.5">
                      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                        <Cpu className="w-3 h-3" /> Check these components
                      </p>
                      {d.components.map((c) => (
                        <div key={c.componentTag} className="flex items-center justify-between text-xs">
                          <span className="text-slate-700">
                            <span className="font-mono font-semibold text-slate-900">{c.componentTag}</span> · {c.name}
                          </span>
                          {c.schematicReference &&
                            (schematicDocs.length > 0 ? (
                              <button
                                onClick={() => openOnSchematic(c.schematicReference)}
                                className="text-[10px] text-emerald-700 font-mono flex items-center gap-1 hover:underline"
                                title="View on schematic"
                              >
                                <MapPin className="w-3 h-3" /> {c.schematicReference}
                              </button>
                            ) : (
                              <span className="text-[10px] text-emerald-700 font-mono flex items-center gap-1">
                                <MapPin className="w-3 h-3" /> {c.schematicReference}
                              </span>
                            ))}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Diagnostic steps */}
                  {d.steps.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Diagnostic steps</p>
                      {d.steps.map((s, i) => (
                        <label key={i} className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!checked[d.rank]?.[i]}
                            onChange={() => toggleStep(d.rank, i)}
                            className="accent-emerald-600 w-3.5 h-3.5 mt-0.5"
                          />
                          <span className={checked[d.rank]?.[i] ? "line-through text-slate-400" : ""}>{s}</span>
                        </label>
                      ))}
                    </div>
                  )}

                  {d.resolution && (
                    <p className="text-xs text-slate-600 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                      <span className="font-semibold text-emerald-700">Resolution:</span> {d.resolution}
                    </p>
                  )}

                  {/* History refs */}
                  {d.historyRefs.length > 0 && (
                    <div className="text-[10px] text-slate-400 font-mono">
                      History: {d.historyRefs.map((h) => `${h.cmrf}${h.parts ? ` (${h.parts})` : ""}`).join(" · ")}
                    </div>
                  )}
                </div>

                {/* Learn / confirm */}
                <div className="border-t border-slate-200 px-5 py-3 flex items-center justify-between bg-slate-50/50">
                  {learned[d.rank] ? (
                    <span className="text-xs text-emerald-700 font-medium flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" /> {learned[d.rank]}
                    </span>
                  ) : (
                    <>
                      <span className="text-[11px] text-slate-500">Was this the cause? Confirm to teach the engine.</span>
                      <button
                        onClick={() => resolveWith(d)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> This resolved it
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}

          {/* Manuals & procedure passages (FTS over document_chunks) */}
          {result && (result.passages?.length ?? 0) > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-200 flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-sky-600" />
                <h3 className="text-sm font-semibold text-slate-900">Relevant documentation</h3>
                <span className="text-[10px] text-slate-400">manuals &amp; maintenance procedure</span>
              </div>
              <div className="divide-y divide-slate-100">
                {result.passages!.map((p) => (
                  <div key={p.id} className="px-5 py-3 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold text-slate-700 truncate">
                        {p.sourceLabel}
                        {p.heading ? <span className="text-slate-400 font-normal"> · {p.heading}</span> : null}
                      </span>
                      {p.pageStart != null && (
                        <span className="text-[10px] font-mono text-slate-400 shrink-0">
                          p.{p.pageStart}{p.pageEnd && p.pageEnd !== p.pageStart ? `–${p.pageEnd}` : ""}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      <Snippet text={p.snippet} />
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Schematics + component sidebar */}
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
              <FileText className="w-4 h-4 text-emerald-600" /> Schematics to consult
            </h3>
            {ctx && ctx.schematics.length > 0 ? (
              <div className="space-y-2">
                {ctx.schematics.map((s) =>
                  s.type === "ELECTRICAL_SCHEMATIC" || s.type === "OPERATIONAL_MANUAL" ? (
                    <button
                      key={s.id}
                      onClick={() => setViewer({ docId: s.id, title: s.title })}
                      className="w-full flex items-center justify-between p-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs text-left"
                      title="Open tiled viewer"
                    >
                      <span className="text-slate-700 truncate">{s.title}</span>
                      <span className="text-[10px] font-mono text-slate-400 shrink-0 ml-2">{s.type.replace(/_/g, " ")}</span>
                    </button>
                  ) : (
                    <a
                      key={s.id}
                      href={s.fileUrl ?? "#"}
                      className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs"
                    >
                      <span className="text-slate-700 truncate">{s.title}</span>
                      <span className="text-[10px] font-mono text-slate-400 shrink-0 ml-2">{s.type.replace(/_/g, " ")}</span>
                    </a>
                  ),
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-400">No schematics on file.</p>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
              <Cpu className="w-4 h-4 text-emerald-600" /> Component registry (BOM)
            </h3>
            {ctx && ctx.components.length > 0 ? (
              <div className="space-y-2">
                {ctx.components.map((c) => (
                  <div key={c.componentTag} className="text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-semibold text-slate-900">{c.componentTag}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded border ${c.status === "FAULTY" ? "bg-rose-50 text-rose-700 border-rose-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}>
                        {c.status ?? "—"}
                      </span>
                    </div>
                    <p className="text-slate-500">{c.name}</p>
                    {c.schematicReference && (
                      <p className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                        <MapPin className="w-2.5 h-2.5" /> {c.schematicReference} · {c.location}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400">No components registered.</p>
            )}
          </div>
        </div>
      </div>

      {viewer && (
        <SchematicViewer
          assetId={assetId}
          documentId={viewer.docId}
          title={viewer.title}
          schematicReference={viewer.reference}
          onClose={() => setViewer(null)}
        />
      )}
    </div>
  );
}

// Inline form to record a brand-new resolution the engine hasn't seen.
function NewGuideForm({ assetId, symptom, onDone }: { assetId: string; symptom: string; onDone: () => void }) {
  const [cause, setCause] = useState("");
  const [resolution, setResolution] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!cause.trim()) return;
    setSaving(true);
    await fetch(`/api/equipment/${assetId}/diagnose`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolved: true, symptom, probableCause: cause, resolutionAction: resolution }),
    });
    setSaving(false);
    onDone();
  };

  return (
    <div className="max-w-md mx-auto text-left space-y-2">
      <input
        value={cause}
        onChange={(e) => setCause(e.target.value)}
        placeholder="Verified root cause…"
        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:border-emerald-500/40"
      />
      <input
        value={resolution}
        onChange={(e) => setResolution(e.target.value)}
        placeholder="Resolution action…"
        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:border-emerald-500/40"
      />
      <button
        onClick={save}
        disabled={saving || !cause.trim()}
        className="w-full px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white rounded-lg text-xs font-semibold"
      >
        {saving ? "Teaching…" : "Teach the engine this resolution"}
      </button>
    </div>
  );
}
