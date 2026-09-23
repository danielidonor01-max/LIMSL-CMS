// src/app/equipment/[assetId]/troubleshoot/page.tsx
"use client";

import Button from "@/components/Button";
import { PAGE_MAIN } from "@/lib/page-shell";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import SchematicViewer from "@/components/SchematicViewer";
import DiagnosisChat from "@/components/DiagnosisChat";
import PageHeader from "@/components/PageHeader";
import Tabs from "@/components/Tabs";
import EmptyState from "@/components/EmptyState";
import Field, { FIELD_CLASS } from "@/components/Field";
import { Badge } from "@/components/Badge";
import {
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
          <mark key={i} className="bg-warn-100 text-ink-900 rounded-lg px-0.5">{p}</mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </span>
  );
}

const SOURCE_BADGE: Record<string, string> = {
  GUIDE: "bg-info-500/10 text-info-700 border-info-500/20",
  HISTORY: "bg-violet-500/10 text-violet-700 border-violet-500/20",
  "GUIDE+HISTORY": "bg-brand-500/10 text-brand-700 border-brand-500/20",
};
const SOURCE_LABEL: Record<string, string> = {
  GUIDE: "Guide",
  HISTORY: "Learned from history",
  "GUIDE+HISTORY": "Guide and history",
};

// The document kind was rendered by replacing underscores with spaces, so the
// panel listed "ELECTRICAL SCHEMATIC" in shouting caps beside its own title.
const DOC_KIND: Record<string, string> = {
  ELECTRICAL_SCHEMATIC: "Schematic",
  OPERATIONAL_MANUAL: "Manual",
};

const SESSION_BADGE: Record<string, string> = {
  RESOLVED: "bg-brand-500/10 text-brand-700 border-brand-500/20",
  OPEN: "bg-warn-500/10 text-warn-700 border-warn-500/20",
  ABANDONED: "bg-ink-500/10 text-ink-600 border-ink-500/20",
};
const SESSION_LABEL: Record<string, string> = {
  RESOLVED: "Resolved",
  OPEN: "Open",
  ABANDONED: "Abandoned",
};

