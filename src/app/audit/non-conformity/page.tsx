// src/app/audit/non-conformity/page.tsx
"use client";

import React, { useState } from "react";
import { toast } from "sonner";
import { useApi } from "@/lib/api-cache";
import {
  ShieldAlert,
  Play,
  FileCheck,
  Search,
} from "lucide-react";
import Select from "@/components/Select";
import SignoffChain from "@/components/SignoffChain";
import Button from "@/components/Button";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import TableSkeleton from "@/components/TableSkeleton";
import { FIELD_CLASS, LABEL_CLASS } from "@/components/Field";

export default function NonConformityRegister() {
  const { data: ncList, loading, refresh } = useApi<any[]>("/api/non-conformities", []);
  const [scanning, setScanning] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const [activeNc, setActiveNc] = useState<any>(null);
  const [rootCause, setRootCause] = useState("");
  const [correctiveAction, setCorrectiveAction] = useState("");
  const [saving, setSaving] = useState(false);

  const loadNCs = () => {
    refresh();
  };

  const triggerAuditScan = async () => {
    setScanning(true);
    try {
      const res = await fetch("/api/audit/auto-detect", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        toast.success(`Audit scan complete: ${data.newNonConformitiesRaised} new non-conformities raised.`);
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

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || "Couldn't close the non-conformity.");
        return;
      }
      toast.success("Non-conformity closed out.");
      setActiveNc(null);
      setRootCause("");
      setCorrectiveAction("");
      loadNCs();
    } catch {
      toast.error("Couldn't close the non-conformity, check your connection and try again.");
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
      <main className="flex-1 p-6 max-w-7xl w-full mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-3">
          <PageHeader
            icon={ShieldAlert}
            title="Non-Conformity Registry"
            subtitle="Where the system fell short of the standard, and what was done about it"
            backHref="/"
            backLabel="Dashboard"
            actions={
              <Button icon={Play} onClick={triggerAuditScan} disabled={scanning} loading={scanning}>
                Trigger Compliance Audit Scan
              </Button>
            }
          />
        </div>
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
                className={`${FIELD_CLASS} pl-10`}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono text-slate-500 uppercase">Filter Status:</span>
              <Select
                value={statusFilter}
                onChange={(v) => setStatusFilter(v)}
              >
                <option value="ALL">All Statuses</option>
                <option value="OPEN">Open NCs</option>
                <option value="CLOSED">Closed NCs</option>
              </Select>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {loading ? (
              <TableSkeleton rows={6} cols={3} />
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
                            <span className="text-[10px] text-slate-500">
                              Detected: <span className="font-mono">{nc.detectedDate}</span>
                            </span>
                          </div>
                          <p className="text-slate-900 text-xs font-semibold leading-relaxed">{nc.description}</p>
                          <p className="text-[10px] text-slate-500">Source: {nc.detectedBy}</p>
                        </div>
                      </div>
                    );
                  })
                ) : search.trim() || statusFilter !== "ALL" ? (
                  <EmptyState
                    icon={Search}
                    title="No non-conformities match these filters"
                    message="Nothing in the registry matches the current search and status filter."
                    actionLabel="Clear filters"
                    onAction={() => {
                      setSearch("");
                      setStatusFilter("ALL");
                    }}
                  />
                ) : (
                  <EmptyState
                    icon={ShieldAlert}
                    title="No non-conformities recorded"
                    message="Nothing has been raised against the standard. Run a compliance audit scan to check the system for gaps."
                    actionLabel="Trigger Compliance Audit Scan"
                    onAction={triggerAuditScan}
                  />
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
                  <span className={LABEL_CLASS}>NC Description</span>
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
                    <p className="text-[11px] text-slate-500">
                      <span className="font-semibold text-slate-600">Root cause identified:</span> {activeNc.rootCause}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      <span className="font-semibold text-slate-600">Corrective action implemented:</span> {activeNc.correctiveAction}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4 text-xs">
                    <div>
                      <label htmlFor="nc-root-cause" className={LABEL_CLASS}>Investigated Root Cause</label>
                      <textarea
                        id="nc-root-cause"
                        required
                        placeholder="Log why the non-conformity or missed PM schedule took place..."
                        value={rootCause}
                        onChange={(e) => setRootCause(e.target.value)}
                        className={`${FIELD_CLASS} h-16 resize-none`}
                      />
                    </div>

                    <div>
                      <label htmlFor="nc-corrective-action" className={LABEL_CLASS}>Corrective / Preventive Action taken</label>
                      <textarea
                        id="nc-corrective-action"
                        required
                        placeholder="Describe exact actions taken to resolve the NC and prevent recurrence..."
                        value={correctiveAction}
                        onChange={(e) => setCorrectiveAction(e.target.value)}
                        className={`${FIELD_CLASS} h-16 resize-none`}
                      />
                    </div>

                    <Button
                      type="button"
                      fullWidth
                      onClick={() => handleCloseNc(activeNc.id)}
                      disabled={saving || !rootCause || !correctiveAction}
                      loading={saving}
                    >
                      Resolve &amp; Close Non-Conformity
                    </Button>
                  </div>
                )}

                {/* CAPA sign-off, close-out is gated on this chain completing,
                    including the independent effectiveness verification. */}
                <SignoffChain
                  entityType={activeNc.type === "SAFETY_INCIDENT" ? "SAFETY_INCIDENT" : "NON_CONFORMITY"}
                  entityId={activeNc.id}
                  title={activeNc.type === "SAFETY_INCIDENT" ? "Incident Investigation Sign-off" : "Corrective Action Sign-off"}
                />
              </div>
            ) : (
              <EmptyState
                icon={FileCheck}
                title="No non-conformity selected"
                message="Pick one from the registry to record its root cause and corrective action, or to review the sign-off chain."
              />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
