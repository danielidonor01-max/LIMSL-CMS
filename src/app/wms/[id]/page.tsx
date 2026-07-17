// src/app/wms/[id]/page.tsx
"use client";

import React, { useState, useEffect, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  FileText,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import SignoffChain from "@/components/SignoffChain";

export default function WmsDetail({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const wmsId = resolvedParams.id;

  const [wms, setWms] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadWms() {
      try {
        const res = await fetch(`/api/wms/${wmsId}`);
        if (res.ok) {
          const data = await res.json();
          setWms(data);
        }
      } catch (err) {
        console.error("Error loading WMS:", err);
      } finally {
        setLoading(false);
      }
    }
    loadWms();
  }, [wmsId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-500 font-mono text-xs gap-2">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-600" /> Loading WMS document...
      </div>
    );
  }

  if (!wms) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-3 text-slate-500 text-sm">
        <p>Work Method Statement not found.</p>
        <Link href="/wms" className="text-emerald-600 hover:underline">Back to WMS library</Link>
      </div>
    );
  }

  // Parse arrays. Items may be plain strings or {step, description}/{name} objects
  // depending on how the WMS was created — normalise to text for rendering.
  const asText = (v: unknown): string =>
    typeof v === "string"
      ? v
      : (v as { description?: string; name?: string; step?: string })?.description ??
        (v as { name?: string })?.name ??
        (v as { step?: string })?.step ??
        (v == null ? "" : JSON.stringify(v));
  const safeParse = (s: string | null): unknown[] => {
    if (!s) return [];
    try {
      const p = JSON.parse(s);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  };
  const procedureSteps = safeParse(wms.workProcedureSteps);
  const tools = safeParse(wms.equipmentAndTools);
  const materials = safeParse(wms.materials);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* Header */}


      {/* Main Grid */}
      <main className="flex-1 p-6 max-w-7xl w-full mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-3 flex items-center justify-between gap-4 mb-1">
          <div className="flex items-center gap-3">
          <Link href="/wms" className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-900 transition-all">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center">
            <FileText className="w-4.5 h-4.5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-slate-900">{wms.wmsNumber}</h1>
            <p className="text-[10px] text-emerald-600 font-mono tracking-wider uppercase">Method Statement & Quality Plan</p>
          </div>
        </div>
        </div>
        {/* Left Side: Document Sections */}
        <div className="lg:col-span-2 space-y-6">
          {/* Main Document Details */}
          <div className="p-6 bg-white border border-slate-200 rounded-xl space-y-6">
            <div className="border-b border-slate-200 pb-4">
              <h2 className="text-xl font-bold text-slate-900">{wms.title}</h2>
              <p className="text-xs text-slate-500 mt-1">Revision: {wms.revision} | Prepared by: {wms.preparedByName}</p>
            </div>

            {/* Scope / Purpose */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-600">1. Purpose & Scope</h3>
              <p className="text-xs text-slate-600 leading-relaxed">{wms.purpose}</p>
              <p className="text-xs text-slate-600 leading-relaxed mt-2">{wms.scope}</p>
            </div>

            {/* Mobilization */}
            {wms.mobilization && (
              <div className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-600">2. Mobilization & Prep</h3>
                <p className="text-xs text-slate-600 leading-relaxed">{wms.mobilization}</p>
              </div>
            )}

            {/* Tools & Materials */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-600">3. Equipment & Tools</h3>
                <ul className="list-disc pl-4 text-xs text-slate-600 space-y-1">
                  {tools.map((t: unknown, i: number) => (
                    <li key={i}>{asText(t)}</li>
                  ))}
                </ul>
              </div>
              <div className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-600">4. Materials Required</h3>
                <ul className="list-disc pl-4 text-xs text-slate-600 space-y-1">
                  {materials.map((m: unknown, i: number) => (
                    <li key={i}>{asText(m)}</li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Work Procedure steps */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-600">5. Detailed Work Procedure</h3>
              <div className="space-y-3">
                {procedureSteps.map((step: unknown, i: number) => (
                  <div key={i} className="flex gap-3 text-xs leading-relaxed">
                    <span className="w-5 h-5 rounded bg-slate-100 border border-slate-200 text-slate-500 flex items-center justify-center font-bold font-mono">
                      {(step as { step?: string })?.step ?? String.fromCharCode(65 + i)}
                    </span>
                    <p className="text-slate-700 flex-1">{asText(step)}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* HSE & QAQC */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-slate-200">
              <div className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-600">6. HSE Controls</h3>
                <p className="text-xs text-slate-600 leading-relaxed">{wms.hseRequirements}</p>
              </div>
              <div className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-600">7. Quality Assurance</h3>
                <p className="text-xs text-slate-600 leading-relaxed">{wms.qualityControlRequirements}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: authorisation status + sign-off chain */}
        <div className="space-y-6">
          <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-4">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide border-b border-slate-200 pb-3">
              WMS Document Status
            </h2>

            <div className="flex justify-between items-center bg-slate-100 border border-slate-200 p-3 rounded-lg text-xs">
              <span className="text-slate-500 font-mono">Document Status</span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                  wms.status === "APPROVED"
                    ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                    : wms.status === "UNDER_REVIEW"
                    ? "bg-amber-500/10 text-amber-600 border-amber-500/20"
                    : wms.status === "REJECTED"
                    ? "bg-rose-500/10 text-rose-600 border-rose-500/20"
                    : "bg-slate-200 text-slate-500 border-slate-200"
                }`}
              >
                {wms.status}
              </span>
            </div>

            <div className="flex items-start gap-2 text-[11px] text-slate-500">
              <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-0.5 text-emerald-600" />
              <span>
                Status is set by the sign-off chain below — it becomes <strong>APPROVED</strong> only when all four
                signatures are captured. Prepared by {wms.preparedByName ?? "—"}.
              </span>
            </div>
          </div>

          {/* WMS authorisation: Foreman → Maintenance Manager → HSE → Factory Manager (final) */}
          <div className="lg:col-span-3">
            <SignoffChain
              entityType="WMS"
              entityId={wmsId}
              title="WMS Authorisation (Foreman → Maintenance Manager → HSE → Factory Manager)"
            />
          </div>
        </div>
      </main>
    </div>
  );
}
