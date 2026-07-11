// src/app/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Wrench,
  AlertTriangle,
  FileText,
  Calendar,
  Layers,
  Activity,
  Scan,
  ShieldCheck,
  TrendingUp,
  User,
  Loader2,
} from "lucide-react";

export default function Home() {
  const [stats, setStats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      try {
        const res = await fetch("/api/dashboard/stats");
        if (res.ok) {
          const data = await res.json();
          setStats(data);
        }
      } catch (err) {
        console.error("Error loading dashboard stats:", err);
      } finally {
        setLoading(false);
      }
    }
    loadStats();
  }, []);

  const recentActivities = [
    {
      id: "ACT-001",
      type: "Breakdown",
      machine: "Stako CNC Machine (LEE/PE/1904)",
      desc: "X-Axis motion failure reported. Assigned to Godspower Michael & Marcel Imadojiemu.",
      date: "Today, 08:30 AM",
      status: "OPEN",
    },
    {
      id: "ACT-002",
      type: "PM Completion",
      machine: "Kone 12T Overhead Crane #1 (LEE/PE/0159)",
      desc: "Bi-monthly preventive maintenance completed. Safety pre-checks (PTW, LOTO) verified.",
      date: "Yesterday",
      status: "COMPLETED",
    },
    {
      id: "ACT-003",
      type: "WMS Approval",
      machine: "OMAG Press Brake Machine (LEE/PE/0399)",
      desc: "Work Method Statement approved by COO (Osaghale Ikpea) for upcoming blade change.",
      date: "2 days ago",
      status: "APPROVED",
    },
  ];

  const criticalEquipment = [
    { name: "Stako CNC Machine", tag: "LEE/PE/1904", bay: "Workshop", status: "BROKEN_DOWN", nextPM: "2026-02-15" },
    { name: "Metal Gennari Vertical Lathe", tag: "LEE/PE/0399", bay: "Bay 3", status: "OPERATIONAL", nextPM: "2026-04-10" },
    { name: "Sertom Plate Rolling Machine", tag: "LEE/PE/0348", bay: "Bay 2", status: "OPERATIONAL", nextPM: "2026-05-07" },
    { name: "Kone 12T Crane #1", tag: "LEE/PE/0159", bay: "Bay 1", status: "OPERATIONAL", nextPM: "2026-03-20" },
    { name: "Kone 24T Crane #1", tag: "LEE/PE/0160", bay: "Bay 2", status: "OPERATIONAL", nextPM: "2026-03-20" },
  ];

  // Default icons fallback mapping
  const iconMap: Record<string, any> = {
    AVAILABILITY: Activity,
    PM_COMPLIANCE: ShieldCheck,
    BREAKDOWNS: AlertTriangle,
    TOTAL_ASSETS: Layers,
  };

  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-100 flex flex-col font-sans">
      {/* Header */}
      <header className="border-b border-slate-800 bg-[#0f172a]/80 backdrop-blur-md sticky top-0 z-50 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Wrench className="w-5 h-5 text-slate-950 font-bold" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-white via-slate-100 to-emerald-400 bg-clip-text text-transparent">
              LIMSL CMS
            </h1>
            <p className="text-[10px] text-slate-400 font-mono tracking-widest uppercase">
              Maintenance Management Portal
            </p>
          </div>
        </div>

        {/* Profile */}
        <div className="flex items-center gap-3 border border-slate-800 rounded-full py-1.5 px-4 bg-slate-900/50">
          <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400 border border-emerald-500/20">
            <User className="w-4 h-4" />
          </div>
          <div className="text-left hidden md:block">
            <p className="text-xs font-semibold text-slate-200">Daniel Idonor</p>
            <p className="text-[9px] font-mono text-emerald-400 uppercase tracking-wider">System Owner</p>
          </div>
        </div>
      </header>

      {/* Main Grid */}
      <main className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-6">
        {/* Banner Alert for Stako Breakdown */}
        <div className="relative overflow-hidden rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="absolute top-0 right-0 w-64 h-64 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="flex items-center gap-3 relative z-10">
            <div className="p-2 bg-rose-500/20 text-rose-400 rounded-lg">
              <AlertTriangle className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <p className="text-sm font-semibold text-rose-200">Critical Breakdown Alert: Stako CNC Machine (LEE/PE/1904)</p>
              <p className="text-xs text-rose-300/80">Fault: No motion X axis. Open for 4 days. Corrective action is overdue.</p>
            </div>
          </div>
          <Link
            href="/corrective"
            className="relative z-10 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold transition-all shadow-md shadow-rose-950/20 whitespace-nowrap"
          >
            Open RCA & Action Log
          </Link>
        </div>

        {/* Executive Stats Card Panel */}
        {loading ? (
          <div className="py-12 flex justify-center items-center">
            <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
            <span className="text-xs text-slate-400 ml-2 font-mono">Loading metrics...</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {stats.map((stat, i) => {
              const Icon = iconMap[stat.code] || Activity;
              const isDanger = stat.status === "danger";
              const isWarning = stat.status === "warning";
              const colorClass = isDanger
                ? "text-rose-400"
                : isWarning
                ? "text-amber-400"
                : "text-emerald-400";
              const bgClass = isDanger
                ? "bg-rose-500/5 border-rose-500/15"
                : isWarning
                ? "bg-amber-500/5 border-amber-500/15"
                : "bg-emerald-500/5 border-emerald-500/15";
              return (
                <div key={i} className={`p-5 rounded-xl border ${bgClass} backdrop-blur-sm flex flex-col justify-between`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{stat.title}</span>
                    <div className={`p-2 rounded-lg bg-slate-900/50 ${colorClass}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="mt-4">
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-bold tracking-tight text-white">{stat.value}</span>
                      <span className="text-xs font-mono text-slate-500">/ {stat.target}</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-2 line-clamp-1">{stat.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Modules Quick Links */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Link
            href="/equipment"
            className="flex flex-col items-center justify-center p-4 bg-slate-900/30 hover:bg-slate-900/60 border border-slate-800 hover:border-slate-700 rounded-xl transition-all gap-2 text-center"
          >
            <Layers className="w-5 h-5 text-emerald-400" />
            <span className="text-xs font-semibold text-slate-200">Digital Twin</span>
          </Link>
          <Link
            href="/qr"
            className="flex flex-col items-center justify-center p-4 bg-slate-900/30 hover:bg-slate-900/60 border border-slate-800 hover:border-slate-700 rounded-xl transition-all gap-2 text-center"
          >
            <Scan className="w-5 h-5 text-emerald-400" />
            <span className="text-xs font-semibold text-slate-200">Scan QR Code</span>
          </Link>
          <Link
            href="/schedule"
            className="flex flex-col items-center justify-center p-4 bg-slate-900/30 hover:bg-slate-900/60 border border-slate-800 hover:border-slate-700 rounded-xl transition-all gap-2 text-center"
          >
            <Calendar className="w-5 h-5 text-emerald-400" />
            <span className="text-xs font-semibold text-slate-200">Annual Plan</span>
          </Link>
          <Link
            href="/wms"
            className="flex flex-col items-center justify-center p-4 bg-slate-900/30 hover:bg-slate-900/60 border border-slate-800 hover:border-slate-700 rounded-xl transition-all gap-2 text-center"
          >
            <FileText className="w-5 h-5 text-emerald-400" />
            <span className="text-xs font-semibold text-slate-200">WMS & Sign-Off</span>
          </Link>
          <Link
            href="/corrective"
            className="flex flex-col items-center justify-center p-4 bg-slate-900/30 hover:bg-slate-900/60 border border-slate-800 hover:border-slate-700 rounded-xl transition-all gap-2 text-center"
          >
            <AlertTriangle className="w-5 h-5 text-emerald-400" />
            <span className="text-xs font-semibold text-slate-200">Corrective / RCA</span>
          </Link>
          <Link
            href="/kpi"
            className="flex flex-col items-center justify-center p-4 bg-slate-900/30 hover:bg-slate-900/60 border border-slate-800 hover:border-slate-700 rounded-xl transition-all gap-2 text-center"
          >
            <TrendingUp className="w-5 h-5 text-emerald-400" />
            <span className="text-xs font-semibold text-slate-200">KPI Dashboard</span>
          </Link>
        </div>

        {/* Critical Equipment Status Table & Recent Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Status Table */}
          <div className="lg:col-span-2 p-5 bg-[#0f172a]/40 border border-slate-800 rounded-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold tracking-wide text-slate-200">Critical Machinery Status</h3>
              <Link href="/equipment" className="text-xs text-emerald-400 hover:underline">
                View All Assets
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-medium">
                    <th className="py-2">Equipment Name</th>
                    <th className="py-2">Tag ID</th>
                    <th className="py-2">Bay</th>
                    <th className="py-2">Status</th>
                    <th className="py-2">Next PM</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {criticalEquipment.map((eq, i) => {
                    const isBroken = eq.status === "BROKEN_DOWN";
                    return (
                      <tr key={i} className="hover:bg-slate-900/20 text-slate-300">
                        <td className="py-3 font-medium text-slate-200">{eq.name}</td>
                        <td className="py-3 font-mono text-slate-400">{eq.tag}</td>
                        <td className="py-3">{eq.bay}</td>
                        <td className="py-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                              isBroken
                                ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                                : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            }`}
                          >
                            {isBroken ? "Broken Down" : "Operational"}
                          </span>
                        </td>
                        <td className="py-3 font-mono text-slate-400">{eq.nextPM}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Recent Activity Log */}
          <div className="p-5 bg-[#0f172a]/40 border border-slate-800 rounded-xl space-y-4">
            <h3 className="text-sm font-semibold tracking-wide text-slate-200">Recent Activity Feed</h3>
            <div className="space-y-4">
              {recentActivities.map((act, i) => {
                const isBreakdown = act.type === "Breakdown";
                const isApproved = act.status === "APPROVED";
                return (
                  <div key={i} className="flex gap-3 text-xs leading-relaxed border-l-2 border-slate-800 pl-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-semibold tracking-wider text-[10px] ${
                            isBreakdown ? "text-rose-400" : isApproved ? "text-sky-400" : "text-emerald-400"
                          }`}
                        >
                          {act.type}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">{act.date}</span>
                      </div>
                      <p className="font-medium text-slate-200">{act.machine}</p>
                      <p className="text-slate-400 text-[11px]">{act.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-950/80 py-4 px-6 text-center text-[10px] text-slate-500 font-mono">
        &copy; {new Date().getFullYear()} Lee International Machinery and Services Limited. All rights reserved. | Compliance: ISO 9001:2015, ISO 45001.
      </footer>
    </div>
  );
}
