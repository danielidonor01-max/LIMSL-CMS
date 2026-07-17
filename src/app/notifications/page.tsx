// src/app/notifications/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell,
  Loader2,
  CheckCheck,
  ShieldCheck,
  AlertTriangle,
  FileText,
  BookText,
  ClipboardCheck,
  MessageCircle,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";

type Notif = {
  id: string;
  event: string;
  title: string;
  body: string;
  linkPath: string | null;
  readAt: string | null;
  channel: string;
  deliveryStatus: string;
  createdAt: string;
};

const EVENT_ICON: Record<string, React.ElementType> = {
  PTW_SIGN_REQUEST: ShieldCheck,
  WMS_SIGN_REQUEST: FileText,
  PROCEDURE_SIGN_REQUEST: BookText,
  PM_SIGN_REQUEST: ClipboardCheck,
  CORRECTIVE_SIGN_REQUEST: AlertTriangle,
  BREAKDOWN: AlertTriangle,
  GENERAL: Bell,
};

const DELIVERY_BADGE: Record<string, string> = {
  SENT: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  QUEUED: "bg-amber-500/10 text-amber-700 border-amber-500/20",
  SKIPPED: "bg-slate-200 text-slate-500 border-slate-300",
  FAILED: "bg-rose-500/10 text-rose-600 border-rose-500/20",
};

export default function NotificationsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const res = await fetch("/api/notifications");
      if (res.ok) {
        const d = await res.json();
        setRows(d.notifications ?? []);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function markAll() {
    const res = await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
    if (res.ok) {
      toast.success("All notifications marked read.");
      load();
    }
  }

  async function open(n: Notif) {
    if (!n.readAt) {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: n.id }),
      });
    }
    if (n.linkPath) router.push(n.linkPath);
    else load();
  }

  const unread = rows.filter((r) => !r.readAt).length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      <main className="flex-1 p-6 max-w-3xl w-full mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight">Notifications</h2>
              <p className="text-xs text-slate-500 font-mono">
                {unread > 0 ? `${unread} unread` : "All caught up"} · alerts also sent to WhatsApp when configured
              </p>
            </div>
          </div>
          {unread > 0 && (
            <button
              onClick={markAll}
              className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold"
            >
              <CheckCheck className="w-4 h-4" /> Mark all read
            </button>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {loading ? (
            <div className="py-20 flex justify-center text-slate-500">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
            </div>
          ) : rows.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-sm">No notifications yet.</div>
          ) : (
            <div className="divide-y divide-slate-200">
              {rows.map((n) => {
                const Icon = EVENT_ICON[n.event] ?? Bell;
                return (
                  <button
                    key={n.id}
                    onClick={() => open(n)}
                    className={`w-full text-left p-4 flex items-start gap-3 hover:bg-slate-50 transition-colors ${
                      n.readAt ? "" : "bg-emerald-50/40"
                    }`}
                  >
                    <div className={`mt-0.5 p-1.5 rounded-lg ${n.readAt ? "text-slate-400 bg-slate-100" : "text-emerald-600 bg-emerald-500/10"}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {!n.readAt && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />}
                        <p className={`text-sm ${n.readAt ? "font-medium text-slate-700" : "font-bold text-slate-900"}`}>{n.title}</p>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{n.body}</p>
                      <div className="flex items-center gap-3 mt-1.5 text-[10px] font-mono text-slate-400">
                        <span>{formatDate(n.createdAt)}</span>
                        <span className="inline-flex items-center gap-1">
                          <MessageCircle className="w-3 h-3" />
                          <span className={`px-1.5 py-0.5 rounded-full border ${DELIVERY_BADGE[n.deliveryStatus] ?? ""}`}>
                            WhatsApp {n.deliveryStatus}
                          </span>
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <p className="text-[11px] text-slate-400 text-center">
          WhatsApp delivery is best-effort — an alert always lands here in-app even if the message can&apos;t be delivered.
        </p>
      </main>
    </div>
  );
}
