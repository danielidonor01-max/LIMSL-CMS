// src/lib/diagnostics/extract-text.ts
// Extracts per-page text from an uploaded document so it can be chunked into
// document_chunks. PDF text layers are read with pdfjs-dist (pure JS — no
// native deps, works in the Next server runtime and in tsx scripts alike).
// Plain text / markdown pass straight through as a single "page".
//
// Also the basis for pdfKind detection: a PDF whose pages yield almost no text
// is a scan (IMAGE_ONLY) and belongs to the future vision pipeline, not here.

import type { PageText } from "./chunker";

export type ExtractResult = {
  pages: PageText[];
  pdfKind: "TEXT_SELECTABLE" | "IMAGE_ONLY" | "UNKNOWN";
};

// Below this many characters per page on average, a PDF is treated as scanned.
const TEXT_YIELD_THRESHOLD = 120;

export function isExtractableMime(mime: string | null | undefined, fileName?: string | null): boolean {
  const m = (mime || "").toLowerCase();
  const n = (fileName || "").toLowerCase();
  return (
    m === "application/pdf" || n.endsWith(".pdf") ||
    m.startsWith("text/") || n.endsWith(".txt") || n.endsWith(".md")
  );
}

async function extractPdf(data: Uint8Array): Promise<ExtractResult> {
  // Dynamic import keeps pdfjs out of every bundle that merely imports this
  // module's types/helpers; serverExternalPackages leaves it un-bundled.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // No worker in Node — pdfjs falls back to its "fake worker" automatically.
  const loadingTask = pdfjs.getDocument({ data, useSystemFonts: true });
  const doc = await loadingTask.promise;

  const pages: PageText[] = [];
  let totalChars = 0;
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    // Join text items, inserting newlines when the y-position jumps — keeps
    // paragraphs/headings separable for the chunker.
    let text = "";
    let lastY: number | null = null;
    for (const item of content.items) {
      if (!("str" in item)) continue;
      const y = (item.transform as number[])[5];
      if (lastY !== null && Math.abs(y - lastY) > 2) {
        text += Math.abs(y - lastY) > 14 ? "\n\n" : "\n";
      }
      text += item.str;
      if (item.hasEOL) text += "\n";
      lastY = y;
    }
    const trimmed = text.trim();
    totalChars += trimmed.length;
    pages.push({ page: p, text: trimmed });
  }
  const numPages = doc.numPages;
  await loadingTask.destroy();

  const avg = numPages ? totalChars / numPages : 0;
  return {
    pages: pages.filter((p) => p.text.length > 0),
    pdfKind: avg >= TEXT_YIELD_THRESHOLD ? "TEXT_SELECTABLE" : "IMAGE_ONLY",
  };
}

export async function extractText(
  data: Uint8Array,
  mime: string | null | undefined,
  fileName?: string | null,
): Promise<ExtractResult> {
  const m = (mime || "").toLowerCase();
  const n = (fileName || "").toLowerCase();

  if (m === "application/pdf" || n.endsWith(".pdf")) {
    return extractPdf(data);
  }
  if (m.startsWith("text/") || n.endsWith(".txt") || n.endsWith(".md")) {
    const text = new TextDecoder("utf-8").decode(data).trim();
    return { pages: text ? [{ page: 1, text }] : [], pdfKind: "UNKNOWN" };
  }
  return { pages: [], pdfKind: "UNKNOWN" };
}
