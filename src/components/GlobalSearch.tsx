// src/components/GlobalSearch.tsx
// Global search. Three things it previously lacked on desktop, where it lives:
//   • a keyboard shortcut — a search you can only reach with a mouse is not a
//     power feature, it is a decoration;
//   • arrow-key navigation of the results, so the shortcut leads somewhere;
//   • combobox semantics, so a screen reader is told a listbox appeared and how
//     many options are in it.
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2 } from "lucide-react";

type Result = { type: string; label: string; sub: string; href: string };

const TYPE_COLOR: Record<string, string> = {
  Equipment: "text-emerald-700 bg-emerald-50",
  "Work Order": "text-sky-700 bg-sky-50",
  Corrective: "text-rose-700 bg-rose-50",
  WMS: "text-violet-700 bg-violet-50",
};

export default function GlobalSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const [isMac, setIsMac] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setIsMac(/Mac|iPhone|iPad/.test(navigator.platform ?? ""));
  }, []);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((d) => {
          setResults(Array.isArray(d) ? d : []);
          setActive(0);
        })
        .finally(() => setLoading(false));
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // ⌘K / Ctrl-K from anywhere, and Escape to leave.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        setOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const go = (href: string) => {
    setOpen(false);
    setQ("");
    inputRef.current?.blur();
    router.push(href);
  };

  const showList = open && q.trim().length >= 2;

  const onInputKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (!showList || !results.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = results[active];
      if (hit) go(hit.href);
    }
  };

  return (
    <div ref={boxRef} className="relative w-full max-w-lg">
      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
      <input
        ref={inputRef}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onInputKey}
        aria-label="Search equipment, work orders, faults and method statements"
        role="combobox"
        aria-expanded={showList}
        aria-controls="global-search-results"
        aria-autocomplete="list"
        aria-activedescendant={showList && results.length ? `search-result-${active}` : undefined}
        placeholder="Search equipment, work orders, faults…"
        className="w-full pl-9 pr-16 min-h-10 bg-slate-100 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-500 focus:border-emerald-500 focus:bg-white transition-colors"
      />

      {loading ? (
        <Loader2 className="w-3.5 h-3.5 text-slate-400 animate-spin absolute right-3 top-1/2 -translate-y-1/2" />
      ) : (
        // Discoverability: the shortcut is worthless if nobody knows it exists.
        <kbd className="hidden md:flex absolute right-2.5 top-1/2 -translate-y-1/2 items-center gap-0.5 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-500 pointer-events-none">
          {isMac ? "⌘" : "Ctrl"} K
        </kbd>
      )}

      {showList && (
        <div
          id="global-search-results"
          role="listbox"
          aria-label="Search results"
          className="absolute top-full mt-2 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden z-50 max-h-96 overflow-y-auto"
        >
          {results.length === 0 && !loading ? (
            <div className="px-4 py-6 text-center text-xs text-slate-500">No matches for “{q}”.</div>
          ) : (
            <>
              {results.map((r, i) => (
                <button
                  key={i}
                  id={`search-result-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(r.href)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left border-b border-slate-100 last:border-0 ${
                    i === active ? "bg-emerald-50" : "hover:bg-slate-50"
                  }`}
                >
                  <span
                    className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0 ${
                      TYPE_COLOR[r.type] ?? "text-slate-600 bg-slate-100"
                    }`}
                  >
                    {r.type}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate-900 truncate">{r.label}</p>
                    <p className="text-[11px] text-slate-500 truncate">{r.sub}</p>
                  </div>
                </button>
              ))}
              <div className="px-4 py-1.5 text-[10px] text-slate-400 bg-slate-50 border-t border-slate-100">
                ↑↓ to move · Enter to open · Esc to close
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
