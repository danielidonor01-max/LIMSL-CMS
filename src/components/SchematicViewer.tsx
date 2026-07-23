// src/components/SchematicViewer.tsx
// "View on schematic" modal (P1 of the troubleshooting engine). Shows the
// prepared whole-page preview; clicking anywhere zooms into the high-resolution
// tile containing that point — dense sheets stay legible because tiles keep
// native render resolution. When a component reference like "Sheet 4, Zone C2"
// is passed, the referenced sheet opens with the approximate zone highlighted
// (standard border grid assumed until the vision pass reads the real grid).
"use client";

import { useEffect, useMemo, useState } from "react";
import { X, ZoomIn, ArrowLeft, ChevronLeft, ChevronRight, Loader2, Grid2x2, MapPin } from "lucide-react";
import { toast } from "sonner";
import Button from "@/components/Button";

type Tile = { tileKey: string; x: number; y: number; w: number; h: number; url: string };
type PageData = {
  page: number;
  pageWidth: number;
  pageHeight: number;
  dpi: number;
  preview: { url: string } | null;
  tiles: Tile[];
};

// Standard schematic border grid (until the vision pass reads the real one).
const ZONE_COLS = 8;
const ZONE_ROWS = 4;

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

export default function SchematicViewer({
  assetId,
  documentId,
  title,
  schematicReference,
  onClose,
}: {
  assetId: string;
  documentId: string;
  title: string;
  schematicReference?: string | null;
  onClose: () => void;
}) {
  const [pages, setPages] = useState<PageData[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageIdx, setPageIdx] = useState(0);
  const [zoomTile, setZoomTile] = useState<Tile | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [prepProgress, setPrepProgress] = useState<{ prepared: number; total: number } | null>(null);

  const ref = useMemo(() => parseReference(schematicReference), [schematicReference]);

  const load = async () => {
    setLoading(true);
    try {
      const d = await fetch(`/api/equipment/${assetId}/schematics/tiles?documentId=${documentId}`).then((r) => r.json());
      const ps: PageData[] = d.pages ?? [];
      setPages(ps);
      if (ref.sheet) {
        const i = ps.findIndex((p) => p.page === ref.sheet);
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

  // Prepare loop: one page per call until done (each call is serverless-bounded).
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

  const current = pages?.[pageIdx] ?? null;

  // Map a click on the preview image to page coordinates, then zoom into the
  // tile whose center is nearest (overlap means several tiles may contain it).
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

  const zoneRect =
    current && ref.zoneRow != null && ref.zoneCol != null
      ? {
          left: `${(ref.zoneCol / ZONE_COLS) * 100}%`,
          top: `${(ref.zoneRow / ZONE_ROWS) * 100}%`,
          width: `${100 / ZONE_COLS}%`,
          height: `${100 / ZONE_ROWS}%`,
        }
      : null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4 sm:p-8" onClick={onClose}>
      <div
        className="bg-white rounded-xl border border-slate-200 shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden"
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
                  {zoneRect && <span className="text-slate-400">· approximate zone highlighted</span>}
                </span>
              ) : (
                "Schematic viewer"
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
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
        <div className="flex-1 overflow-auto p-4 bg-slate-50">
          {loading ? (
            <div className="h-64 flex items-center justify-center text-slate-500">
              <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
            </div>
          ) : !pages || pages.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center gap-3 text-center">
              <Grid2x2 className="w-8 h-8 text-slate-300" />
              <p className="text-sm text-slate-500 max-w-sm">
                This schematic hasn&apos;t been prepared for high-resolution viewing yet. Preparation renders each sheet
                and cuts it into zoomable tiles.
              </p>
              <Button icon={Grid2x2} loading={preparing} onClick={prepare}>
                {preparing && prepProgress
                  ? `Preparing… sheet ${prepProgress.prepared}/${prepProgress.total}`
                  : "Prepare schematic"}
              </Button>
            </div>
          ) : zoomTile ? (
            <div className="space-y-3">
              <button
                onClick={() => setZoomTile(null)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900"
              >
                <ArrowLeft className="w-4 h-4" /> Back to full sheet
              </button>
              <div className="overflow-auto rounded-lg border border-slate-200 bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={zoomTile.url} alt={zoomTile.tileKey} className="max-w-none" />
              </div>
              <p className="text-[11px] text-slate-400 font-mono">
                {zoomTile.tileKey} · native resolution — scroll to pan
              </p>
            </div>
          ) : current?.preview ? (
            <div className="space-y-2">
              <div className="relative inline-block rounded-lg border border-slate-200 bg-white overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={current.preview.url}
                  alt={`Sheet ${current.page}`}
                  onClick={onPreviewClick}
                  className="max-w-full max-h-[70vh] cursor-zoom-in"
                />
                {zoneRect && current.page === (ref.sheet ?? current.page) && (
                  <div
                    className="absolute border-2 border-emerald-500 bg-emerald-400/15 rounded pointer-events-none"
                    style={zoneRect}
                  />
                )}
              </div>
              <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
                <ZoomIn className="w-3.5 h-3.5" /> Click anywhere to zoom into the high-resolution tile
                <span className="text-slate-400 font-mono">· {current.tiles.length} tiles @ {current.dpi} DPI</span>
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
