// src/app/equipment/[assetId]/troubleshoot/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import SchematicViewer from "@/components/SchematicViewer";
import DiagnosisChat from "@/components/DiagnosisChat";
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
  schematicDocId?: string | null;
  schematicPage?: number | null;
  bboxX?: number | null;
  bboxY?: number | null;
  bboxW?: number | null;
  bboxH?: number | null;
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
  aiReady?: boolean;
};

// ts_headline wraps matched terms in **…**, render those highlighted, safely
// (plain text split, no HTML injection).
function Snippet({ text }: { text: string }) {
  const parts = text.split("**");
  return (
    <span>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="bg-warn-100 text-ink-900 rounded px-0.5">{p}</mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </span>
  );
}

const SOURCE_BADGE: Record<string, string> = {
  GUIDE: "bg-info-50 text-info-700 border-info-200",
  HISTORY: "bg-violet-50 text-violet-700 border-violet-200",
  "GUIDE+HISTORY": "bg-brand-50 text-brand-700 border-brand-200",
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
  const [searchedSymptom, setSearchedSymptom] = useState("");
  const [resumeSession, setResumeSession] = useState<string | null>(null);
  type PastSession = { id: string; symptom: string; status: string; resolvedCause: string | null; startedByName: string | null; createdAt: string };
  const [pastSessions, setPastSessions] = useState<PastSession[]>([]);
  // One content region, three views, the page previously stacked engine
  // results, the AI panel and documentation into one long scroll with no
  // hierarchy; a segmented panel keeps a single focus of attention.
  const [panel, setPanel] = useState<"engine" | "ai" | "docs">("engine");
  const [viewer, setViewer] = useState<{
    docId: string;
    title: string;
    reference?: string | null;
    focus?: { page: number | null; bbox: { x: number; y: number; w: number; h: number } | null } | null;
  } | null>(null);

  // Load machine context (schematics, known symptoms, counts)
  useEffect(() => {
    fetch(`/api/equipment/${assetId}/diagnose`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setMeta(d))
      .finally(() => setLoading(false));
  }, [assetId]);

  // Resume an AI diagnosis opened from a deep link / the machine history log
  // (?session=…). Read from location to avoid a Suspense-bound useSearchParams.
  useEffect(() => {
    const sid = new URLSearchParams(window.location.search).get("session");
    if (sid) {
      setResumeSession(sid);
      setPanel("ai");
    }
  }, []);

  // This machine's past AI diagnoses (for the sidebar list).
  useEffect(() => {
    fetch(`/api/equipment/${assetId}/diagnose/chat`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.sessions && setPastSessions(d.sessions))
      .catch(() => {});
  }, [assetId, resumeSession]);

  const runDiagnosis = async (sym?: string) => {
    const s = (sym ?? symptom).trim();
    if (s.length < 2) return;
    setSymptom(s);
    setSearchedSymptom(s);
    setResumeSession(null);
    setDiagnosing(true);
    setLearned({});
    setPanel("engine");
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

  // Schematic *documents* (preparable into tiles) vs external diagram links,   // the diagnose route appends documents with their docType as `type`.
  const schematicDocs = (ctx?.schematics ?? []).filter(
    (s) => s.type === "ELECTRICAL_SCHEMATIC" || s.type === "OPERATIONAL_MANUAL",
  );
  const openOnSchematic = (c: Component) => {
    // Prefer the exact document the component was captured on; else the first
    // electrical schematic. Exact bbox (PDF points) → precise pin in the viewer.
    const doc =
      (c.schematicDocId && schematicDocs.find((s) => s.id === c.schematicDocId)) ||
      schematicDocs.find((s) => s.type === "ELECTRICAL_SCHEMATIC") ||
      schematicDocs[0];
    if (!doc) return;
    const hasBbox = c.bboxX != null && c.bboxY != null && c.bboxW != null && c.bboxH != null;
    setViewer({
      docId: doc.id,
      title: doc.title,
      reference: c.schematicReference,
      focus:
        c.schematicDocId === doc.id && hasBbox
          ? { page: c.schematicPage ?? null, bbox: { x: c.bboxX!, y: c.bboxY!, w: c.bboxW!, h: c.bboxH! } }
          : null,
    });
  };

  if (loading) {
    return (
      <div className="p-6 max-w-6xl w-full mx-auto space-y-6" aria-busy="true" aria-label="Loading diagnostic engine">
        <div className="h-4 w-40 bg-ink-200 rounded animate-pulse" />
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-ink-200 animate-pulse" />
          <div className="space-y-2">
            <div className="h-4 w-48 bg-ink-200 rounded animate-pulse" />
            <div className="h-3 w-64 bg-ink-100 rounded animate-pulse" />
          </div>
        </div>
        <div className="h-28 bg-white border border-ink-200 rounded-xl p-5">
          <div className="h-3 w-56 bg-ink-100 rounded animate-pulse mb-3" />
          <div className="h-11 bg-ink-100 rounded-lg animate-pulse" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div className="h-12 bg-ink-100 rounded-xl animate-pulse" />
            <div className="h-40 bg-white border border-ink-200 rounded-xl animate-pulse" />
          </div>
          <div className="space-y-4">
            <div className="h-32 bg-white border border-ink-200 rounded-xl animate-pulse" />
            <div className="h-48 bg-white border border-ink-200 rounded-xl animate-pulse" />
          </div>
        </div>
      </div>
    );
  }
  if (!meta || (meta as { error?: string }).error) {
    return (
      <div className="p-10 text-center text-ink-500">
        Equipment not found.{" "}
        <Link href="/equipment" className="text-brand-600 hover:underline">Back</Link>
      </div>
    );
  }

  const eq = meta.equipment;

  return (
    <div className="p-6 max-w-6xl w-full mx-auto space-y-6">
      <Link href={`/equipment/${assetId}`} className="inline-flex items-center gap-1.5 text-xs text-ink-500 hover:text-ink-900">
        <ArrowLeft className="w-3.5 h-3.5" /> Back to digital twin
      </Link>

      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-brand-50 text-brand-600 border border-brand-200">
          <Stethoscope className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-xl font-bold tracking-tight text-ink-900">Diagnostic Engine</h2>
          <p className="text-xs text-ink-500 font-mono">
            {eq.name} · {eq.assetId} · learns from {meta.guideCount} guides + {meta.historyCount} historical cases
          </p>
        </div>
      </div>

      {/* Symptom input */}
      <div className="bg-white border border-ink-200 rounded-xl p-5 space-y-3">
        <label className="text-[11px] font-semibold text-ink-500 uppercase tracking-wider">
          Describe the fault, symptom, or error code
        </label>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-ink-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={symptom}
              onChange={(e) => setSymptom(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runDiagnosis()}
              placeholder="e.g. No motion X axis, error E-041"
              className="w-full min-h-[44px] pl-9 pr-3 py-2.5 bg-ink-50 border border-ink-200 rounded-lg text-base sm:text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
            />
          </div>
          <button
            onClick={() => runDiagnosis()}
            disabled={diagnosing || symptom.trim().length < 2}
            className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 bg-brand-600 hover:bg-brand-500 disabled:opacity-60 text-white rounded-lg text-sm font-semibold shrink-0"
          >
            {diagnosing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Diagnose
          </button>
        </div>
        {meta.knownSymptoms.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1 items-center">
            <span className="text-[10px] text-ink-400">Known:</span>
            {meta.knownSymptoms.map((k) => (
              <button
                key={k.id}
                onClick={() => runDiagnosis(k.errorCode ? `${k.symptom} ${k.errorCode}` : k.symptom)}
                className="px-2.5 py-2 rounded-md text-[11px] font-medium bg-ink-100 text-ink-600 hover:bg-brand-50 hover:text-brand-700 border border-ink-200"
              >
                {k.errorCode ? `[${k.errorCode}] ` : ""}{k.symptom}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* One content region, three views, segmented so the technician always
            has a single focus instead of a long mixed scroll. */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center gap-1 bg-ink-100 rounded-xl p-1" role="tablist" aria-label="Diagnosis views">
            {([
              { key: "engine", label: "Engine results", short: "Engine", icon: Stethoscope, count: result?.diagnoses.length ?? null },
              { key: "ai", label: "AI assistant", short: "AI", icon: Sparkles, count: null },
              { key: "docs", label: "Documentation", short: "Docs", icon: BookOpen, count: result?.passages?.length ?? null },
            ] as const).map((t) => {
              const Icon = t.icon;
              const active = panel === t.key;
              return (
                <button
                  key={t.key}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setPanel(t.key)}
                  className={`flex-1 min-h-[44px] px-2 sm:px-3 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors ${
                    active ? "bg-white text-ink-900 shadow-sm" : "text-ink-500 hover:text-ink-800"
                  }`}
                >
                  <Icon className={`w-4 h-4 ${t.key === "ai" ? "text-violet-500" : active ? "text-brand-600" : ""}`} />
                  <span className="hidden sm:inline">{t.label}</span>
                  <span className="sm:hidden">{t.short}</span>
                  {t.count != null && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${active ? "bg-brand-50 text-brand-700" : "bg-ink-200 text-ink-500"}`}>
                      {t.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {panel === "engine" && (!result ? (
            <div className="bg-white border border-ink-200 rounded-xl p-10 text-center text-sm text-ink-400">
              Enter a symptom and run the engine to see ranked probable causes.
            </div>
          ) : result.diagnoses.length === 0 ? (
            <div className="bg-white border border-ink-200 rounded-xl p-10 text-center text-sm text-ink-400">
              No confident match found. Resolve the fault, then record the outcome so the engine learns it.
              {meta.aiReady && (
                <div className="mt-3">
                  <button
                    onClick={() => setPanel("ai")}
                    className="inline-flex items-center gap-1.5 min-h-[44px] px-4 text-xs font-semibold text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-50"
                  >
                    <Sparkles className="w-4 h-4" /> Work it with the AI assistant instead
                  </button>
                </div>
              )}
              <div className="mt-4">
                <NewGuideForm assetId={assetId} symptom={symptom} onDone={() => runDiagnosis()} />
              </div>
            </div>
          ) : (
            result.diagnoses.map((d) => (
              <div key={d.rank} className="bg-white border border-ink-200 rounded-xl overflow-hidden">
                <div className="p-5 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-ink-100 flex items-center justify-center text-sm font-bold text-ink-700 shrink-0">
                        {d.rank}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-ink-900">{d.cause}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className={`text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border ${SOURCE_BADGE[d.source]}`}>
                            {d.source === "GUIDE" ? <BookOpen className="w-2.5 h-2.5 inline mr-1" /> : d.source === "HISTORY" ? <HistoryIcon className="w-2.5 h-2.5 inline mr-1" /> : <Sparkles className="w-2.5 h-2.5 inline mr-1" />}
                            {SOURCE_LABEL[d.source]}
                          </span>
                          {d.errorCode && <span className="text-[10px] font-mono text-ink-500">{d.errorCode}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-lg font-bold text-brand-600">{d.confidence}%</div>
                      <div className="w-16 h-1.5 bg-ink-100 rounded-full overflow-hidden mt-1">
                        <div className="h-full bg-brand-500 rounded-full" style={{ width: `${d.confidence}%` }} />
                      </div>
                    </div>
                  </div>

                  {/* Evidence */}
                  <div className="flex flex-wrap gap-1.5">
                    {d.evidence.map((ev, i) => (
                      <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-ink-50 border border-ink-200 text-ink-600">
                        {ev}
                      </span>
                    ))}
                  </div>

                  {/* Implicated components + schematic refs */}
                  {d.components.length > 0 && (
                    <div className="rounded-lg bg-ink-50 border border-ink-200 p-3 space-y-1.5">
                      <p className="text-[10px] font-semibold text-ink-500 uppercase tracking-wider flex items-center gap-1">
                        <Cpu className="w-3 h-3" /> Check these components
                      </p>
                      {d.components.map((c) => (
                        <div key={c.componentTag} className="flex items-center justify-between text-xs">
                          <span className="text-ink-700">
                            <span className="font-mono font-semibold text-ink-900">{c.componentTag}</span> · {c.name}
                          </span>
                          {c.schematicReference &&
                            (schematicDocs.length > 0 ? (
                              <button
                                onClick={() => openOnSchematic(c)}
                                className="text-[10px] text-brand-700 font-mono flex items-center gap-1 hover:underline"
                                title="View on schematic"
                              >
                                <MapPin className="w-3 h-3" /> {c.schematicReference}
                              </button>
                            ) : (
                              <span className="text-[10px] text-brand-700 font-mono flex items-center gap-1">
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
                      <p className="text-[10px] font-semibold text-ink-500 uppercase tracking-wider">Diagnostic steps</p>
                      {d.steps.map((s, i) => (
                        <label key={i} className="flex items-start gap-2 text-xs text-ink-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!checked[d.rank]?.[i]}
                            onChange={() => toggleStep(d.rank, i)}
                            className="accent-brand-600 w-3.5 h-3.5 mt-0.5"
                          />
                          <span className={checked[d.rank]?.[i] ? "line-through text-ink-400" : ""}>{s}</span>
                        </label>
                      ))}
                    </div>
                  )}

                  {d.resolution && (
                    <p className="text-xs text-ink-600 bg-brand-50 border border-brand-200 rounded-lg px-3 py-2">
                      <span className="font-semibold text-brand-700">Resolution:</span> {d.resolution}
                    </p>
                  )}

                  {/* History refs */}
                  {d.historyRefs.length > 0 && (
                    <div className="text-[10px] text-ink-400 font-mono">
                      History: {d.historyRefs.map((h) => `${h.cmrf}${h.parts ? ` (${h.parts})` : ""}`).join(" · ")}
                    </div>
                  )}
                </div>

                {/* Learn / confirm */}
                <div className="border-t border-ink-200 px-5 py-3 flex items-center justify-between bg-ink-50/50">
                  {learned[d.rank] ? (
                    <span className="text-xs text-brand-700 font-medium flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" /> {learned[d.rank]}
                    </span>
                  ) : (
                    <>
                      <span className="text-[11px] text-ink-500">Was this the cause? Confirm to teach the engine.</span>
                      <button
                        onClick={() => resolveWith(d)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-semibold"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> This resolved it
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))
          ))}

          {/* AI diagnosis, chat-style, evidence-grounded, guardrailed server-side */}
          {panel === "ai" && (meta.aiReady ? (
            <div className="bg-white border border-violet-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-violet-100 bg-violet-50/50 flex items-center gap-2 flex-wrap">
                <Sparkles className="w-4 h-4 text-violet-600" />
                <h3 className="text-sm font-semibold text-ink-900">AI diagnosis</h3>
                <span className="text-[10px] text-ink-400">chat with the assistant, step by step</span>
                <span className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-warn-500/10 text-warn-700 border-warn-500/20">
                  Verify before acting
                </span>
              </div>
              <DiagnosisChat
                key={searchedSymptom || resumeSession || "chat"}
                assetId={assetId}
                symptom={searchedSymptom || symptom}
                resumeSessionId={resumeSession}
              />
            </div>
          ) : (
            <div className="bg-white border border-ink-200 rounded-xl p-10 text-center text-sm text-ink-400">
              No AI provider is configured. Add an API key in{" "}
              <Link href="/settings?tab=ai" className="text-brand-600 hover:underline">App Settings → AI Providers</Link> to enable the assistant.
            </div>
          ))}

          {/* Manuals & procedure passages (FTS over document_chunks) */}
          {panel === "docs" && (!result || (result.passages?.length ?? 0) === 0 ? (
            <div className="bg-white border border-ink-200 rounded-xl p-10 text-center text-sm text-ink-400">
              {!result
                ? "Run a diagnosis first, matching manual and procedure passages appear here."
                : "No documentation passages matched this symptom."}
            </div>
          ) : (
            <div className="bg-white border border-ink-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-ink-200 flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-info-600" />
                <h3 className="text-sm font-semibold text-ink-900">Relevant documentation</h3>
                <span className="text-[10px] text-ink-400">manuals &amp; maintenance procedure</span>
              </div>
              <div className="divide-y divide-ink-100">
                {result.passages!.map((p) => (
                  <div key={p.id} className="px-5 py-3 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold text-ink-700 truncate">
                        {p.sourceLabel}
                        {p.heading ? <span className="text-ink-400 font-normal"> · {p.heading}</span> : null}
                      </span>
                      {p.pageStart != null && (
                        <span className="text-[10px] font-mono text-ink-400 shrink-0">
                          p.{p.pageStart}{p.pageEnd && p.pageEnd !== p.pageStart ? `-${p.pageEnd}` : ""}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-ink-600 leading-relaxed">
                      <Snippet text={p.snippet} />
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Schematics + component sidebar */}
        <div className="space-y-4">
          <div className="bg-white border border-ink-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-ink-900 mb-3 flex items-center gap-2">
              <FileText className="w-4 h-4 text-brand-600" /> Schematics to consult
            </h3>
            {ctx && ctx.schematics.length > 0 ? (
              <div className="space-y-2">
                {ctx.schematics.map((s) =>
                  s.type === "ELECTRICAL_SCHEMATIC" || s.type === "OPERATIONAL_MANUAL" ? (
                    <button
                      key={s.id}
                      onClick={() => setViewer({ docId: s.id, title: s.title })}
                      className="w-full flex items-center justify-between p-2.5 rounded-lg border border-ink-200 hover:bg-ink-50 text-xs text-left"
                      title="Open tiled viewer"
                    >
                      <span className="text-ink-700 truncate">{s.title}</span>
                      <span className="text-[10px] font-mono text-ink-400 shrink-0 ml-2">{s.type.replace(/_/g, " ")}</span>
                    </button>
                  ) : (
                    s.fileUrl && !s.fileUrl.startsWith("#") ? (
                      <a
                        key={s.id}
                        href={s.fileUrl}
                        className="flex items-center justify-between p-2.5 rounded-lg border border-ink-200 hover:bg-ink-50 text-xs"
                      >
                        <span className="text-ink-700 truncate">{s.title}</span>
                        <span className="text-[10px] font-mono text-ink-400 shrink-0 ml-2">{s.type.replace(/_/g, " ")}</span>
                      </a>
                    ) : (
                      <div key={s.id} className="flex items-center justify-between p-2.5 rounded-lg border border-ink-100 text-xs opacity-60">
                        <span className="text-ink-500 truncate">{s.title}</span>
                        <span className="text-[10px] font-mono text-ink-400 shrink-0 ml-2">no file</span>
                      </div>
                    )
                  ),
                )}
              </div>
            ) : (
              <p className="text-xs text-ink-400">No schematics on file.</p>
            )}
          </div>

          {pastSessions.length > 0 && (
            <div className="bg-white border border-ink-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-ink-900 mb-3 flex items-center gap-2">
                <HistoryIcon className="w-4 h-4 text-violet-600" /> Past AI diagnoses
              </h3>
              <div className="space-y-1.5">
                {pastSessions.slice(0, 8).map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setResumeSession(s.id)}
                    className={`w-full text-left p-2.5 rounded-lg border transition-colors ${
                      resumeSession === s.id ? "border-violet-300 bg-violet-50" : "border-ink-200 hover:bg-ink-50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-ink-800 truncate">{s.symptom}</span>
                      <span
                        className={`text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded-full border shrink-0 ${
                          s.status === "RESOLVED"
                            ? "bg-brand-500/10 text-brand-700 border-brand-500/20"
                            : s.status === "OPEN"
                              ? "bg-warn-500/10 text-warn-700 border-warn-500/20"
                              : "bg-ink-100 text-ink-500 border-ink-200"
                        }`}
                      >
                        {s.status}
                      </span>
                    </div>
                    {s.resolvedCause && (
                      <p className="text-[10px] text-ink-500 truncate mt-0.5">→ {s.resolvedCause}</p>
                    )}
                    <p className="text-[10px] text-ink-400 mt-0.5">
                      {s.startedByName ?? "-"} · {(s.createdAt ?? "").slice(0, 10)}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white border border-ink-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-ink-900 mb-3 flex items-center gap-2">
              <Cpu className="w-4 h-4 text-brand-600" /> Component registry (BOM)
            </h3>
            {ctx && ctx.components.length > 0 ? (
              <div className="space-y-2">
                {ctx.components.map((c) => (
                  <div key={c.componentTag} className="text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-semibold text-ink-900">{c.componentTag}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded border ${c.status === "FAULTY" ? "bg-danger-50 text-danger-700 border-danger-200" : "bg-brand-50 text-brand-700 border-brand-200"}`}>
                        {c.status ?? "-"}
                      </span>
                    </div>
                    <p className="text-ink-500">{c.name}</p>
                    {c.schematicReference && (
                      <p className="text-[10px] text-ink-400 font-mono flex items-center gap-1">
                        <MapPin className="w-2.5 h-2.5" /> {c.schematicReference} · {c.location}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-ink-400">No components registered.</p>
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
          focus={viewer.focus}
          onComponentsChanged={() => {
            // Registry changed (extraction confirm / click-to-tag), refresh
            // the machine context so new components flow into diagnoses.
            fetch(`/api/equipment/${assetId}/diagnose`)
              .then((r) => (r.ok ? r.json() : null))
              .then((d) => d && setMeta(d));
          }}
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
        className="w-full px-3 py-2 bg-ink-50 border border-ink-200 rounded-lg text-sm text-ink-900 focus:outline-none focus:border-brand-500/40"
      />
      <input
        value={resolution}
        onChange={(e) => setResolution(e.target.value)}
        placeholder="Resolution action…"
        className="w-full px-3 py-2 bg-ink-50 border border-ink-200 rounded-lg text-sm text-ink-900 focus:outline-none focus:border-brand-500/40"
      />
      <button
        onClick={save}
        disabled={saving || !cause.trim()}
        className="w-full px-4 py-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-60 text-white rounded-lg text-xs font-semibold"
      >
        {saving ? "Teaching…" : "Teach the engine this resolution"}
      </button>
    </div>
  );
}
