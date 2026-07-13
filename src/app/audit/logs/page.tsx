// src/app/audit/logs/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, List, Shield, User, Clock, HardDrive } from "lucide-react";

export default function AuditTrailLogs() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadLogs() {
      try {
        const res = await fetch("/api/audit");
        if (res.ok) {
          const data = await res.json();
          setLogs(data);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadLogs();
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* Header */}


      {/* Main Content */}
      <main className="flex-1 p-6 max-w-4xl w-full mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4 mb-1">
          <div className="flex items-center gap-3">
          <Link href="/" className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-900 transition-all">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center">
            <Shield className="w-4.5 h-4.5 text-slate-950 font-bold" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-slate-900">System Audit Log</h1>
            <p className="text-[10px] text-emerald-600 font-mono tracking-wider uppercase">Compliance Trail</p>
          </div>
        </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xl">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
            <List className="w-4 h-4 text-emerald-600" />
            <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Historical Audit Logs</h2>
          </div>

          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center text-slate-500 gap-2">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
              <p className="text-xs font-mono">Loading system logs...</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {logs.length > 0 ? (
                logs.map((log) => (
                  <div key={log.id} className="p-4 flex gap-4 text-xs">
                    <div className="p-2 bg-slate-100 rounded-lg text-slate-500 h-8 w-8 flex items-center justify-center">
                      <Clock className="w-4.5 h-4.5" />
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-slate-900">{log.action}</span>
                        <span className="text-[10px] text-slate-500 font-mono">{log.timestamp}</span>
                      </div>
                      <p className="text-slate-500 text-[11px]">{log.entityDescription || "No description provided."}</p>
                      <div className="flex items-center gap-4 text-[10px] text-slate-500 font-mono pt-1">
                        <span className="flex items-center gap-1"><User className="w-3 h-3" /> {log.userName || "System"}</span>
                        <span className="flex items-center gap-1"><HardDrive className="w-3 h-3" /> Entity: {log.entityType} ({log.entityId || "N/A"})</span>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-12 text-center text-slate-500 text-xs">
                  No activity audit logs found in the database.
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
