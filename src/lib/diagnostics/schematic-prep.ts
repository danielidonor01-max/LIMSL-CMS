// src/lib/diagnostics/schematic-prep.ts
// P1 schematic preprocessing (docs/TROUBLESHOOTING-ENGINE.md §2.3): render each
// schematic PDF page at high DPI and cut it into systematic overlapping tiles.
// Dense sheets lose their tag legibility when downscaled to screen/vision
// resolution — the tiles preserve native detail, and the overlap guarantees
// every component symbol appears whole in at least one tile. Pure geometry +
// rendering; no AI. The stored tiles double as the future vision-pipeline input.
import { db } from "@/lib/db";
import { equipmentDocuments, schematicTiles } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { saveFile, serveFile } from "@/lib/storage";

// Tile geometry (guide §2.3): tile ≤ model/display sweet spot; overlap must
// exceed the largest symbol+label so nothing exists only cut-in-half.
export const TILE = 2048;
export const OVERLAP = 384;
const STRIDE = TILE - OVERLAP;
const PREVIEW_EDGE = 1600; // whole-page preview long edge (UI overview)
const TARGET_DPI = 250;
// Rendering memory cap — an uncapped A0 at 250 DPI is a ~370 MB RGBA canvas.
const MAX_RENDER_EDGE = Number(process.env.SCHEMATIC_RENDER_MAX_EDGE || 6000);

export type TileRect = { x: number; y: number; w: number; h: number; row: number; col: number };

