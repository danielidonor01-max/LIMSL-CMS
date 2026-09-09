// src/components/Markdown.tsx
// Minimal, dependency-free Markdown renderer for the controlled procedure text.
// Supports #/##/### headings, - bullet lists (with indentation), **bold**,
// *italic*, --- rules, pipe tables, and paragraphs. Safe: no raw HTML injection.
//
// Tables were the gap. The procedure is a controlled document with revision
// tables in it, so auditors opening the page saw raw pipes and dashes running
// down it, and the first thing they would conclude is that nobody had read the
// page. The grammar lives in lib/markdown-table.ts under test; this file only
// draws it.
import React from "react";
import { parseTableAt, type MarkdownTable } from "@/lib/markdown-table";

function renderInline(text: string, keyBase: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Split on **bold** first, then *italic* inside plain runs.
  const boldParts = text.split(/(\*\*[^*]+\*\*)/g);
  boldParts.forEach((part, i) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) {
      nodes.push(
        <strong key={`${keyBase}-b${i}`} className="font-semibold text-ink-900">
          {part.slice(2, -2)}
        </strong>,
      );
    } else {
      const italicParts = part.split(/(\*[^*]+\*)/g);
      italicParts.forEach((ip, j) => {
        if (/^\*[^*]+\*$/.test(ip)) {
          nodes.push(<em key={`${keyBase}-i${i}-${j}`}>{ip.slice(1, -1)}</em>);
        } else if (ip) {
          nodes.push(<React.Fragment key={`${keyBase}-t${i}-${j}`}>{ip}</React.Fragment>);
        }
      });
    }
  });
  return nodes;
}

export default function Markdown({ content }: { content: string }) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let list: { indent: number; text: string }[] = [];
  let key = 0;

  const flushList = () => {
    if (list.length === 0) return;
    const items = list;
    list = [];
    blocks.push(
      <ul key={`ul-${key++}`} className="my-2 space-y-1">
        {items.map((it, i) => (
          <li
            key={i}
            className="text-[13px] text-ink-700 leading-relaxed list-disc"
            style={{ marginLeft: 18 + it.indent * 16 }}
          >
            {renderInline(it.text, `li-${key}-${i}`)}
          </li>
        ))}
      </ul>,
    );
  };

  for (let idx = 0; idx < lines.length; idx++) {
    const raw = lines[idx];
    const line = raw.replace(/\s+$/, "");
    if (!line.trim()) {
      flushList();
      continue;
    }
    // Checked before the horizontal-rule branch, because a delimiter row of
    // dashes would otherwise be swallowed as a rule and the table below it
    // rendered as loose paragraphs of pipes.
    const table = parseTableAt(lines, idx);
    if (table) {
      flushList();
      blocks.push(<TableBlock key={`tb-${key++}`} table={table.table} />);
      idx = table.next - 1;
      continue;
    }
    if (line.trim() === "---") {
      flushList();
      blocks.push(<hr key={`hr-${key++}`} className="my-6 border-ink-200" />);
      continue;
    }
    const bullet = line.match(/^(\s*)-\s+(.*)$/);
    if (bullet) {
      const indent = Math.floor(bullet[1].length / 2);
      list.push({ indent, text: bullet[2] });
      continue;
    }
    flushList();
    if (line.startsWith("### ")) {
      blocks.push(<h4 key={`h-${key++}`} className="text-base font-semibold text-ink-900 mt-5 mb-1.5">{renderInline(line.slice(4), `h${key}`)}</h4>);
    } else if (line.startsWith("## ")) {
      blocks.push(<h3 key={`h-${key++}`} className="text-base font-bold text-ink-900 mt-6 mb-2 pb-1 border-b border-ink-200">{renderInline(line.slice(3), `h${key}`)}</h3>);
    } else if (line.startsWith("# ")) {
      blocks.push(<h2 key={`h-${key++}`} className="text-xl font-bold tracking-tight text-ink-900 mt-2 mb-3">{renderInline(line.slice(2), `h${key}`)}</h2>);
    } else {
      blocks.push(<p key={`p-${key++}`} className="text-[13px] text-ink-700 leading-relaxed my-2">{renderInline(line, `p${key}`)}</p>);
    }
  }
  flushList();

  return <div className="procedure-body">{blocks}</div>;
}

function TableBlock({ table }: { table: MarkdownTable }) {
  return (
    // A controlled document is read on a phone in the workshop as often as on a
    // desk, and a revision table is wider than a phone. It scrolls inside its
    // own box rather than pushing the page sideways.
    <div className="my-4 overflow-x-auto rounded-xl border border-line">
      <table className="w-full text-left text-xs border-collapse">
        {table.hasHeader && (
          <thead className="bg-ink-50">
            <tr>
              {table.header.map((cell, i) => (
                <th
                  key={i}
                  scope="col"
                  className="px-3 py-2.5 font-semibold text-ink-700 border-b border-line align-top"
                >
                  {renderInline(cell, `th-${i}`)}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {table.rows.map((row, r) => (
            <tr key={r} className="even:bg-ink-50/60">
              {row.map((cell, c) => (
                <td key={c} className="px-3 py-2.5 text-ink-700 border-b border-line align-top">
                  {renderInline(cell, `td-${r}-${c}`)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
