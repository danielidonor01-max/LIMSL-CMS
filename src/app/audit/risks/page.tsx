// src/app/audit/risks/page.tsx
"use client";

import React, { useState } from "react";
import { ShieldCheck, Search } from "lucide-react";
import { useApi } from "@/lib/api-cache";
import Button from "@/components/Button";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import TableSkeleton from "@/components/TableSkeleton";
import { FIELD_CLASS, LABEL_CLASS } from "@/components/Field";

export default function RiskRegister() {
  const { data: risks, loading, refresh } = useApi<any[]>("/api/risks", []);
  const [search, setSearch] = useState("");

  const [activeRisk, setActiveRisk] = useState<any>(null);
  const [mitigationAction, setMitigationAction] = useState("");
  const [saving, setSaving] = useState(false);

  const loadRisks = () => {
    refresh();
  };

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
    <div className="min-h-screen bg-ink-50 text-ink-900 flex flex-col font-sans">
      <main className="flex-1 p-6 max-w-7xl w-full mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-3">
          <PageHeader
            icon={ShieldCheck}
            title="Maintenance Risk Log"
            subtitle="Identified risks, their likelihood and severity, and the controls in place"
            backHref="/"
            backLabel="Dashboard"
          />
        </div>
        {/* Risk Register List */}
        <div className="lg:col-span-2 space-y-4">
          <div className="p-4 bg-white border border-ink-200 rounded-xl">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-ink-500" />
              <input
                type="text"
                placeholder="Search by risk number or description..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={`${FIELD_CLASS} pl-10`}
              />
            </div>
          </div>

          <div className="bg-white border border-ink-200 rounded-xl overflow-hidden">
            {loading ? (
              <TableSkeleton rows={6} cols={3} />
            ) : filteredRisks.length === 0 ? (
              search.trim() ? (
                <EmptyState
                  icon={Search}
                  title="No risks match your search"
                  message="Nothing in the risk log matches that risk number or description."
                  actionLabel="Clear search"
                  onAction={() => setSearch("")}
                />
              ) : (
                <EmptyState
                  icon={ShieldCheck}
                  title="No risks recorded"
                  message="The risk log is empty. Risks raised against maintenance processes will appear here for mitigation and sign-off."
                />
              )
            ) : (
              <div className="divide-y divide-ink-200">
                {filteredRisks.map((risk) => {
                  const isHigh = risk.riskLevel === "HIGH";
                  return (
                    <div
                      key={risk.id}
                      onClick={() => {
                        setActiveRisk(risk);
                        setMitigationAction(risk.actionToAddressRisk || "");
                      }}
                      className={`p-5 cursor-pointer hover:bg-ink-50 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                        activeRisk?.id === risk.id ? "bg-ink-50 border-l-2 border-brand-500" : ""
                      }`}
                    >
                      <div className="space-y-1.5 flex-1">
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-xs text-brand-600 font-semibold">{risk.riskNumber}</span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${
                              isHigh
                                ? "bg-danger-500/10 text-danger-600 border-danger-500/20"
                                : "bg-brand-500/10 text-brand-600 border-brand-500/20"
                            }`}
                          >
                            Risk Level: {risk.riskLevel} (Score: {risk.impactRating})
                          </span>
                        </div>
                        <p className="text-ink-900 text-xs font-semibold leading-relaxed">{risk.identifiedRisk}</p>
                        <p className="text-[10px] text-ink-500">Affects: {risk.affectedProcess}</p>
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
          <div className="p-5 bg-white border border-ink-200 rounded-xl space-y-6">
            <h2 className="text-sm font-bold text-ink-900 uppercase tracking-wide border-b border-ink-200 pb-3">
              Risk Mitigation & Controls
            </h2>

            {activeRisk ? (
              <form onSubmit={handleUpdateMitigation} className="space-y-4">
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between border-b border-ink-200 pb-2">
                    <span className="text-ink-500">Likelihood Score</span>
                    <span className="font-semibold text-ink-900">{activeRisk.likelihood} / 5</span>
                  </div>
                  <div className="flex justify-between border-b border-ink-200 pb-2">
                    <span className="text-ink-500">Consequence Impact</span>
                    <span className="font-semibold text-ink-900">{activeRisk.consequence} / 5</span>
                  </div>
                  <div className="flex justify-between border-b border-ink-200 pb-2">
                    <span className="text-ink-500">Status</span>
                    <span className="font-semibold text-ink-900 uppercase">{activeRisk.status}</span>
                  </div>
                </div>

                <div>
                  <label htmlFor="mitigation-plan" className={LABEL_CLASS}>Mitigation Measure Plan</label>
                  <textarea
                    id="mitigation-plan"
                    required
                    value={mitigationAction}
                    onChange={(e) => setMitigationAction(e.target.value)}
                    placeholder="Describe specific engineering or operational steps taken to reduce this risk..."
                    className={`${FIELD_CLASS} h-32 resize-none`}
                  />
                </div>

                <Button type="submit" fullWidth disabled={saving || !mitigationAction} loading={saving}>
                  Update Risk Mitigation Controls
                </Button>
              </form>
            ) : (
              <EmptyState
                icon={ShieldCheck}
                title="No risk selected"
                message="Pick a risk from the list to record the controls put in place, or to review its likelihood and consequence scores."
              />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