// Systematic overlapping grid over a rendered page. Slivers thinner than the
// overlap are absorbed by clamping the last row/column to the page edge.
export function computeTileGrid(pageW: number, pageH: number): TileRect[] {
  const tiles: TileRect[] = [];
  const cols = Math.max(1, Math.ceil((pageW - OVERLAP) / STRIDE));
  const rows = Math.max(1, Math.ceil((pageH - OVERLAP) / STRIDE));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let x = c * STRIDE;
      let y = r * STRIDE;
      // Clamp the final row/col so tiles never run past the page and the last
      // tile still has full TILE size where the page allows it.
      if (x + TILE > pageW) x = Math.max(0, pageW - TILE);
      if (y + TILE > pageH) y = Math.max(0, pageH - TILE);
      tiles.push({ x, y, w: Math.min(TILE, pageW - x), h: Math.min(TILE, pageH - y), row: r, col: c });
    }
  }
  // Clamping can make the last row/col coincide with its neighbor on small
  // pages — drop exact duplicates.
  const seen = new Set<string>();
  return tiles.filter((t) => {
    const k = `${t.x},${t.y}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export async function loadFileBytes(fileKey: string): Promise<Uint8Array | null> {
  const served = await serveFile(fileKey);
  if (served.kind === "stream") return served.body;
  if (served.kind === "redirect") {
    const res = await fetch(served.url);
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  }
  return null;
}

type NapiCanvas = import("@napi-rs/canvas").Canvas;

// Render one PDF page to a canvas at TARGET_DPI, capped by MAX_RENDER_EDGE.
async function renderPage(
  data: Uint8Array,
  pageNum: number,
): Promise<{ canvas: NapiCanvas; width: number; height: number; dpi: number; totalPages: number }> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const { createCanvas } = await import("@napi-rs/canvas");

  // pdfjs transfers (detaches) the buffer it is given — hand it a copy so the
  // caller can reuse `data` across multiple page renders.
  const loadingTask = pdfjs.getDocument({ data: data.slice(), useSystemFonts: true });
  const doc = await loadingTask.promise;
  const totalPages = doc.numPages;
  const page = await doc.getPage(pageNum);

  const base = page.getViewport({ scale: 1 }); // page size in points (72 dpi)
  const longEdgePts = Math.max(base.width, base.height);
  const scale = Math.min(TARGET_DPI / 72, MAX_RENDER_EDGE / longEdgePts);
  const viewport = page.getViewport({ scale });

  const width = Math.round(viewport.width);
  const height = Math.round(viewport.height);
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  await page.render({
    // pdfjs's DOM types vs the Node canvas — structurally compatible at runtime.
    canvas: canvas as unknown as HTMLCanvasElement,
    canvasContext: ctx as unknown as CanvasRenderingContext2D,
    viewport,
  }).promise;

  await loadingTask.destroy();
  return { canvas, width, height, dpi: Math.round(scale * 72), totalPages };
}

function cropPng(src: NapiCanvas, x: number, y: number, w: number, h: number, outW = w, outH = h): Buffer {
  // Lazy import already resolved by renderPage; safe to require synchronously here.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createCanvas } = require("@napi-rs/canvas") as typeof import("@napi-rs/canvas");
  const c = createCanvas(outW, outH);
  const ctx = c.getContext("2d");
  ctx.drawImage(src, x, y, w, h, 0, 0, outW, outH);
  return c.toBuffer("image/png");
}

export type PrepareProgress = {
  documentId: string;
  totalPages: number;
  preparedPages: number[];
  done: boolean;
  lastPage?: { page: number; tiles: number; width: number; height: number; dpi: number };
};

export async function getPreparedPages(documentId: string): Promise<number[]> {
  const rows = await db
    .select({ page: schematicTiles.page })
    .from(schematicTiles)
    .where(and(eq(schematicTiles.documentId, documentId), eq(schematicTiles.level, 0)));
  return [...new Set(rows.map((r) => r.page))].sort((a, b) => a - b);
}

// Prepare up to `maxPages` not-yet-prepared pages of one schematic document.
// Bounded so a serverless invocation stays within time/memory limits; call
// repeatedly (UI or script) until `done`. Re-preparing a page replaces its tiles.
export async function prepareSchematic(documentId: string, maxPages = 1): Promise<PrepareProgress> {
  const [doc] = await db
    .select()
    .from(equipmentDocuments)
    .where(eq(equipmentDocuments.id, documentId))
    .limit(1);
  if (!doc) throw new Error("Document not found");
  if (!doc.fileKey) throw new Error("Document has no uploaded file");

  const bytes = await loadFileBytes(doc.fileKey);
  if (!bytes) throw new Error("File unreadable from storage");

  let prepared = await getPreparedPages(documentId);
  let lastPage: PrepareProgress["lastPage"];

  // Page count first (metadata-only load) so the resume peek never requests a
  // page past the end of the document.
  const pdfjsMeta = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const metaTask = pdfjsMeta.getDocument({ data: bytes.slice(), useSystemFonts: true });
  const totalPages = (await metaTask.promise).numPages;
  await metaTask.destroy();

  for (let i = 0; i < maxPages; i++) {
    const nextPage = (() => {
      for (let p = 1; p <= totalPages; p++) if (!prepared.includes(p)) return p;
      return null;
    })();
    if (nextPage === null) break;

    const { canvas, width, height, dpi } = await renderPage(bytes, nextPage);

    // Replace any partial tiles for this page, then store preview + grid.
    await db
      .delete(schematicTiles)
      .where(and(eq(schematicTiles.documentId, documentId), eq(schematicTiles.page, nextPage)));

    const rows: (typeof schematicTiles.$inferInsert)[] = [];

    const pScale = Math.min(1, PREVIEW_EDGE / Math.max(width, height));
    const pw = Math.round(width * pScale);
    const ph = Math.round(height * pScale);
    const previewKey = `schtile-${documentId}-p${nextPage}-preview.png`;
    await saveFile(previewKey, new Uint8Array(cropPng(canvas, 0, 0, width, height, pw, ph)), {
      name: previewKey,
      mimeType: "image/png",
    });
    rows.push({
      id: nanoid(),
      documentId,
      equipmentId: doc.equipmentId,
      page: nextPage,
      tileKey: `p${nextPage}_preview`,
      level: 0,
      x: 0, y: 0, w: width, h: height,
      pageWidth: width, pageHeight: height, dpi,
      fileKey: previewKey,
    });

    const grid = computeTileGrid(width, height);
    for (const t of grid) {
      const key = `schtile-${documentId}-p${nextPage}-r${t.row}c${t.col}.png`;
      await saveFile(key, new Uint8Array(cropPng(canvas, t.x, t.y, t.w, t.h)), {
        name: key,
        mimeType: "image/png",
      });
      rows.push({
        id: nanoid(),
        documentId,
        equipmentId: doc.equipmentId,
        page: nextPage,
        tileKey: `p${nextPage}_r${t.row}_c${t.col}`,
        level: 1,
        x: t.x, y: t.y, w: t.w, h: t.h,
        pageWidth: width, pageHeight: height, dpi,
        fileKey: key,
      });
    }

    await db.insert(schematicTiles).values(rows);
    prepared = [...prepared, nextPage].sort((a, b) => a - b);
    lastPage = { page: nextPage, tiles: grid.length, width, height, dpi };
  }

  return {
    documentId,
    totalPages,
    preparedPages: prepared,
    done: prepared.length >= totalPages,
    lastPage,
  };
}
