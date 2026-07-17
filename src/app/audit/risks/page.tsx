// src/app/audit/risks/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, ShieldCheck, AlertTriangle, Search, Info } from "lucide-react";

export default function RiskRegister() {
  const [risks, setRisks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [activeRisk, setActiveRisk] = useState<any>(null);
  const [mitigationAction, setMitigationAction] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadRisks() {
    try {
      const res = await fetch("/api/risks");
      if (res.ok) {
        const data = await res.json();
        setRisks(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRisks();
  }, []);

  const handleUpdateMitigation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRisk || !mitigationAction) return;

    setSaving(true);
    try {
      const res = await fetch("/api/risks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: activeRisk.id,
          actionToAddressRisk: mitigationAction,
          status: "CLOSED",
          actualDateAddressed: new Date().toISOString().split("T")[0],
        }),
      });

      if (res.ok) {
        setActiveRisk(null);
        setMitigationAction("");
        loadRisks();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const filteredRisks = risks.filter((r) =>
    r.identifiedRisk.toLowerCase().includes(search.toLowerCase()) ||
    r.riskNumber.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* Header */}


      {/* Main Grid */}
      <main className="flex-1 p-6 max-w-7xl w-full mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-3 flex items-center justify-between gap-4 mb-1">
          <div className="flex items-center gap-3">
          <Link href="/" className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-900 transition-all">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-slate-900">Maintenance Risk Log</h1>
            <p className="text-[10px] text-emerald-600 font-mono tracking-wider uppercase">FMEA & Mitigation</p>
          </div>
        </div>
        </div>
        {/* Risk Register List */}
        <div className="lg:col-span-2 space-y-4">
          <div className="p-4 bg-white border border-slate-200 rounded-xl">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
              <input
                type="text"
                placeholder="Search by risk number or description..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-slate-100 border border-slate-200 focus:border-slate-300 rounded-lg py-2 pl-10 pr-4 text-xs placeholder-slate-500 focus:outline-none transition-all"
              />
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xl">
            {loading ? (
              <div className="py-20 flex flex-col items-center justify-center text-slate-500 gap-2">
                <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
                <p className="text-xs font-mono">Loading risk log...</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-200">
                {filteredRisks.map((risk) => {
                  const isHigh = risk.riskLevel === "HIGH";
                  return (
                    <div
                      key={risk.id}
                      onClick={() => {
                        setActiveRisk(risk);
                        setMitigationAction(risk.actionToAddressRisk || "");
                      }}
                      className={`p-5 cursor-pointer hover:bg-slate-50 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                        activeRisk?.id === risk.id ? "bg-slate-50 border-l-2 border-emerald-500" : ""
                      }`}
                    >
                      <div className="space-y-1.5 flex-1">
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-xs text-emerald-600 font-semibold">{risk.riskNumber}</span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${
                              isHigh
                                ? "bg-rose-500/10 text-rose-600 border-rose-500/20"
                                : "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                            }`}
                          >
                            Risk Level: {risk.riskLevel} (Score: {risk.impactRating})
                          </span>
                        </div>
                        <p className="text-slate-900 text-xs font-semibold leading-relaxed">{risk.identifiedRisk}</p>
                        <p className="text-[10px] text-slate-500 font-mono">Affects: {risk.affectedProcess}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Risk Assessment Details */}
        <div className="space-y-6">
          <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-6">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide border-b border-slate-200 pb-3">
              Risk Mitigation & Controls
            </h2>

            {activeRisk ? (
              <form onSubmit={handleUpdateMitigation} className="space-y-4">
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between border-b border-slate-200 pb-2">
                    <span className="text-slate-500">Likelihood Score</span>
                    <span className="font-semibold text-slate-900">{activeRisk.likelihood} / 5</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-200 pb-2">
                    <span className="text-slate-500">Consequence Impact</span>
                    <span className="font-semibold text-slate-900">{activeRisk.consequence} / 5</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-200 pb-2">
                    <span className="text-slate-500">Status</span>
                    <span className="font-semibold text-slate-900 uppercase">{activeRisk.status}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-500 uppercase">Mitigation Measure Plan</label>
                  <textarea
                    required
                    value={mitigationAction}
                    onChange={(e) => setMitigationAction(e.target.value)}
                    placeholder="Describe specific engineering or operational steps taken to reduce this risk..."
                    className="w-full h-32 bg-slate-100 border border-slate-200 focus:border-slate-300 rounded-lg p-2.5 text-xs text-slate-900 focus:outline-none resize-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={saving || !mitigationAction}
                  className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-emerald-950/20"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin mr-1" />} Update Risk Mitigation Controls
                </button>
              </form>
            ) : (
              <p className="text-xs text-slate-500 text-center py-12">
                Select a risk item from the registry list to log mitigation controls or evaluate likelihood scores.
              </p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
