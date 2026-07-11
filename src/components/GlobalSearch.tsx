// src/components/GlobalSearch.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2 } from "lucide-react";

type Result = { type: string; label: string; sub: string; href: string };

const TYPE_COLOR: Record<string, string> = {
  Equipment: "text-emerald-600 bg-emerald-50",
  "Work Order": "text-sky-600 bg-sky-50",
  Corrective: "text-rose-600 bg-rose-50",
  WMS: "text-violet-600 bg-violet-50",
};

export default function GlobalSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((d) => setResults(Array.isArray(d) ? d : []))
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

  const go = (href: string) => {
    setOpen(false);
    setQ("");
    router.push(href);
  };

  return (
    <div ref={boxRef} className="relative w-full max-w-md">
      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search equipment, work orders, faults, WMS…"
        className="w-full pl-9 pr-8 py-2 bg-slate-100 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500/40 focus:bg-white"
      />
      {loading && <Loader2 className="w-3.5 h-3.5 text-slate-400 animate-spin absolute right-3 top-1/2 -translate-y-1/2" />}

      {open && q.trim().length >= 2 && (
        <div className="absolute top-full mt-2 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden z-50 max-h-96 overflow-y-auto">
          {results.length === 0 && !loading ? (
            <div className="px-4 py-6 text-center text-xs text-slate-400">No matches for “{q}”.</div>
          ) : (
            results.map((r, i) => (
              <button
                key={i}
                onClick={() => go(r.href)}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 text-left border-b border-slate-100 last:border-0"
              >
                <span className={`text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${TYPE_COLOR[r.type] ?? "text-slate-600 bg-slate-100"}`}>
                  {r.type}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-slate-900 truncate">{r.label}</p>
                  <p className="text-[11px] text-slate-500 truncate">{r.sub}</p>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