// What the engine has to work with, said in a way that survives a zero. The
// template it replaced produced "drawn from 0 guides and 3 past cases", which
// advertises the emptiest half of the answer.
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
function learnedFrom(guides: number, history: number): string {
  const parts: string[] = [];
  if (guides > 0) parts.push(plural(guides, "guide", "guides"));
  if (history > 0) parts.push(plural(history, "past case", "past cases"));
  if (parts.length === 0) {
    return "Nothing has been recorded against this machine yet, so the engine has nothing to rank. Record what you find and it will know next time.";
  }
  return `Ranked causes drawn from ${parts.join(" and ")} on this machine.`;
}

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
      <div className={PAGE_MAIN.register} aria-busy="true" aria-label="Loading diagnostic engine">
        <div className="h-3 w-40 bg-ink-200 rounded-lg animate-pulse" />
        <div className="space-y-3">
          <div className="h-8 w-72 bg-ink-200 rounded-lg animate-pulse" />
          <div className="h-4 w-96 max-w-full bg-ink-100 rounded-lg animate-pulse" />
        </div>
        <div className="bg-surface border border-line rounded-xl shadow-card p-6 space-y-3">
          <div className="h-4 w-64 bg-ink-100 rounded-lg animate-pulse" />
          <div className="h-11 bg-ink-100 rounded-lg animate-pulse" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="h-10 border-b border-line animate-pulse" />
            <div className="h-40 bg-surface border border-line rounded-xl shadow-card animate-pulse" />
          </div>
          <div className="space-y-6">
            <div className="h-32 bg-surface border border-line rounded-xl shadow-card animate-pulse" />
            <div className="h-48 bg-surface border border-line rounded-xl shadow-card animate-pulse" />
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
    <div className={PAGE_MAIN.register}>
      <PageHeader
        title="Diagnostic engine"
        subtitle={`${eq.name}. ${learnedFrom(meta.guideCount, meta.historyCount)}`}
        code={eq.assetId}
        backHref={`/equipment/${assetId}`}
        backLabel="Back to the digital twin"
      />

      {/* What the page is for, so it leads rather than sitting in a card among
          cards. The symptom is the only thing that has to be entered, and
          everything below it is a consequence of what goes in here. */}
      <div className="bg-surface border border-line rounded-xl shadow-card p-6 space-y-4">
        <Field
          label="Describe the fault, symptom or error code"
          htmlFor="symptom"
          help="Plain words work as well as a code: “X axis will not move”, “E-041”, “bearing noise under load”."
        >
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-ink-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="symptom"
                value={symptom}
                onChange={(e) => setSymptom(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runDiagnosis()}
                placeholder="e.g. No motion X axis, error E-041"
                className={`${FIELD_CLASS} min-h-11 pl-9`}
              />
            </div>
            <Button
              size="lg"
              className="shrink-0"
              onClick={() => runDiagnosis()}
              disabled={symptom.trim().length < 2}
              loading={diagnosing}
              icon={Stethoscope}
            >
              Diagnose
            </Button>
          </div>
        </Field>

        {meta.knownSymptoms.length > 0 && (
          <div className="pt-1 border-t border-line">
            <p className="text-xs text-ink-500 pt-3">Already seen on this machine</p>
            <div className="flex flex-wrap gap-2 mt-2">
              {meta.knownSymptoms.map((k) => (
                <button
                  key={k.id}
                  onClick={() => runDiagnosis(k.errorCode ? `${k.symptom} ${k.errorCode}` : k.symptom)}
                  className="px-3 py-1.5 rounded-full text-xs font-medium bg-ink-50 text-ink-700 hover:bg-brand-50 hover:text-brand-700 hover:border-brand-200 border border-line transition-colors"
                >
                  {k.errorCode ? `${k.errorCode} · ` : ""}{k.symptom}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* One content region, three views, so the technician always has a
            single focus instead of a long mixed scroll. The pill strip these
            used to be was a fourth way of drawing tabs in an app that had
            already settled on one. */}
        <div className="lg:col-span-2 space-y-6">
          <Tabs
            ariaLabel="Diagnosis views"
            value={panel}
            onChange={setPanel}
            items={[
              { value: "engine", label: "Engine results", count: result?.diagnoses.length },
              { value: "ai", label: "AI assistant" },
              { value: "docs", label: "Documentation", count: result?.passages?.length },
            ]}
          />

          {panel === "engine" && (!result ? (
            <div className="bg-surface border border-line rounded-xl shadow-card">
              <EmptyState
                icon={Stethoscope}
                title="Nothing diagnosed yet"
                message="Describe the fault above and run the engine. It ranks probable causes from this machine's guides and its repair history."
              />
            </div>
          ) : result.diagnoses.length === 0 ? (
            <div className="bg-surface border border-line rounded-xl shadow-card">
              <EmptyState
                icon={Stethoscope}
                title="No confident match"
                message={`Nothing in this machine's guides or history matches “${searchedSymptom}”. Work it through with the assistant, or record the cause once you find it so the engine knows it next time.`}
                actionLabel={meta.aiReady ? "Work it with the AI assistant" : undefined}
                onAction={meta.aiReady ? () => setPanel("ai") : undefined}
              />
              <div className="px-6 pb-6 -mt-4">
                <NewGuideForm assetId={assetId} symptom={symptom} onDone={() => runDiagnosis()} />
              </div>
            </div>
          ) : (
            result.diagnoses.map((d) => (
              <div key={d.rank} className="bg-surface border border-line rounded-xl shadow-card overflow-hidden">
                <div className="px-6 py-5 space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0">
                      <span className="w-7 h-7 rounded-full bg-ink-100 border border-line grid place-items-center text-xs font-semibold text-ink-700 shrink-0">
                        {d.rank}
                      </span>
                      <div className="min-w-0">
                        <p className="text-base font-semibold text-ink-900 leading-snug">{d.cause}</p>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <Badge className={SOURCE_BADGE[d.source]}>
                            {d.source === "GUIDE" ? <BookOpen className="w-3.5 h-3.5" /> : d.source === "HISTORY" ? <HistoryIcon className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5" />}
                            {SOURCE_LABEL[d.source]}
                          </Badge>
                          {d.errorCode && <span className="text-xs text-ink-500">{d.errorCode}</span>}
                        </div>
                      </div>
                    </div>
                    {/* A confidence figure is a measure, and a measure wants a
                        label. It sat as a bare "72%" in brand green, which in
                        a list of four reads as a score somebody is proud of
                        rather than as how sure the engine is. */}
                    <div className="text-right shrink-0 w-20">
                      <div className="text-xl font-semibold text-ink-900 tabular-nums leading-none">
                        {d.confidence}%
                      </div>
                      <div className="text-xs text-ink-500 mt-1">confident</div>
                      <div className="h-1 bg-ink-200 rounded-full overflow-hidden mt-1.5">
                        <div className="h-full bg-brand-500 rounded-full" style={{ width: `${d.confidence}%` }} />
                      </div>
                    </div>
                  </div>

                  {/* Evidence */}
                  {d.evidence.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {d.evidence.map((ev, i) => (
                        <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-ink-50 border border-line text-ink-600">
                          {ev}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Implicated components + schematic refs */}
                  {d.components.length > 0 && (
                    <div className="rounded-lg bg-ink-50 border border-line p-4 space-y-2">
                      <p className="text-sm font-semibold text-ink-700 flex items-center gap-1.5">
                        <Cpu className="w-4 h-4 text-ink-400" /> Check these components
                      </p>
                      {d.components.map((c) => (
                        <div key={c.componentTag} className="flex items-center justify-between gap-3 text-sm">
                          <span className="text-ink-700 min-w-0 truncate">
                            <span className="font-semibold text-ink-900">{c.componentTag}</span> · {c.name}
                          </span>
                          {c.schematicReference &&
                            (schematicDocs.length > 0 ? (
                              <button
                                onClick={() => openOnSchematic(c)}
                                className="text-xs font-medium text-brand-700 flex items-center gap-1 hover:underline shrink-0"
                                title="View on schematic"
                              >
                                <MapPin className="w-3.5 h-3.5" /> {c.schematicReference}
                              </button>
                            ) : (
                              <span className="text-xs text-ink-500 flex items-center gap-1 shrink-0">
                                <MapPin className="w-3.5 h-3.5" /> {c.schematicReference}
                              </span>
                            ))}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Diagnostic steps */}
                  {d.steps.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-ink-700">Diagnostic steps</p>
                      <div className="space-y-1.5">
                        {d.steps.map((s, i) => (
                          <label key={i} className="flex items-start gap-2.5 text-sm text-ink-700 cursor-pointer leading-relaxed">
                            <input
                              type="checkbox"
                              checked={!!checked[d.rank]?.[i]}
                              onChange={() => toggleStep(d.rank, i)}
                              className="accent-brand-600 w-4 h-4 mt-0.5 shrink-0"
                            />
                            <span className={checked[d.rank]?.[i] ? "line-through text-ink-400" : ""}>{s}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {d.resolution && (
                    <p className="text-sm text-ink-700 bg-brand-50 border border-brand-200 rounded-lg px-4 py-3 leading-relaxed">
                      <span className="font-semibold text-brand-800">Resolution</span> · {d.resolution}
                    </p>
                  )}

                  {/* History refs */}
                  {d.historyRefs.length > 0 && (
                    <p className="text-xs text-ink-500">
                      Seen before: {d.historyRefs.map((h) => `${h.cmrf}${h.parts ? ` (${h.parts})` : ""}`).join(" · ")}
                    </p>
                  )}
                </div>

                {/* Learn / confirm */}
                <div className="border-t border-line px-6 py-4 flex items-center justify-between gap-4 flex-wrap bg-ink-50">
                  {learned[d.rank] ? (
                    <span className="text-sm text-brand-700 font-medium flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" /> {learned[d.rank]}
                    </span>
                  ) : (
                    <>
                      <span className="text-sm text-ink-600">Was this the cause? Confirming teaches the engine.</span>
                      <Button size="sm" onClick={() => resolveWith(d)} icon={CheckCircle2}>
                        This resolved it
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))
          ))}

          {/* AI diagnosis, chat-style, evidence-grounded, guardrailed server-side.
              Violet is the AI identity accent and it stays on the identity:
              the panel is a panel like any other, not a purple region of the
              app, or the assistant starts to look like a different product. */}
          {panel === "ai" && (meta.aiReady ? (
            <div className="bg-surface border border-line rounded-xl shadow-card overflow-hidden">
              <div className="px-6 py-4 border-b border-line flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-ink-900 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-violet-600 shrink-0" /> AI assistant
                  </h3>
                  <p className="text-xs text-ink-500 mt-1">
                    Works the fault with you, one step at a time, grounded in this machine&apos;s own records.
                  </p>
                </div>
                <Badge className="bg-warn-500/10 text-warn-700 border-warn-500/20">Verify before acting</Badge>
              </div>
              <DiagnosisChat
                key={searchedSymptom || resumeSession || "chat"}
                assetId={assetId}
                symptom={searchedSymptom || symptom}
                resumeSessionId={resumeSession}
              />
            </div>
          ) : (
            <div className="bg-surface border border-line rounded-xl shadow-card">
              <EmptyState
                icon={Sparkles}
                title="No AI provider is configured"
                message="The assistant needs an API key before it can answer. A Super Admin adds one in App Settings."
                blockedBy={{ label: "Open App Settings → AI providers", href: "/settings?tab=ai" }}
              />
            </div>
          ))}

          {/* Manuals & procedure passages (FTS over document_chunks) */}
          {panel === "docs" && (!result || (result.passages?.length ?? 0) === 0 ? (
            <div className="bg-surface border border-line rounded-xl shadow-card">
              <EmptyState
                icon={BookOpen}
                title={!result ? "Nothing to show yet" : "No matching passages"}
                message={
                  !result
                    ? "Run a diagnosis and the matching passages from this machine's manuals and the maintenance procedure appear here."
                    : `Nothing in the manuals or the maintenance procedure matched “${searchedSymptom}”.`
                }
              />
            </div>
          ) : (
            <div className="bg-surface border border-line rounded-xl shadow-card overflow-hidden">
              <div className="px-6 py-4 border-b border-line">
                <h3 className="text-base font-semibold text-ink-900 flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-info-600 shrink-0" /> Relevant documentation
                </h3>
                <p className="text-xs text-ink-500 mt-1">Manuals and the maintenance procedure</p>
              </div>
              <div className="divide-y divide-line">
                {result.passages!.map((p) => (
                  <div key={p.id} className="px-6 py-4 space-y-1.5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold text-ink-900 truncate">
                        {p.sourceLabel}
                        {p.heading ? <span className="text-ink-500 font-normal"> · {p.heading}</span> : null}
                      </span>
                      {p.pageStart != null && (
                        <span className="text-xs text-ink-500 shrink-0 tabular-nums">
                          p. {p.pageStart}{p.pageEnd && p.pageEnd !== p.pageStart ? `–${p.pageEnd}` : ""}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-ink-600 leading-relaxed">
                      <Snippet text={p.snippet} />
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Schematics + component sidebar */}
        <div className="space-y-6">
          <SidePanel icon={FileText} title="Schematics to consult">
            {ctx && ctx.schematics.length > 0 ? (
              <div className="space-y-1.5">
                {ctx.schematics.map((s) =>
                  s.type === "ELECTRICAL_SCHEMATIC" || s.type === "OPERATIONAL_MANUAL" ? (
                    <button
                      key={s.id}
                      onClick={() => setViewer({ docId: s.id, title: s.title })}
                      className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border border-line hover:bg-ink-50 hover:border-ink-300 text-left transition-colors"
                      title="Open tiled viewer"
                    >
                      <span className="text-sm text-ink-800 truncate">{s.title}</span>
                      <span className="text-xs text-ink-500 shrink-0">{DOC_KIND[s.type] ?? "Document"}</span>
                    </button>
                  ) : (
                    s.fileUrl && !s.fileUrl.startsWith("#") ? (
                      <a
                        key={s.id}
                        href={s.fileUrl}
                        className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border border-line hover:bg-ink-50 hover:border-ink-300 transition-colors"
                      >
                        <span className="text-sm text-ink-800 truncate">{s.title}</span>
                        <span className="text-xs text-ink-500 shrink-0">{DOC_KIND[s.type] ?? "Document"}</span>
                      </a>
                    ) : (
                      <div key={s.id} className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border border-line">
                        <span className="text-sm text-ink-500 truncate">{s.title}</span>
                        <span className="text-xs text-ink-400 shrink-0">No file</span>
                      </div>
                    )
                  ),
                )}
              </div>
            ) : (
              <p className="text-sm text-ink-500">No schematics are on file for this machine.</p>
            )}
          </SidePanel>

          {pastSessions.length > 0 && (
            <SidePanel icon={HistoryIcon} title="Past AI diagnoses" iconClass="text-violet-600">
              <div className="space-y-1.5">
                {pastSessions.slice(0, 8).map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setResumeSession(s.id)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${
 resumeSession === s.id ? "border-violet-300 bg-violet-50" : "border-line hover:bg-ink-50 hover:border-ink-300"
 }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm text-ink-800 truncate">{s.symptom}</span>
                      <Badge className={SESSION_BADGE[s.status] ?? "bg-ink-500/10 text-ink-600 border-ink-500/20"}>
                        {SESSION_LABEL[s.status] ?? s.status.toLowerCase()}
                      </Badge>
                    </div>
                    {s.resolvedCause && (
                      <p className="text-xs text-ink-600 truncate mt-1">Cause: {s.resolvedCause}</p>
                    )}
                    <p className="text-xs text-ink-500 mt-0.5">
                      {s.startedByName ?? "Unknown"} · {(s.createdAt ?? "").slice(0, 10)}
                    </p>
                  </button>
                ))}
              </div>
            </SidePanel>
          )}

          <SidePanel icon={Cpu} title="Component registry">
            {ctx && ctx.components.length > 0 ? (
              <div className="divide-y divide-line -my-2">
                {ctx.components.map((c) => (
                  <div key={c.componentTag} className="py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-ink-900 truncate">{c.componentTag}</span>
                      <Badge
                        className={
                          c.status === "FAULTY"
                            ? "bg-danger-500/10 text-danger-700 border-danger-500/20"
                            : "bg-brand-500/10 text-brand-700 border-brand-500/20"
                        }
                      >
                        {(c.status ?? "unknown").toLowerCase()}
                      </Badge>
                    </div>
                    <p className="text-sm text-ink-600 mt-0.5">{c.name}</p>
                    {c.schematicReference && (
                      <p className="text-xs text-ink-500 flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3.5 h-3.5 shrink-0" /> {c.schematicReference}
                        {c.location ? ` · ${c.location}` : ""}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink-500">No components have been registered for this machine.</p>
            )}
          </SidePanel>
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

// A panel in the right-hand column. Three of these were three copies of the
// same header markup, which is how the headings had drifted to three weights.
function SidePanel({
  icon: Icon,
  title,
  iconClass = "text-brand-600",
  children,
}: {
  icon: React.ElementType;
  title: string;
  iconClass?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-surface border border-line rounded-xl shadow-card overflow-hidden">
      <h3 className="px-5 py-3.5 border-b border-line text-base font-semibold text-ink-900 flex items-center gap-2">
        <Icon className={`w-4 h-4 shrink-0 ${iconClass}`} /> {title}
      </h3>
      <div className="px-5 py-4">{children}</div>
    </section>
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
    <div className="max-w-md mx-auto text-left space-y-3 rounded-lg border border-line bg-ink-50 p-4">
      <p className="text-sm font-semibold text-ink-900">Teach the engine</p>
      <Field label="Verified root cause" htmlFor="new-guide-cause" required>
        <input
          id="new-guide-cause"
          value={cause}
          onChange={(e) => setCause(e.target.value)}
          placeholder="What it actually turned out to be"
          className={`${FIELD_CLASS} bg-surface`}
        />
      </Field>
      <Field label="Resolution action" htmlFor="new-guide-resolution">
        <input
          id="new-guide-resolution"
          value={resolution}
          onChange={(e) => setResolution(e.target.value)}
          placeholder="What fixed it"
          className={`${FIELD_CLASS} bg-surface`}
        />
      </Field>
      <Button fullWidth onClick={save} loading={saving} disabled={saving || !cause.trim()}>
        {saving ? "Teaching…" : "Save it as a guide"}
      </Button>
    </div>
  );
}
