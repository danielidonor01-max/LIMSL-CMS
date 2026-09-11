// src/app/wms/[id]/page.tsx
"use client";

import DocumentSeal from "@/components/DocumentSeal";
import { useState, useEffect, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck, Biohazard } from "lucide-react";
import Button from "@/components/Button";
import SignoffChain from "@/components/SignoffChain";
import PageHeader from "@/components/PageHeader";

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
      <div className="min-h-screen bg-canvas flex items-center justify-center text-ink-500 text-xs gap-2">
        <Loader2 className="w-6 h-6 animate-spin text-brand-600" /> Loading WMS document...
      </div>
    );
  }

  if (!wms) {
    return (
      <div className="min-h-screen bg-canvas flex flex-col items-center justify-center gap-3 text-ink-500 text-sm">
        <p>Work Method Statement not found.</p>
        <Link href="/wms" className="text-brand-600 hover:underline">Back to WMS library</Link>
      </div>
    );
  }

  // Parse arrays. Items may be plain strings or {step, description}/{name} objects
  // depending on how the WMS was created, normalise to text for rendering.
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
    <div className="min-h-screen bg-canvas text-ink-900 flex flex-col font-sans">
      <main className="flex-1 p-6 lg:p-8 max-w-7xl w-full mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-3">
          <PageHeader
            title="Work Method Statement"
            subtitle="How the job is to be done safely, with its quality plan and approvals"
            code={wms.wmsNumber}
            backHref="/wms"
            backLabel="Work Method Statements"
            actions={
              /* The next document in the chain, raised from the one it is
                 written against. Without this the analysis is reached by
                 leaving the record, opening the JHA module and picking this
                 method statement back out of a list, which is how the two end
                 up pointing at different jobs. */
              wms.status === "APPROVED" ? (
                <Button href={`/jha/new?wmsId=${wms.id}`} icon={Biohazard}>
                  Create JHA from this WMS
                </Button>
              ) : (
                <span className="text-xs text-ink-500 max-w-xs text-right leading-snug">
                  A hazard analysis is written against an approved method statement. This one is{" "}
                  {String(wms.status).toLowerCase().replace(/_/g, " ")}.
                </span>
              )
            }
          />
        </div>
        {/* Left Side: Document Sections */}
        <div className="lg:col-span-2 space-y-8">
          {/* Main Document Details */}
          <div className="p-6 bg-surface border border-line rounded-2xl shadow-card space-y-8">
            <div className="border-b border-ink-200 pb-4">
              <h2 className="text-xl font-bold text-ink-900">{wms.title}</h2>
              <p className="text-xs text-ink-500 mt-1">Revision: {wms.revision} | Prepared by: {wms.preparedByName}</p>
            </div>

            {/* Scope / Purpose */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-brand-600">1. Purpose & Scope</h3>
              <p className="text-xs text-ink-600 leading-relaxed">{wms.purpose}</p>
              <p className="text-xs text-ink-600 leading-relaxed mt-2">{wms.scope}</p>
            </div>

            {/* Mobilization */}
            {wms.mobilization && (
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-brand-600">2. Mobilization & Prep</h3>
                <p className="text-xs text-ink-600 leading-relaxed">{wms.mobilization}</p>
              </div>
            )}

            {/* Tools & Materials */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-brand-600">3. Equipment & Tools</h3>
                <ul className="list-disc pl-4 text-xs text-ink-600 space-y-1">
                  {tools.map((t: unknown, i: number) => (
                    <li key={i}>{asText(t)}</li>
                  ))}
                </ul>
              </div>
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-brand-600">4. Materials Required</h3>
                <ul className="list-disc pl-4 text-xs text-ink-600 space-y-1">
                  {materials.map((m: unknown, i: number) => (
                    <li key={i}>{asText(m)}</li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Work Procedure steps */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-brand-600">5. Detailed Work Procedure</h3>
              <div className="space-y-3">
                {procedureSteps.map((step: unknown, i: number) => (
                  <div key={i} className="flex gap-3 text-xs leading-relaxed">
                    <span className="w-5 h-5 rounded bg-ink-100 border border-ink-200 text-ink-500 flex items-center justify-center font-bold">
                      {(step as { step?: string })?.step ?? String.fromCharCode(65 + i)}
                    </span>
                    <p className="text-ink-700 flex-1">{asText(step)}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* HSE & QAQC */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-ink-200">
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-brand-600">6. HSE Controls</h3>
                <p className="text-xs text-ink-600 leading-relaxed">{wms.hseRequirements}</p>
              </div>
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-brand-600">7. Quality Assurance</h3>
                <p className="text-xs text-ink-600 leading-relaxed">{wms.qualityControlRequirements}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: authorisation status + sign-off chain */}
        <div className="space-y-8">
          <div className="p-5 bg-surface border border-line rounded-2xl shadow-card space-y-4">
            <h2 className="text-base font-semibold text-ink-900 border-b border-ink-200 pb-3">
              WMS Document Status
            </h2>

            <div className="flex justify-between items-center bg-ink-100 border border-ink-200 p-3 rounded-lg text-xs">
              <span className="text-ink-500">Document Status</span>
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-bold border ${
 wms.status === "APPROVED"
 ? "bg-brand-500/10 text-brand-600 border-brand-500/20"
 : wms.status === "UNDER_REVIEW"
 ? "bg-warn-500/10 text-warn-600 border-warn-500/20"
 : wms.status === "REJECTED"
 ? "bg-danger-500/10 text-danger-600 border-danger-500/20"
 : "bg-ink-200 text-ink-500 border-ink-200"
 }`}
              >
                {wms.status}
              </span>
            </div>

            <div className="flex items-start gap-2 text-xs text-ink-500">
              <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-0.5 text-brand-600" />
              <span>
                Status is set by the sign-off chain below, it becomes <strong>APPROVED</strong> only when all four
                signatures are captured. Prepared by {wms.preparedByName ?? "-"}.
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
            {/* Prints with the page, and only once the statement is approved. */}
            <DocumentSeal entityType="WMS" entityId={wmsId} />
          </div>
        </div>
      </main>
    </div>
  );
}
