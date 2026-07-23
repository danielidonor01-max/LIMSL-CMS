// src/lib/diagnostics/extract-tags.ts
// P2-lite component extraction — NO AI, NO API key. CAD-exported schematic PDFs
// carry their text layer, and pdfjs exposes every string WITH its coordinates.
// Filtering those strings through the IEC-style tag grammar and a prefix
// dictionary yields component candidates with exact positions — deterministic
// and pixel-accurate, no OCR/vision uncertainty. Scanned (IMAGE_ONLY) sheets
// yield nothing here; they wait for the vision pipeline (or click-to-tag).
//
// Coordinates: PDF points, TOP-LEFT origin (y flipped from PDF user space) —
// resolution-independent, so the viewer maps them onto any rendered size via
// scale = renderedWidth / pageWidthPts.

export type TagCandidate = {
  tag: string;
  name: string; // dictionary guess — editable in review
  type: string; // ELECTRICAL | HYDRAULIC | PNEUMATIC | CONTROL | MECHANICAL
  page: number;
  bbox: { x: number; y: number; w: number; h: number }; // points, top-left origin
  occurrences: number; // same tag seen elsewhere on the sheet set
};

export type PageSize = { page: number; widthPts: number; heightPts: number };

export type TagExtraction = {
  candidates: TagCandidate[];
  pages: PageSize[];
  scannedPages: number[]; // pages with no usable text layer
};

// IEC-ish designation prefixes → human name + registry type. Precision over
// recall: unknown prefixes are ignored (manual click-to-tag covers the rest).
const PREFIX_DICT: Record<string, { name: string; type: string }> = {
  CB: { name: "Circuit Breaker", type: "ELECTRICAL" },
  QF: { name: "Circuit Breaker", type: "ELECTRICAL" },
  Q: { name: "Disconnector / Breaker", type: "ELECTRICAL" },
  F: { name: "Fuse", type: "ELECTRICAL" },
  FU: { name: "Fuse", type: "ELECTRICAL" },
  K: { name: "Relay / Contactor", type: "ELECTRICAL" },
  KM: { name: "Contactor", type: "ELECTRICAL" },
  KA: { name: "Relay", type: "ELECTRICAL" },
  M: { name: "Motor", type: "ELECTRICAL" },
  T: { name: "Transformer", type: "ELECTRICAL" },
  TR: { name: "Transformer", type: "ELECTRICAL" },
  TB: { name: "Terminal Block", type: "ELECTRICAL" },
  X: { name: "Terminal Block", type: "ELECTRICAL" },
  XT: { name: "Terminal Block", type: "ELECTRICAL" },
  PSU: { name: "Power Supply", type: "ELECTRICAL" },
  G: { name: "Generator / Supply", type: "ELECTRICAL" },
  U: { name: "Drive / Converter", type: "ELECTRICAL" },
  VFD: { name: "Variable Frequency Drive", type: "ELECTRICAL" },
  SD: { name: "Servo / Spindle Drive", type: "ELECTRICAL" },
  R: { name: "Resistor / Relay", type: "ELECTRICAL" },
  HL: { name: "Indicator Lamp", type: "ELECTRICAL" },
  H: { name: "Indicator / Horn", type: "ELECTRICAL" },
  PLC: { name: "PLC I/O", type: "CONTROL" },
  S: { name: "Switch", type: "CONTROL" },
  SB: { name: "Push Button", type: "CONTROL" },
  SQ: { name: "Limit Switch", type: "CONTROL" },
  B: { name: "Sensor / Transducer", type: "CONTROL" },
  SOL: { name: "Solenoid Valve", type: "PNEUMATIC" },
  YV: { name: "Solenoid Valve", type: "PNEUMATIC" },
  Y: { name: "Solenoid", type: "PNEUMATIC" },
  V: { name: "Valve", type: "HYDRAULIC" },
};

// "CB-12", "K1", "TB2-14", "PSU1", "PLC-IN-0", "-K1" (IEC leading dash) …
// Prefix letters, optional short alpha segment (PLC-IN), digits, optional
// suffix segments. At least one digit is mandatory — bare words never match.
const TAG_RE = /^[-+]?([A-Z]{1,4})(?:-[A-Z]{1,3})?-?\d{1,4}(?:[-/.][A-Z0-9]{1,4}){0,2}$/;

export function classifyTag(raw: string): { tag: string; name: string; type: string } | null {
  const cleaned = raw.trim().replace(/^[-+]/, "");
  const m = TAG_RE.exec(raw.trim());
  if (!m) return null;
  const prefix = m[1];
  const entry = PREFIX_DICT[prefix];
  if (!entry) return null;
  if (cleaned.length < 2 || cleaned.length > 16) return null;
  return { tag: cleaned, name: entry.name, type: entry.type };
}

// Extract candidates from a PDF's text layer.
export async function extractTags(data: Uint8Array): Promise<TagExtraction> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({ data: data.slice(), useSystemFonts: true });
  const doc = await loadingTask.promise;

  const byTag = new Map<string, TagCandidate>();
  const pages: PageSize[] = [];
  const scannedPages: number[] = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const view = page.getViewport({ scale: 1 });
    pages.push({ page: p, widthPts: view.width, heightPts: view.height });

    const content = await page.getTextContent();
    let textChars = 0;

    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      textChars += item.str.length;

      // A text item can hold several whitespace-separated tokens; estimate each
      // token's x-offset proportionally within the item's width.
      const str = item.str;
      const tf = item.transform as number[];
      const fontH = Math.hypot(tf[1], tf[3]) || item.height || 8;
      const itemX = tf[4];
      const itemBaselineY = tf[5];

      for (const match of str.matchAll(/\S+/g)) {
        const token = match[0];
        const cls = classifyTag(token);
        if (!cls) continue;

        const frac = str.length ? match.index! / str.length : 0;
        const wFrac = str.length ? token.length / str.length : 1;
        const x = itemX + frac * item.width;
        const w = Math.max(4, wFrac * item.width);
        // Flip to top-left origin; pad the box slightly around the glyphs.
        const y = view.height - itemBaselineY - fontH;
        const bbox = { x: +x.toFixed(1), y: +y.toFixed(1), w: +w.toFixed(1), h: +(fontH * 1.3).toFixed(1) };

        const existing = byTag.get(cls.tag);
        if (existing) {
          existing.occurrences += 1;
        } else {
          byTag.set(cls.tag, { ...cls, page: p, bbox, occurrences: 1 });
        }
      }
    }

    if (textChars < 40) scannedPages.push(p);
  }

  await loadingTask.destroy();

  const candidates = [...byTag.values()].sort(
    (a, b) => a.page - b.page || a.tag.localeCompare(b.tag),
  );
  return { candidates, pages, scannedPages };
}

// "Sheet 4, Zone C2" from a point using the standard border grid.
export function zoneReference(page: number, bbox: { x: number; y: number }, size: PageSize, cols = 8, rows = 4): string {
  const col = Math.min(cols, Math.max(1, Math.ceil(((bbox.x + 1) / size.widthPts) * cols)));
  const row = Math.min(rows - 1, Math.max(0, Math.floor((bbox.y / size.heightPts) * rows)));
  return `Sheet ${page}, Zone ${String.fromCharCode(65 + row)}${col}`;
}
