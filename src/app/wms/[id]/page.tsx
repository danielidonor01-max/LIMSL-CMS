// src/app/wms/[id]/page.tsx
"use client";

import React, { useState, useEffect, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  FileText,
  Loader2,
  CheckCircle2,
  Clock,
  ShieldCheck,
  UserCheck,
  XCircle,
} from "lucide-react";
import SignaturePad from "@/components/SignaturePad";
import SignoffChain from "@/components/SignoffChain";
import { toast } from "sonner";

export default function WmsDetail({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const resolvedParams = use(params);
  const wmsId = resolvedParams.id;

  const [wms, setWms] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Signatures for approval stages
  const [reviewSign, setReviewSign] = useState("");
  const [approveSign, setApproveSign] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");

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

  const handleReview = async () => {
    if (!reviewSign) {
      toast.error("Reviewer signature is required.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/wms/${wmsId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "UNDER_REVIEW",
          reviewedByName: "Kenneth Aloziem",
          reviewedBySignature: reviewSign,
          reviewedDate: new Date().toISOString().split("T")[0],
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setWms(data);
        toast.success("WMS reviewed and sent for management approval.");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async (approve: boolean) => {
    if (approve && !approveSign) {
      toast.error("Approver signature is required.");
      return;
    }
    if (!approve && !rejectionReason) {
      toast.error("Please provide a rejection reason.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/wms/${wmsId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: approve ? "APPROVED" : "REJECTED",
          approvedByName: "Osaghale Ikpea",
          approvedBySignature: approve ? approveSign : null,
          approvedDate: new Date().toISOString().split("T")[0],
          rejectionReason: approve ? null : rejectionReason,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setWms(data);
        toast.success(approve ? "WMS approved." : "WMS rejected.");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

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
            <FileText className="w-4.5 h-4.5 text-slate-950 font-bold" />
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

        {/* Right Side: 3-Stage Approval workflow panel */}
        <div className="space-y-6">
          <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-6">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide border-b border-slate-200 pb-3">
              WMS Document Approval State
            </h2>

            {/* Approval status badge */}
            <div className="flex justify-between items-center bg-slate-100 border border-slate-200 p-3 rounded-lg text-xs">
              <span className="text-slate-500 font-mono">Document Status</span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                  wms.status === "APPROVED"
                    ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                    : wms.status === "UNDER_REVIEW"
                    ? "bg-amber-500/10 text-amber-600 border-amber-500/20"
                    : "bg-slate-200 text-slate-500 border-slate-200"
                }`}
              >
                {wms.status}
              </span>
            </div>

            {/* 3 stages tracker list */}
            <div className="space-y-6 pt-2">
              {/* Stage 1: Prepared */}
              <div className="flex gap-3 text-xs">
                <div className="flex flex-col items-center">
                  <div className="w-6 h-6 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 flex items-center justify-center font-bold">
                    1
                  </div>
                  <div className="w-0.5 h-12 bg-slate-100" />
                </div>
                <div>
                  <p className="font-bold text-slate-900">Prepared by Technician</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">Author: {wms.preparedByName}</p>
                  <p className="text-[10px] text-emerald-600 font-mono mt-1">✓ SIGNED ON {wms.preparedDate}</p>
                </div>
              </div>

              {/* Stage 2: Reviewed */}
              <div className="flex gap-3 text-xs">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center font-bold border ${
                      wms.reviewedDate
                        ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                        : "bg-slate-100 text-slate-400 border-slate-200"
                    }`}
                  >
                    2
                  </div>
                  <div className="w-0.5 h-12 bg-slate-100" />
                </div>
                <div className="flex-1">
                  <p className="font-bold text-slate-900">Reviewed by Factory Coordinator</p>
                  {wms.reviewedDate ? (
                    <>
                      <p className="text-[10px] text-slate-500 mt-0.5">Reviewed by: {wms.reviewedByName}</p>
                      <p className="text-[10px] text-emerald-600 font-mono mt-1">✓ VERIFIED ON {wms.reviewedDate}</p>
                    </>
                  ) : wms.status === "DRAFT" ? (
                    <div className="mt-3 space-y-3">
                      <SignaturePad label="Draw signature to verify" onSave={setReviewSign} />
                      <button
                        type="button"
                        onClick={handleReview}
                        disabled={saving}
                        className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 rounded-lg text-xs font-bold transition-all shadow-md shadow-emerald-950/20"
                      >
                        Submit Verification Review
                      </button>
                    </div>
                  ) : (
                    <p className="text-[10px] text-slate-500 mt-0.5">Awaiting preparation steps...</p>
                  )}
                </div>
              </div>

              {/* Stage 3: Approved */}
              <div className="flex gap-3 text-xs">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center font-bold border ${
                      wms.status === "APPROVED"
                        ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                        : "bg-slate-100 text-slate-400 border-slate-200"
                    }`}
                  >
                    3
                  </div>
                </div>
                <div className="flex-1">
                  <p className="font-bold text-slate-900">Management Approval (COO)</p>
                  {wms.status === "APPROVED" ? (
                    <>
                      <p className="text-[10px] text-slate-500 mt-0.5">Approved by: {wms.approvedByName}</p>
                      <p className="text-[10px] text-emerald-600 font-mono mt-1">✓ APPROVED ON {wms.approvedDate}</p>
                    </>
                  ) : wms.status === "UNDER_REVIEW" ? (
                    <div className="mt-3 space-y-3">
                      <SignaturePad label="Draw signature to approve" onSave={setApproveSign} />
                      
                      <div className="space-y-1.5 pt-1">
                        <span className="text-[10px] font-bold text-slate-500 uppercase">Rejection Reason (If rejecting)</span>
                        <input
                          type="text"
                          value={rejectionReason}
                          onChange={(e) => setRejectionReason(e.target.value)}
                          placeholder="Provide details if document is rejected..."
                          className="w-full bg-slate-100 border border-slate-200 focus:border-slate-300 rounded-lg p-2 text-xs focus:outline-none"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => handleApprove(false)}
                          disabled={saving}
                          className="py-2 bg-rose-950 hover:bg-rose-900 border border-rose-900/40 text-rose-700 rounded-lg text-xs font-semibold transition-all"
                        >
                          Reject
                        </button>
                        <button
                          type="button"
                          onClick={() => handleApprove(true)}
                          disabled={saving}
                          className="py-2 bg-emerald-600 hover:bg-emerald-500 text-slate-950 rounded-lg text-xs font-bold transition-all shadow-md shadow-emerald-950/20"
                        >
                          Approve WMS
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-[10px] text-slate-500 mt-0.5">Awaiting WMS review stage...</p>
                  )}
                </div>
              </div>
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
