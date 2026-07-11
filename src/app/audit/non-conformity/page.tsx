// src/app/audit/non-conformity/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  ShieldAlert,
  AlertTriangle,
  Play,
  FileCheck,
  CheckCircle2,
  Clock,
  Search,
  Filter,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";

export default function NonConformityRegister() {
  const [ncList, setNcList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const [activeNc, setActiveNc] = useState<any>(null);
  const [rootCause, setRootCause] = useState("");
  const [correctiveAction, setCorrectiveAction] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadNCs() {
    try {
      const res = await fetch("/api/non-conformities");
      if (res.ok) {
        const data = await res.json();
        setNcList(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadNCs();
  }, []);

  const triggerAuditScan = async () => {
    setScanning(true);
    try {
      const res = await fetch("/api/audit/auto-detect", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        toast.success(`System audit scan complete! New non-conformities raised: ${data.newNonConformitiesRaised}`);
        loadNCs();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setScanning(false);
    }
  };

  const handleCloseNc = async (id: string) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/non-conformities/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "CLOSED",
          rootCause,
          correctiveAction,
        }),
      });

      if (res.ok) {
        setActiveNc(null);
        setRootCause("");
        setCorrectiveAction("");
        loadNCs();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  // Filter list
  const filteredNCs = ncList.filter((nc) => {
    const matchesSearch = nc.description.toLowerCase().includes(search.toLowerCase()) || nc.ncNumber.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "ALL" || nc.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur-md sticky top-0 z-50 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-900 transition-all">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center">
            <ShieldAlert className="w-4.5 h-4.5 text-slate-950 font-bold" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-slate-900">Non-Conformity Registry</h1>
            <p className="text-[10px] text-emerald-600 font-mono tracking-wider uppercase">ISO 9001 Compliance</p>
          </div>
        </div>

        <button
          onClick={triggerAuditScan}
          disabled={scanning}
          className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-slate-950 rounded-lg text-xs font-bold transition-all shadow-md shadow-emerald-950/20"
        >
          {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Trigger Compliance Audit Scan
        </button>
      </header>

      {/* Main Grid */}
      <main className="flex-1 p-6 max-w-7xl w-full mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Side: Filter and Registry List */}
        <div className="lg:col-span-2 space-y-4">
          <div className="p-4 bg-white border border-slate-200 rounded-xl flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="relative w-full md:max-w-xs">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
              <input
                type="text"
                placeholder="Search by code or description..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-slate-100 border border-slate-200 focus:border-slate-300 rounded-lg py-2 pl-10 pr-4 text-xs placeholder-slate-500 focus:outline-none transition-all"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono text-slate-500 uppercase">Filter Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-slate-100 border border-slate-200 rounded-lg p-2 text-xs focus:outline-none text-slate-600"
              >
                <option value="ALL">All Statuses</option>
                <option value="OPEN">Open NCs</option>
                <option value="CLOSED">Closed NCs</option>
              </select>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xl">
            {loading ? (
              <div className="py-20 flex flex-col items-center justify-center text-slate-500 gap-2">
                <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
                <p className="text-xs font-mono">Loading compliance registry...</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-200">
                {filteredNCs.length > 0 ? (
                  filteredNCs.map((nc) => {
                    const isOpen = nc.status === "OPEN";
                    return (
                      <div
                        key={nc.id}
                        onClick={() => setActiveNc(nc)}
                        className={`p-5 cursor-pointer hover:bg-slate-50 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                          activeNc?.id === nc.id ? "bg-slate-50 border-l-2 border-emerald-500" : ""
                        }`}
                      >
                        <div className="space-y-1.5 flex-1">
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-xs text-emerald-600 font-semibold">{nc.ncNumber}</span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[9px] font-semibold border ${
                                !isOpen
                                  ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                                  : "bg-rose-500/10 text-rose-600 border-rose-500/20"
                              }`}
                            >
                              {nc.status}
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono">Detected: {nc.detectedDate}</span>
                          </div>
                          <p className="text-slate-900 text-xs font-semibold leading-relaxed">{nc.description}</p>
                          <p className="text-[10px] text-slate-500 font-mono">Source: {nc.detectedBy}</p>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="py-12 text-center text-slate-500 text-xs">
                    No compliance non-conformities found.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Side: NC Action Log & Resolution */}
        <div className="space-y-6">
          <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-6">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide border-b border-slate-200 pb-3">
              Non-Conformity Action Center
            </h2>

            {activeNc ? (
              <div className="space-y-4">
                <div className="space-y-1 text-xs">
                  <span className="text-[10px] text-slate-500 uppercase font-mono block">NC Description</span>
                  <p className="bg-slate-100 p-3 rounded border border-slate-200 text-slate-600 leading-relaxed font-semibold">
                    {activeNc.description}
                  </p>
                </div>

                {activeNc.status === "CLOSED" ? (
                  <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 text-xs rounded-lg space-y-2">
                    <div className="flex items-center gap-1.5 font-bold">
                      <FileCheck className="w-5 h-5 flex-shrink-0" />
                      <span>Non-Conformity Resolved</span>
                    </div>
                    <p className="text-[11px] text-slate-500">**Root Cause Identified:** {activeNc.rootCause}</p>
                    <p className="text-[11px] text-slate-500">**Corrective Action Implemented:** {activeNc.correctiveAction}</p>
                  </div>
                ) : (
                  <div className="space-y-4 text-xs">
                    <div className="space-y-2">
                      <span className="text-xs font-semibold text-slate-500 uppercase">Investigated Root Cause</span>
                      <textarea
                        required
                        placeholder="Log why the non-conformity or missed PM schedule took place..."
                        value={rootCause}
                        onChange={(e) => setRootCause(e.target.value)}
                        className="w-full h-16 bg-slate-100 border border-slate-200 focus:border-slate-300 rounded-lg p-2 text-xs focus:outline-none resize-none text-slate-900"
                      />
                    </div>

                    <div className="space-y-2">
                      <span className="text-xs font-semibold text-slate-500 uppercase">Corrective / Preventive Action taken</span>
                      <textarea
                        required
                        placeholder="Describe exact actions taken to resolve the NC and prevent recurrence..."
                        value={correctiveAction}
                        onChange={(e) => setCorrectiveAction(e.target.value)}
                        className="w-full h-16 bg-slate-100 border border-slate-200 focus:border-slate-300 rounded-lg p-2 text-xs focus:outline-none resize-none text-slate-900"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => handleCloseNc(activeNc.id)}
                      disabled={saving || !rootCause || !correctiveAction}
                      className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-slate-950 rounded-lg text-xs font-bold transition-all shadow-md shadow-emerald-950/20"
                    >
                      Resolve & Close Non-Conformity
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-500 text-center py-12">
                Select a non-conformity item from the registry list to initiate correction logging or view details.
              </p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
