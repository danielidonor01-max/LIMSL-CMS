// src/lib/diagnostics/chunker.ts
// Splits a text document into retrieval-sized chunks for document_chunks
// (docs/TROUBLESHOOTING-ENGINE.md §2.2). Heading-aware: markdown/numbered
// headings start a new chunk and become its `heading`, so a retrieved passage
// carries its section context. Pure module — no DB, no IO — so it is unit-
// testable and reusable by every ingestion path (upload hook, backfill,
// future schematic pipeline).

export type PageText = { page: number; text: string };
export type Chunk = {
  chunkIndex: number;
  heading: string | null;
  pageStart: number | null;
  pageEnd: number | null;
  content: string;
  tokenEstimate: number;
};

// ~4 chars/token is close enough for sizing decisions (English technical prose).
const estimateTokens = (s: string) => Math.ceil(s.length / 4);

const TARGET_TOKENS = 800;
const MIN_TOKENS = 60; // merge fragments smaller than this into a neighbor
const OVERLAP_TOKENS = 100;

// Markdown headings, numbered section headings ("4.2 Lubrication"), or
// ALL-CAPS lines that look like section titles.
const HEADING_RE = /^(#{1,6}\s+.+|\d+(?:\.\d+)*[.)]?\s+[A-Z].{2,80}|[A-Z][A-Z0-9 \-/&]{6,60})$/;

type Block = { text: string; heading: string | null; page: number | null };

// Flatten pages into paragraph blocks, tracking the active heading + page.
function toBlocks(pages: PageText[]): Block[] {
  const blocks: Block[] = [];
  let heading: string | null = null;
  for (const { page, text: rawText } of pages) {
    // Docx-converted markdown often glues headings mid-paragraph with a single
    // newline; promote every "# …" line to its own block so it is detected.
    const text = rawText.replace(/\r/g, "").replace(/\n[ \t]*(?=#{1,6} )/g, "\n\n");
    for (const rawPara of text.split(/\n{2,}/)) {
      const para = rawPara.trim();
      if (!para) continue;
      const firstLine = para.split("\n")[0].trim();
      if (HEADING_RE.test(firstLine) && firstLine.length <= 90) {
        heading = firstLine.replace(/^#{1,6}\s+/, "").trim();
        const rest = para.slice(para.indexOf("\n") + 1).trim();
        if (rest && para.includes("\n")) blocks.push({ text: rest, heading, page });
        continue;
      }
      blocks.push({ text: para, heading, page });
    }
  }
  return blocks;
}

export function chunkPages(pages: PageText[]): Chunk[] {
  const blocks = toBlocks(pages);
  const chunks: Chunk[] = [];

  let buf: Block[] = [];
  let bufTokens = 0;
  // Guards against emitting a chunk that is nothing but the carried-over
  // overlap tail (would duplicate the previous chunk's ending).
  let bufHasNew = false;

  const flush = () => {
    if (!buf.length || !bufHasNew) return;
    const content = buf.map((b) => b.text).join("\n\n");
    if (estimateTokens(content) < MIN_TOKENS && chunks.length) {
      // Too small to stand alone — append to the previous chunk instead.
      const prev = chunks[chunks.length - 1];
      prev.content = `${prev.content}\n\n${content}`;
      prev.tokenEstimate = estimateTokens(prev.content);
      prev.pageEnd = buf[buf.length - 1].page ?? prev.pageEnd;
    } else {
      chunks.push({
        chunkIndex: chunks.length,
        heading: buf[0].heading,
        pageStart: buf.find((b) => b.page != null)?.page ?? null,
        pageEnd: [...buf].reverse().find((b) => b.page != null)?.page ?? null,
        content,
        tokenEstimate: estimateTokens(content),
      });
    }
    // Overlap: carry the tail of this chunk into the next so a fact straddling
    // a boundary is findable from either side.
    const tail: Block[] = [];
    let tailTokens = 0;
    for (let i = buf.length - 1; i >= 0 && tailTokens < OVERLAP_TOKENS; i--) {
      tail.unshift(buf[i]);
      tailTokens += estimateTokens(buf[i].text);
    }
    buf = tail.length < buf.length ? tail : [];
    bufTokens = buf.reduce((a, b) => a + estimateTokens(b.text), 0);
    bufHasNew = false;
  };

  let currentHeading: string | null = null;
  for (const block of blocks) {
    const t = estimateTokens(block.text);
    const headingChanged = block.heading !== currentHeading && bufTokens > MIN_TOKENS;
    if (headingChanged || bufTokens + t > TARGET_TOKENS) flush();
    currentHeading = block.heading;

    // A single block larger than the target gets hard-split on sentences.
    if (t > TARGET_TOKENS * 1.5) {
      const sentences = block.text.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) ?? [block.text];
      let piece = "";
      for (const s of sentences) {
        if (estimateTokens(piece + s) > TARGET_TOKENS && piece) {
          buf.push({ ...block, text: piece.trim() });
          bufHasNew = true;
          flush();
          piece = "";
        }
        piece += s;
      }
      if (piece.trim()) {
        buf.push({ ...block, text: piece.trim() });
        bufTokens += estimateTokens(piece);
        bufHasNew = true;
      }
      continue;
    }

    buf.push(block);
    bufTokens += t;
    bufHasNew = true;
  }
  flush();
  // A pure-overlap remainder can linger in buf after the final flush; it holds
  // no new content, so drop it.

  return chunks;
}
