// src/components/Markdown.tsx
// Minimal, dependency-free Markdown renderer for the controlled procedure text.
// Supports #/##/### headings, - bullet lists (with indentation), **bold**,
// *italic*, --- rules, and paragraphs. Safe: no raw HTML injection.
import React from "react";

function renderInline(text: string, keyBase: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Split on **bold** first, then *italic* inside plain runs.
  const boldParts = text.split(/(\*\*[^*]+\*\*)/g);
  boldParts.forEach((part, i) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) {
      nodes.push(
        <strong key={`${keyBase}-b${i}`} className="font-semibold text-slate-900">
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
            className="text-[13px] text-slate-700 leading-relaxed list-disc"
            style={{ marginLeft: 18 + it.indent * 16 }}
          >
            {renderInline(it.text, `li-${key}-${i}`)}
          </li>
        ))}
      </ul>,
    );
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim()) {
      flushList();
      continue;
    }
    if (line.trim() === "---") {
      flushList();
      blocks.push(<hr key={`hr-${key++}`} className="my-6 border-slate-200" />);
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
      blocks.push(<h4 key={`h-${key++}`} className="text-sm font-bold text-slate-900 mt-5 mb-1.5">{renderInline(line.slice(4), `h${key}`)}</h4>);
    } else if (line.startsWith("## ")) {
      blocks.push(<h3 key={`h-${key++}`} className="text-base font-bold text-slate-900 mt-6 mb-2 pb-1 border-b border-slate-200">{renderInline(line.slice(3), `h${key}`)}</h3>);
    } else if (line.startsWith("# ")) {
      blocks.push(<h2 key={`h-${key++}`} className="text-xl font-bold tracking-tight text-slate-900 mt-2 mb-3">{renderInline(line.slice(2), `h${key}`)}</h2>);
    } else {
      blocks.push(<p key={`p-${key++}`} className="text-[13px] text-slate-700 leading-relaxed my-2">{renderInline(line, `p${key}`)}</p>);
    }
  }
  flushList();

  return <div className="procedure-body">{blocks}</div>;
}
