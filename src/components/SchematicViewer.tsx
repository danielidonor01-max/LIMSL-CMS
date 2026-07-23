// src/components/SchematicViewer.tsx
// Schematic viewer + P2-lite component capture (docs/TROUBLESHOOTING-ENGINE.md).
// - View: whole-page preview → click anywhere to zoom into the native-resolution
//   tile (dense sheets stay legible). "Sheet N, Zone C2" references open the
//   right sheet with an approximate zone highlight; components captured with an
//   exact bounding box get a precise pin instead.
// - Review: "Extract components" reads the PDF's text layer (no AI, no API key),
//   lists tag candidates with editable name/type, pins them on the sheet, and a
//   human confirms them into the component registry.
// - Click-to-tag: in the zoomed tile, tag anything the text layer missed.
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  X, ZoomIn, ArrowLeft, ChevronLeft, ChevronRight, Loader2, Grid2x2,
  MapPin, ScanSearch, CheckCircle2, Crosshair,
} from "lucide-react";
import { toast } from "sonner";
import Button from "@/components/Button";
import { classifyTag } from "@/lib/diagnostics/extract-tags";

type Tile = { tileKey: string; x: number; y: number; w: number; h: number; url: string };
type PageData = {
  page: number;
  pageWidth: number;
  pageHeight: number;
  dpi: number;
  preview: { url: string } | null;
  tiles: Tile[];
};
type Candidate = {
  tag: string;
  name: string;
  type: string;
  page: number;
  bbox: { x: number; y: number; w: number; h: number };
  occurrences: number;
  include?: boolean;
};

export type SchematicFocus = { page: number | null; bbox: { x: number; y: number; w: number; h: number } | null };

const ZONE_COLS = 8;
const ZONE_ROWS = 4;
const TYPES = ["ELECTRICAL", "CONTROL", "HYDRAULIC", "PNEUMATIC", "MECHANICAL"];

function parseReference(ref?: string | null): { sheet: number | null; zoneRow: number | null; zoneCol: number | null } {
  if (!ref) return { sheet: null, zoneRow: null, zoneCol: null };
  const sheet = /sheet\s*(\d+)/i.exec(ref)?.[1];
  const zone = /zone\s*([A-Z])\s*-?\s*(\d+)/i.exec(ref);
  return {
    sheet: sheet ? parseInt(sheet, 10) : null,
    zoneRow: zone ? zone[1].toUpperCase().charCodeAt(0) - 65 : null,
    zoneCol: zone ? parseInt(zone[2], 10) - 1 : null,
  };
}

// PDF-point bbox → CSS % rect on the rendered page (pts × dpi/72 = px).
function ptsToPct(bbox: { x: number; y: number; w: number; h: number }, p: PageData) {
  const s = p.dpi / 72;
  return {
    left: `${((bbox.x * s) / p.pageWidth) * 100}%`,
    top: `${((bbox.y * s) / p.pageHeight) * 100}%`,
    width: `${Math.max(0.6, ((bbox.w * s) / p.pageWidth) * 100)}%`,
    height: `${Math.max(0.6, ((bbox.h * s) / p.pageHeight) * 100)}%`,
  };
}

export default function SchematicViewer({
  assetId,
  documentId,
  title,
  schematicReference,
  focus,
  onComponentsChanged,
  onClose,
}: {
  assetId: string;
  documentId: string;
  title: string;
  schematicReference?: string | null;
  focus?: SchematicFocus | null;
  onComponentsChanged?: () => void;
  onClose: () => void;
}) {
  const [pages, setPages] = useState<PageData[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageIdx, setPageIdx] = useState(0);
  const [zoomTile, setZoomTile] = useState<Tile | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [prepProgress, setPrepProgress] = useState<{ prepared: number; total: number } | null>(null);

  // Review mode (text-layer extraction)
  const [reviewing, setReviewing] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [confirming, setConfirming] = useState(false);

  // Click-to-tag (zoom view)
  const [tagMode, setTagMode] = useState(false);
  const [tagDraft, setTagDraft] = useState<{ pt: { x: number; y: number }; tag: string; name: string; type: string } | null>(null);
  const [savingTag, setSavingTag] = useState(false);

  const ref = useMemo(() => parseReference(schematicReference), [schematicReference]);

  const load = async () => {
    setLoading(true);
    try {
      const d = await fetch(`/api/equipment/${assetId}/schematics/tiles?documentId=${documentId}`).then((r) => r.json());
      const ps: PageData[] = d.pages ?? [];
      setPages(ps);
      const target = focus?.page ?? ref.sheet;
      if (target) {
        const i = ps.findIndex((p) => p.page === target);
        if (i >= 0) setPageIdx(i);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetId, documentId]);

  const prepare = async () => {
    setPreparing(true);
    try {
      for (let guard = 0; guard < 60; guard++) {
        const res = await fetch(`/api/equipment/${assetId}/schematics/tiles`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ documentId }),
        });
        const d = await res.json();
        if (!res.ok) {
          toast.error(d.error || "Preparation failed.");
          return;
        }
        setPrepProgress({ prepared: d.preparedPages.length, total: d.totalPages });
        if (d.done) break;
      }
      toast.success("Schematic prepared for viewing.");
      await load();
    } finally {
      setPreparing(false);
      setPrepProgress(null);
    }
  };

  const runExtraction = async () => {
    setExtracting(true);
    try {
      const res = await fetch(`/api/equipment/${assetId}/schematics/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || "Extraction failed.");
        return;
      }
      if (d.job.status !== "NEEDS_REVIEW") {
        toast.error(d.job.error || "No component tags found in the text layer.");
        return;
      }
      setJobId(d.job.id);
      setCandidates((d.job.data.candidates as Candidate[]).map((c) => ({ ...c, include: true })));
      setReviewing(true);
      setZoomTile(null);
      toast.success(`${d.job.data.candidates.length} candidate components found — review and confirm.`);
    } finally {
      setExtracting(false);
    }
  };

  const confirmCandidates = async () => {
    const chosen = candidates.filter((c) => c.include);
    if (!jobId || chosen.length === 0) {
      toast.error("Select at least one component.");
      return;
    }
    setConfirming(true);
    try {
      const res = await fetch(`/api/equipment/${assetId}/schematics/extract/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, components: chosen }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || "Confirm failed.");
        return;
      }
      toast.success(`${d.confirmed} components saved to the registry (${d.created} new, ${d.updated} updated).`);
      setReviewing(false);
      setCandidates([]);
      onComponentsChanged?.();
    } finally {
      setConfirming(false);
    }
  };

  const saveTag = async () => {
    const current = pages?.[pageIdx];
    if (!tagDraft || !current) return;
    if (!tagDraft.tag.trim()) {
      toast.error("Enter the component tag.");
      return;
    }
    setSavingTag(true);
    try {
      const res = await fetch(`/api/equipment/${assetId}/components`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          componentTag: tagDraft.tag.trim(),
          name: tagDraft.name.trim() || "Component",
          type: tagDraft.type,
          schematicReference: `Sheet ${current.page}`,
          schematicDocId: documentId,
          schematicPage: current.page,
          bbox: { x: tagDraft.pt.x - 20, y: tagDraft.pt.y - 8, w: 40, h: 16 },
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        toast.error(d.error || "Failed to save component.");
        return;
      }
      toast.success(`${tagDraft.tag.trim()} added to the component registry.`);
      setTagDraft(null);
      setTagMode(false);
      onComponentsChanged?.();
    } finally {
      setSavingTag(false);
    }
  };

  const current = pages?.[pageIdx] ?? null;

  const onPreviewClick = (ev: React.MouseEvent<HTMLImageElement>) => {
    if (!current) return;
    const rect = ev.currentTarget.getBoundingClientRect();
    const px = ((ev.clientX - rect.left) / rect.width) * current.pageWidth;
    const py = ((ev.clientY - rect.top) / rect.height) * current.pageHeight;
    const containing = current.tiles.filter((t) => px >= t.x && px <= t.x + t.w && py >= t.y && py <= t.y + t.h);
    if (!containing.length) return;
    const best = containing.sort(
      (a, b) =>
        Math.hypot(a.x + a.w / 2 - px, a.y + a.h / 2 - py) - Math.hypot(b.x + b.w / 2 - px, b.y + b.h / 2 - py),
    )[0];
    setZoomTile(best);
  };

  const onZoomClick = (ev: React.MouseEvent<HTMLImageElement>) => {
    if (!tagMode || !zoomTile || !current) return;
    const rect = ev.currentTarget.getBoundingClientRect();
    const scale = rect.width / zoomTile.w; // displayed vs native tile px
    const xPx = zoomTile.x + (ev.clientX - rect.left) / scale;
    const yPx = zoomTile.y + (ev.clientY - rect.top) / scale;
    const toPts = 72 / current.dpi;
    setTagDraft({ pt: { x: xPx * toPts, y: yPx * toPts }, tag: "", name: "", type: "ELECTRICAL" });
  };

  const zoneRect =
    current && ref.zoneRow != null && ref.zoneCol != null && !focus?.bbox
      ? {
          left: `${(ref.zoneCol / ZONE_COLS) * 100}%`,
          top: `${(ref.zoneRow / ZONE_ROWS) * 100}%`,
          width: `${100 / ZONE_COLS}%`,
          height: `${100 / ZONE_ROWS}%`,
        }
      : null;

  const focusRect = current && focus?.bbox && current.page === (focus.page ?? -1) ? ptsToPct(focus.bbox, current) : null;
  const pagesCandidates = current ? candidates.filter((c) => c.page === current.page) : [];

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4 sm:p-8" onClick={onClose}>
      <div
        className="bg-white rounded-xl border border-slate-200 shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-200 shrink-0">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900 truncate">{title}</h3>
            <p className="text-[11px] text-slate-500 font-mono">
              {schematicReference ? (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-emerald-600" /> {schematicReference}
                  {focusRect ? (
                    <span className="text-emerald-600">· exact location</span>
                  ) : zoneRect ? (
                    <span className="text-slate-400">· approximate zone</span>
                  ) : null}
                </span>
              ) : reviewing ? (
                "Review extracted components, then confirm"
              ) : (
                "Schematic viewer"
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {pages && pages.length > 0 && !reviewing && !zoomTile && (
              <Button variant="secondary" size="sm" icon={ScanSearch} loading={extracting} onClick={runExtraction}>
                Extract components
              </Button>
            )}
            {pages && pages.length > 1 && !zoomTile && (
              <div className="flex items-center gap-1 text-xs text-slate-600">
                <button
                  onClick={() => setPageIdx((i) => Math.max(0, i - 1))}
                  disabled={pageIdx === 0}
                  className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="font-mono">Sheet {current?.page}</span>
                <button
                  onClick={() => setPageIdx((i) => Math.min((pages?.length ?? 1) - 1, i + 1))}
                  disabled={pageIdx >= (pages?.length ?? 1) - 1}
                  className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden flex">
          <div className="flex-1 overflow-auto p-4 bg-slate-50">
            {loading ? (
              <div className="h-64 flex items-center justify-center text-slate-500">
                <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
              </div>
            ) : !pages || pages.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center gap-3 text-center">
                <Grid2x2 className="w-8 h-8 text-slate-300" />
                <p className="text-sm text-slate-500 max-w-sm">
                  This schematic hasn&apos;t been prepared for high-resolution viewing yet. Preparation renders each
                  sheet and cuts it into zoomable tiles.
                </p>
                <Button icon={Grid2x2} loading={preparing} onClick={prepare}>
                  {preparing && prepProgress
                    ? `Preparing… sheet ${prepProgress.prepared}/${prepProgress.total}`
                    : "Prepare schematic"}
                </Button>
              </div>
            ) : zoomTile ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <button
                    onClick={() => { setZoomTile(null); setTagMode(false); setTagDraft(null); }}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900"
                  >
                    <ArrowLeft className="w-4 h-4" /> Back to full sheet
                  </button>
                  <Button
                    variant={tagMode ? "primary" : "secondary"}
                    size="sm"
                    icon={Crosshair}
                    onClick={() => { setTagMode((m) => !m); setTagDraft(null); }}
                  >
                    {tagMode ? "Click the component…" : "Tag a component"}
                  </Button>
                </div>
                <div className="overflow-auto rounded-lg border border-slate-200 bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={zoomTile.url}
                    alt={zoomTile.tileKey}
                    onClick={onZoomClick}
                    className={`max-w-none ${tagMode ? "cursor-crosshair" : ""}`}
                  />
                </div>
                {tagDraft && (
                  <div className="flex flex-wrap items-end gap-2 p-3 rounded-lg border border-emerald-200 bg-emerald-50">
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-slate-500 uppercase">Tag</label>
                      <input
                        autoFocus
                        value={tagDraft.tag}
                        onChange={(e) => {
                          const tag = e.target.value.toUpperCase();
                          const guess = classifyTag(tag);
                          setTagDraft((d) => d && {
                            ...d,
                            tag,
                            name: d.name || guess?.name || "",
                            type: guess?.type ?? d.type,
                          });
                        }}
                        placeholder="CB-12"
                        className="w-28 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:border-emerald-500/40"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-slate-500 uppercase">Name</label>
                      <input
                        value={tagDraft.name}
                        onChange={(e) => setTagDraft((d) => d && { ...d, name: e.target.value })}
                        placeholder="Circuit Breaker"
                        className="w-44 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-emerald-500/40"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-slate-500 uppercase">Type</label>
                      <select
                        value={tagDraft.type}
                        onChange={(e) => setTagDraft((d) => d && { ...d, type: e.target.value })}
                        className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none"
                      >
                        {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <Button size="sm" icon={CheckCircle2} loading={savingTag} onClick={saveTag}>Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => setTagDraft(null)}>Cancel</Button>
                  </div>
                )}
                <p className="text-[11px] text-slate-400 font-mono">{zoomTile.tileKey} · native resolution — scroll to pan</p>
              </div>
            ) : current?.preview ? (
              <div className="space-y-2">
                <div className="relative inline-block rounded-lg border border-slate-200 bg-white overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={current.preview.url}
                    alt={`Sheet ${current.page}`}
                    onClick={onPreviewClick}
                    className="max-w-full max-h-[68vh] cursor-zoom-in"
                  />
                  {focusRect && (
                    <div
                      className="absolute border-2 border-emerald-500 bg-emerald-400/20 rounded pointer-events-none animate-pulse"
                      style={focusRect}
                    />
                  )}
                  {zoneRect && current.page === (ref.sheet ?? current.page) && (
                    <div className="absolute border-2 border-emerald-500 bg-emerald-400/15 rounded pointer-events-none" style={zoneRect} />
                  )}
                  {reviewing &&
                    pagesCandidates.map((c) => (
                      <div
                        key={c.tag}
                        title={`${c.tag} · ${c.name}`}
                        className={`absolute border rounded-sm pointer-events-none ${
                          c.include ? "border-sky-500 bg-sky-400/25" : "border-slate-300 bg-slate-200/20"
                        }`}
                        style={ptsToPct(c.bbox, current)}
                      />
                    ))}
                </div>
                <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
                  <ZoomIn className="w-3.5 h-3.5" /> Click anywhere to zoom into the high-resolution tile
                  <span className="text-slate-400 font-mono">· {current.tiles.length} tiles @ {current.dpi} DPI</span>
                </p>
              </div>
            ) : null}
          </div>

          {/* Review panel */}
          {reviewing && (
            <div className="w-80 shrink-0 border-l border-slate-200 flex flex-col bg-white">
              <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-900">Extracted components</p>
                  <p className="text-[10px] text-slate-500">
                    {candidates.filter((c) => c.include).length}/{candidates.length} selected · from PDF text layer
                  </p>
                </div>
                <button onClick={() => setReviewing(false)} className="text-[11px] text-slate-400 hover:text-slate-700">
                  Hide
                </button>
              </div>
              <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
                {candidates.map((c, i) => (
                  <div key={`${c.tag}-${i}`} className={`px-4 py-2.5 space-y-1.5 ${c.page === current?.page ? "" : "opacity-60"}`}>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={!!c.include}
                        onChange={() => setCandidates((cs) => cs.map((x, j) => (j === i ? { ...x, include: !x.include } : x)))}
                        className="accent-emerald-600 w-3.5 h-3.5"
                      />
                      <span className="text-xs font-mono font-bold text-slate-900">{c.tag}</span>
                      <span className="text-[10px] text-slate-400 ml-auto font-mono">
                        Sheet {c.page}{c.occurrences > 1 ? ` ·×${c.occurrences}` : ""}
                      </span>
                    </div>
                    <div className="flex gap-1.5 pl-5">
                      <input
                        value={c.name}
                        onChange={(e) => setCandidates((cs) => cs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                        className="flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded px-2 py-1 text-[11px] focus:outline-none focus:border-emerald-500/40"
                      />
                      <select
                        value={c.type}
                        onChange={(e) => setCandidates((cs) => cs.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)))}
                        className="bg-slate-50 border border-slate-200 rounded px-1 py-1 text-[10px] focus:outline-none"
                      >
                        {TYPES.map((t) => <option key={t} value={t}>{t.slice(0, 4)}</option>)}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
              <div className="p-3 border-t border-slate-200">
                <Button fullWidth icon={CheckCircle2} loading={confirming} onClick={confirmCandidates}>
                  Confirm {candidates.filter((c) => c.include).length} to registry
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
