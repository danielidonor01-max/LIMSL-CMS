// src/app/settings/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { SlidersHorizontal, Clock, Save, ShieldAlert, Loader2, CalendarDays, Info, BellRing, Mail, KeyRound, Trash2, CheckCircle2, XCircle, PlugZap, RefreshCw, Cloud, Database, Users as UsersIcon, ChevronRight, UserCircle, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import Button from "@/components/Button";
import Toggle from "@/components/Toggle";
import { Badge } from "@/components/Badge";
import { ROLES, ROLE_LABELS, SETTINGS_WRITE_ROLES } from "@/lib/roles";
import {
  productiveHoursPerDay,
  productionDowntimeHours,
  type WorkSettings,
  DEFAULT_WORK_SETTINGS,
} from "@/lib/worktime";

// Display order Mon→Sun (JS weekday numbers, 0=Sun..6=Sat).
const DAYS: { n: number; label: string }[] = [
  { n: 1, label: "Mon" },
  { n: 2, label: "Tue" },
  { n: 3, label: "Wed" },
  { n: 4, label: "Thu" },
  { n: 5, label: "Fri" },
  { n: 6, label: "Sat" },
  { n: 0, label: "Sun" },
];

export default function AppSettingsPage() {
  const { data: session, status } = useSession();
  const role = (session?.user as { role?: string })?.role;
  const canWrite = !!role && SETTINGS_WRITE_ROLES.includes(role);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  type TabId = "calendar" | "notifications" | "ai" | "sharepoint" | "data";
  const [tab, setTab] = useState<TabId>("calendar");

  // Deep-linkable sections (/settings?tab=ai) so other pages can point straight
  // at the right pane; "integrations" is the legacy name for the AI pane.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (!t) return;
    const mapped = t === "integrations" ? "ai" : t;
    if (["calendar", "notifications", "ai", "sharepoint", "data"].includes(mapped)) setTab(mapped as TabId);
  }, []);
  const switchTab = (t: TabId) => {
    setTab(t);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", t);
    window.history.replaceState(null, "", url.toString());
  };
  const [form, setForm] = useState<WorkSettings>(DEFAULT_WORK_SETTINGS);
  const [lunchEnabled, setLunchEnabled] = useState(true);
  const [meta, setMeta] = useState<{ updatedByName: string | null; updatedAt: string | null }>({
    updatedByName: null,
    updatedAt: null,
  });

  // Live preview window — demonstrates the maths against the *unsaved* form.
  const [previewStart, setPreviewStart] = useState("");
  const [previewEnd, setPreviewEnd] = useState("");

  const [escalating, setEscalating] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [sendingTest, setSendingTest] = useState(false);
  const [diagnosis, setDiagnosis] = useState<any>(null);
  const [verifying, setVerifying] = useState(false);
  type EmailStatus = {
    ready: boolean; reason: string | null; enabled: boolean; from: string;
    host: string | null; port: number; secure: boolean; hasUser: boolean; hasPass: boolean; appUrlSet: boolean;
    hints?: string[];
  };
  const [emailStatus, setEmailStatus] = useState<EmailStatus | null>(null);

  const loadEmailStatus = () => {
    fetch("/api/notifications/test", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setEmailStatus(d));
  };
  useEffect(loadEmailStatus, []);

  // Notification routing — which events send, and to which roles.
  type RoutingEvent = { event: string; label: string; desc: string; personal: boolean; defaultRoles: string[] | null };
  const [routingEvents, setRoutingEvents] = useState<RoutingEvent[]>([]);
  const [routing, setRouting] = useState<Record<string, { enabled: boolean; roles: string[] | null }>>({});
  const [routingSaving, setRoutingSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings/notification-routing")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setRoutingEvents(d.events ?? []);
        setRouting(d.routing ?? {});
      });
  }, []);

  const routeFor = (ev: RoutingEvent) => routing[ev.event] ?? { enabled: true, roles: null };
  const setRoute = (event: string, patch: Partial<{ enabled: boolean; roles: string[] | null }>) =>
    setRouting((r) => ({ ...r, [event]: { ...(r[event] ?? { enabled: true, roles: null }), ...patch } }));
  const toggleRouteRole = (ev: RoutingEvent, roleKey: string) => {
    const cur = routeFor(ev);
    const base = cur.roles ?? ev.defaultRoles ?? [];
    const next = base.includes(roleKey) ? base.filter((x) => x !== roleKey) : [...base, roleKey];
    setRoute(ev.event, { roles: next });
  };
  const saveRoutingCfg = async () => {
    setRoutingSaving(true);
    try {
      const res = await fetch("/api/settings/notification-routing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ routing }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || "Failed to save routing.");
        return;
      }
      setRouting(d.routing ?? {});
      toast.success("Notification routing saved.");
    } finally {
      setRoutingSaving(false);
    }
  };

  const verifyConnection = async () => {
    setVerifying(true);
    try {
      const res = await fetch("/api/notifications/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verifyOnly: true }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || "Connection failed.");
        return;
      }
      toast.success("SMTP connection verified — credentials accepted.");
    } catch {
      toast.error("Connection check failed.");
    } finally {
      setVerifying(false);
    }
  };

  // AI provider API keys (encrypted at rest; only masked hints reach the client)
  type Cred = {
    provider: string; label: string; note: string; configured: boolean;
    source: "ENV" | "DB" | null; keyHint: string | null; updatedByName: string | null; updatedAt: string | null;
  };
  const [creds, setCreds] = useState<Cred[]>([]);
  const [keyInput, setKeyInput] = useState<Record<string, string>>({});
  const [credBusy, setCredBusy] = useState<string | null>(null); // `${provider}:${action}`
  const [aiTab, setAiTab] = useState<string | null>(null); // selected provider tab

  const loadCreds = () => {
    fetch("/api/settings/credentials")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.providers && setCreds(d.providers));
  };
  useEffect(loadCreds, []);

  // SharePoint (Microsoft Graph) connection
  type SpStatus = { configured: boolean; siteUrl: string | null; clientIdHint: string | null; updatedByName: string | null; updatedAt: string | null };
  const [spStatus, setSpStatus] = useState<SpStatus | null>(null);
  const [spForm, setSpForm] = useState({ tenantId: "", clientId: "", clientSecret: "", siteUrl: "" });
  const [spBusy, setSpBusy] = useState<null | "save" | "test" | "remove">(null);

  useEffect(() => {
    fetch("/api/settings/sharepoint")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setSpStatus(d));
  }, []);

  const saveSharepoint = async () => {
    setSpBusy("save");
    try {
      const res = await fetch("/api/settings/sharepoint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(spForm),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || "Failed to connect.");
        return;
      }
      toast.success(d.detail || "SharePoint connected.");
      setSpStatus(d.status);
      setSpForm({ tenantId: "", clientId: "", clientSecret: "", siteUrl: "" });
    } finally {
      setSpBusy(null);
    }
  };

  const testSharepointConn = async () => {
    setSpBusy("test");
    try {
      const res = await fetch("/api/settings/sharepoint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test" }),
      });
      const d = await res.json();
      if (d.ok) toast.success(d.detail);
      else toast.error(d.detail || d.error || "Connection failed.");
    } finally {
      setSpBusy(null);
    }
  };

  const [dbMaintBusy, setDbMaintBusy] = useState(false);
  const runDbMaintenance = async () => {
    setDbMaintBusy(true);
    try {
      const res = await fetch("/api/admin/db-maintenance", { method: "POST" });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || "Maintenance failed.");
        return;
      }
      if (d.ok) toast.success(`Indexes verified/applied (${d.applied.length}).`);
      else toast.error(`${d.applied.length} applied, ${d.failed.length} failed — see server logs.`);
    } finally {
      setDbMaintBusy(false);
    }
  };

  const removeSharepoint = async () => {
    setSpBusy("remove");
    try {
      const res = await fetch("/api/settings/sharepoint", { method: "DELETE" });
      if (res.ok) {
        toast.success("SharePoint connection removed.");
        setSpStatus({ configured: false, siteUrl: null, clientIdHint: null, updatedByName: null, updatedAt: null });
      }
    } finally {
      setSpBusy(null);
    }
  };

  const saveKey = async (provider: string) => {
    const key = (keyInput[provider] || "").trim();
    if (!key) {
      toast.error("Paste the API key first.");
      return;
    }
    setCredBusy(`${provider}:save`);
    try {
      const res = await fetch("/api/settings/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, key }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || "Failed to save key.");
        return;
      }
      toast.success(`${provider} key saved (${d.keyHint}).`);
      setKeyInput((k) => ({ ...k, [provider]: "" }));
      loadCreds();
    } finally {
      setCredBusy(null);
    }
  };

  const testKey = async (provider: string) => {
    setCredBusy(`${provider}:test`);
    try {
      const key = (keyInput[provider] || "").trim();
      const res = await fetch("/api/settings/credentials?action=test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, key: key || undefined }),
      });
      const d = await res.json();
      if (d.ok) toast.success(`${provider}: ${d.detail}`);
      else toast.error(`${provider}: ${d.detail ?? d.error ?? "Test failed."}`);
    } finally {
      setCredBusy(null);
    }
  };

  const removeKey = async (provider: string) => {
    setCredBusy(`${provider}:remove`);
    try {
      const res = await fetch("/api/settings/credentials", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      if (res.ok) {
        toast.success(`${provider} key removed.`);
        loadCreds();
      } else toast.error("Failed to remove key.");
    } finally {
      setCredBusy(null);
    }
  };

  const sendTestEmail = async () => {
    setSendingTest(true);
    setDiagnosis(null);
    try {
      const res = await fetch("/api/notifications/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: testEmail.trim() }),
      });
      const d = await res.json();
      if (d.diagnosis) setDiagnosis({ ...d.diagnosis, smtpResponse: d.smtpResponse ?? null });
      if (!res.ok) {
        toast.error(d.error || "Failed to send test email.");
        return;
      }
      // "Accepted by the relay" is all we actually know. Saying "delivered"
      // sends the admin looking in an inbox when the message is in quarantine.
      if (d.diagnosis?.severity === "warn") {
        toast.warning(`Handed to the mail server for ${d.to} — but it may be filtered. See the note below.`);
      } else {
        toast.success(`Test email sent to ${d.to}. Check the inbox (and spam).`);
      }
    } catch {
      toast.error("Failed to send test email.");
    } finally {
      setSendingTest(false);
    }
  };

  const runEscalation = async () => {
    setEscalating(true);
    try {
      const res = await fetch("/api/escalations/run", { method: "POST" });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || "Escalation run failed.");
        return;
      }
      if (d.notificationsSent === 0 && d.skippedDuplicate === 0) {
        toast.success("Nothing overdue or due soon — no reminders needed.");
      } else if (d.notificationsSent === 0) {
        toast.success(`Already notified today — ${d.skippedDuplicate} digest(s) skipped.`);
      } else {
        toast.success(
          `${d.overdueActivities} overdue, ${d.upcomingActivities} due soon, ` +
            `${d.lapsedPermits} lapsed permit(s) → ${d.notificationsSent} notification(s) sent.`,
        );
      }
    } catch {
      toast.error("Escalation run failed.");
    } finally {
      setEscalating(false);
    }
  };

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        if (d && !d.error) {
          setForm({
            workDayStart: d.workDayStart,
            workDayEnd: d.workDayEnd,
            lunchStart: d.lunchStart,
            lunchEnd: d.lunchEnd,
            workingDays: d.workingDays,
            weekendOvertime: d.weekendOvertime,
          });
          setLunchEnabled(!!(d.lunchStart && d.lunchEnd));
          setMeta({ updatedByName: d.updatedByName, updatedAt: d.updatedAt });
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const effective: WorkSettings = useMemo(
    () => ({ ...form, lunchStart: lunchEnabled ? form.lunchStart : null, lunchEnd: lunchEnabled ? form.lunchEnd : null }),
    [form, lunchEnabled],
  );

  const perDay = useMemo(() => productiveHoursPerDay(effective), [effective]);
  const previewHours = useMemo(
    () => (previewStart && previewEnd ? productionDowntimeHours(previewStart, previewEnd, effective) : null),
    [previewStart, previewEnd, effective],
  );

  const toggleDay = (n: number) =>
    setForm((f) => ({
      ...f,
      workingDays: f.workingDays.includes(n) ? f.workingDays.filter((d) => d !== n) : [...f.workingDays, n].sort(),
    }));

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          lunchStart: lunchEnabled ? form.lunchStart : null,
          lunchEnd: lunchEnabled ? form.lunchEnd : null,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || "Failed to save settings.");
        return;
      }
      setMeta({ updatedByName: d.updatedByName, updatedAt: d.updatedAt });
      toast.success("Working-hours settings saved. Downtime & KPIs now use these hours.");
    } catch {
      toast.error("Failed to save settings.");
    } finally {
      setSaving(false);
    }
  };

  if (status === "loading" || loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (!canWrite) {
    return (
      <div className="p-10 max-w-md mx-auto text-center space-y-3">
        <ShieldAlert className="w-10 h-10 text-rose-500 mx-auto" />
        <h2 className="text-lg font-bold text-slate-900">Access restricted</h2>
        <p className="text-sm text-slate-500">
          App settings are available to Super Admins only. Your role is{" "}
          <span className="font-semibold">{ROLE_LABELS[role ?? "VIEWER"] ?? role}</span>.
        </p>
      </div>
    );
  }

  const label = "text-xs font-semibold text-slate-500 uppercase tracking-wide";
  const timeField =
    "bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-emerald-500/40";

  const aiConfigured = creds.filter((c) => c.configured).length;
  const NAV: { id: TabId; label: string; desc: string; icon: typeof CalendarDays; status?: { ok: boolean; text: string } }[] = [
    { id: "calendar", label: "Work Calendar", desc: "Production hours — the basis of downtime & KPIs", icon: CalendarDays },
    {
      id: "notifications", label: "Notifications & Email", desc: "SMTP delivery, digests, test send", icon: BellRing,
      status: emailStatus ? { ok: emailStatus.ready, text: emailStatus.ready ? "Configured" : "Not configured" } : undefined,
    },
    {
      id: "ai", label: "AI Providers", desc: "API keys & the diagnosis failover chain", icon: KeyRound,
      status: { ok: aiConfigured > 0, text: aiConfigured > 0 ? `${aiConfigured} active` : "No keys" },
    },
    {
      id: "sharepoint", label: "SharePoint", desc: "Pull live Excel registers from Microsoft 365", icon: Cloud,
      status: spStatus ? { ok: spStatus.configured, text: spStatus.configured ? "Connected" : "Not connected" } : undefined,
    },
    { id: "data", label: "Data & Users", desc: "Go-live imports and user accounts", icon: Database },
  ];

  return (
    <div className="p-6 max-w-5xl w-full mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200">
          <SlidersHorizontal className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">App Settings</h2>
          <p className="text-xs text-slate-500 font-mono">Super Admin · organisation-wide configuration</p>
        </div>
      </div>

      <div className="lg:grid lg:grid-cols-[230px_1fr] lg:gap-8 lg:items-start space-y-4 lg:space-y-0">
        {/* Mobile: horizontal pills */}
        <div className="lg:hidden flex gap-1.5 overflow-x-auto pb-1 -mb-1">
          {NAV.map(({ id, label: l, icon: Icon, status: st }) => (
            <button
              key={id}
              onClick={() => switchTab(id)}
              className={`inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-lg text-xs font-semibold whitespace-nowrap border transition-colors ${
                tab === id ? "bg-emerald-600 border-emerald-600 text-white" : "bg-white border-slate-200 text-slate-600"
              }`}
            >
              <Icon className="w-4 h-4" /> {l}
              {st && <span className={`w-1.5 h-1.5 rounded-full ${st.ok ? "bg-emerald-400" : "bg-amber-400"} ${tab === id ? "ring-1 ring-white/60" : ""}`} />}
            </button>
          ))}
        </div>

        {/* Desktop: nav rail */}
        <nav className="hidden lg:block sticky top-6 space-y-1" aria-label="Settings sections">
          {NAV.map(({ id, label: l, desc, icon: Icon, status: st }) => (
            <button
              key={id}
              onClick={() => switchTab(id)}
              aria-current={tab === id ? "page" : undefined}
              className={`w-full text-left rounded-lg px-3 py-2.5 border transition-colors ${
                tab === id ? "bg-white border-emerald-200 shadow-sm" : "border-transparent hover:bg-white hover:border-slate-200"
              }`}
            >
              <span className="flex items-center gap-2">
                <Icon className={`w-4 h-4 shrink-0 ${tab === id ? "text-emerald-600" : "text-slate-400"}`} />
                <span className={`text-sm font-semibold ${tab === id ? "text-slate-900" : "text-slate-600"}`}>{l}</span>
                {st && (
                  <span
                    className={`ml-auto w-2 h-2 rounded-full shrink-0 ${st.ok ? "bg-emerald-500" : "bg-amber-400"}`}
                    title={st.text}
                  />
                )}
              </span>
              <span className="block text-[11px] text-slate-400 mt-0.5 ml-6 leading-snug">{desc}</span>
            </button>
          ))}
        </nav>

        <div className="min-w-0 space-y-6">

      {tab === "calendar" && (
      <div className="space-y-6">
      {/* Why it matters */}
      <div className="flex items-start gap-2.5 p-3 rounded-lg bg-sky-50 border border-sky-100 text-sky-800 text-xs">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <p>
          Downtime, MTTR and MTBF count <strong>production hours</strong>, not wall-clock hours. A machine that stops at
          16:00 Friday and is restored 09:00 Monday is down only the hours the workshop would have been running — the
          weekend and off-shift hours below are excluded automatically.
        </p>
      </div>

      {/* Working hours */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-5">
        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide flex items-center gap-2">
          <Clock className="w-4 h-4 text-emerald-600" /> Daily Working Window
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="space-y-1.5">
            <label className={label}>Work start</label>
            <input type="time" value={form.workDayStart} onChange={(e) => setForm((f) => ({ ...f, workDayStart: e.target.value }))} className={`${timeField} w-full`} />
          </div>
          <div className="space-y-1.5">
            <label className={label}>Work end</label>
            <input type="time" value={form.workDayEnd} onChange={(e) => setForm((f) => ({ ...f, workDayEnd: e.target.value }))} className={`${timeField} w-full`} />
          </div>
          <div className="space-y-1.5">
            <label className={label}>Lunch start</label>
            <input type="time" value={form.lunchStart ?? ""} disabled={!lunchEnabled} onChange={(e) => setForm((f) => ({ ...f, lunchStart: e.target.value }))} className={`${timeField} w-full disabled:opacity-50`} />
          </div>
          <div className="space-y-1.5">
            <label className={label}>Lunch end</label>
            <input type="time" value={form.lunchEnd ?? ""} disabled={!lunchEnabled} onChange={(e) => setForm((f) => ({ ...f, lunchEnd: e.target.value }))} className={`${timeField} w-full disabled:opacity-50`} />
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <Toggle checked={lunchEnabled} onChange={setLunchEnabled} ariaLabel="Deduct a lunch break from production time" />
          <span className="text-xs text-slate-600">Deduct a lunch break from production time</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-500">Productive hours per working day:</span>
          <span className="font-bold text-emerald-700 font-mono">{perDay.toFixed(2)} h</span>
        </div>
      </section>

      {/* Working days */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-emerald-600" /> Production Days
        </h3>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((d) => {
            const on = form.workingDays.includes(d.n);
            return (
              <button
                key={d.n}
                type="button"
                onClick={() => toggleDay(d.n)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                  on
                    ? "bg-emerald-600 border-emerald-600 text-white"
                    : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"
                }`}
              >
                {d.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2.5">
          <Toggle
            checked={form.weekendOvertime}
            onChange={(v) => setForm((f) => ({ ...f, weekendOvertime: v }))}
            ariaLabel="Count weekend hours as production time"
          />
          <span className="text-xs text-slate-600">Count weekend (Sat/Sun) hours as production time when worked (overtime)</span>
        </div>
      </section>

      {/* Live downtime preview */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">Downtime Preview</h3>
        <p className="text-xs text-slate-500">Test the current (unsaved) settings against any outage window.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className={label}>Machine went down</label>
            <input type="datetime-local" value={previewStart} onChange={(e) => setPreviewStart(e.target.value)} className={`${timeField} w-full`} />
          </div>
          <div className="space-y-1.5">
            <label className={label}>Restored to service</label>
            <input type="datetime-local" value={previewEnd} onChange={(e) => setPreviewEnd(e.target.value)} className={`${timeField} w-full`} />
          </div>
        </div>
        {previewHours !== null && (
          <div className="flex items-center gap-2 text-sm p-3 rounded-lg bg-slate-50 border border-slate-200">
            <span className="text-slate-500">Production downtime:</span>
            <span className="font-bold text-slate-900 font-mono">{previewHours.toFixed(2)} h</span>
          </div>
        )}
      </section>

      <div className="flex justify-end">
        <Button onClick={save} loading={saving} icon={Save}>Save work calendar</Button>
      </div>
      </div>
      )}

      {tab === "ai" && (
      <div className="space-y-6">
      {/* AI provider API keys */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-emerald-600" /> AI Provider API Keys
        </h3>
        <p className="text-xs text-slate-500">
          Keys power the AI layers of the troubleshooting module. Stored encrypted; only a masked hint is ever shown.
          A platform environment variable overrides the key saved here.
        </p>
        <div className="flex items-start gap-2 text-[11px] text-sky-800 bg-sky-50 border border-sky-100 rounded-lg px-3 py-2">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>
            Configured providers form a <strong>failover chain</strong> in the order below: every AI diagnosis tries
            the first configured provider, and moves to the next automatically when one runs out of free quota or
            errors. Add more than one key and an exhausted free tier never stops a diagnosis.
          </span>
        </div>
        {/* Summary table — the whole chain at a glance */}
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50">
              <tr className="text-slate-500 border-b border-slate-200">
                <th className="py-2.5 px-3 font-medium w-10">#</th>
                <th className="py-2.5 px-3 font-medium">Provider</th>
                <th className="py-2.5 px-3 font-medium">Status</th>
                <th className="py-2.5 px-3 font-medium">Key</th>
                <th className="py-2.5 px-3 font-medium hidden md:table-cell">Saved by</th>
                <th className="py-2.5 px-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {creds.map((c, ci) => (
                <tr
                  key={c.provider}
                  onClick={() => setAiTab(c.provider)}
                  className={`cursor-pointer transition-colors ${(aiTab ?? creds[0]?.provider) === c.provider ? "bg-emerald-50/50" : "hover:bg-slate-50"}`}
                >
                  <td className="py-2.5 px-3">
                    <span className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center ${c.configured ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"}`} title={`Failover priority ${ci + 1}`}>
                      {ci + 1}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 font-semibold text-slate-900">{c.label}</td>
                  <td className="py-2.5 px-3">
                    {c.configured ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-emerald-500/10 text-emerald-700 border-emerald-500/20">
                        <CheckCircle2 className="w-3 h-3" /> Active · {c.source === "ENV" ? "env" : "saved"}
                      </span>
                    ) : (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-slate-100 text-slate-500 border-slate-200">Not configured</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-slate-500">{c.keyHint ?? "—"}</td>
                  <td className="py-2.5 px-3 text-slate-400 hidden md:table-cell">
                    {c.updatedByName ? `${c.updatedByName}${c.updatedAt ? ` · ${new Date(c.updatedAt).toLocaleDateString()}` : ""}` : "—"}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <Button size="sm" variant="secondary" loading={credBusy === `${c.provider}:test`} onClick={(e) => { e.stopPropagation(); testKey(c.provider); }}>
                      Test
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Per-provider tabs — manage one key at a time */}
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1 overflow-x-auto">
          {creds.map((c) => {
            const active = (aiTab ?? creds[0]?.provider) === c.provider;
            return (
              <button
                key={c.provider}
                onClick={() => setAiTab(c.provider)}
                className={`px-3 py-2 rounded-md text-xs font-semibold whitespace-nowrap inline-flex items-center gap-1.5 transition-colors ${
                  active ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {c.label}
                <span className={`w-1.5 h-1.5 rounded-full ${c.configured ? "bg-emerald-500" : "bg-slate-300"}`} />
              </button>
            );
          })}
        </div>
        {creds
          .filter((c) => c.provider === (aiTab ?? creds[0]?.provider))
          .map((c) => (
            <div key={c.provider} className="rounded-lg border border-slate-200 p-4 space-y-3">
              <p className="text-xs text-slate-500">{c.note}</p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="password"
                  value={keyInput[c.provider] ?? ""}
                  onChange={(e) => setKeyInput((k) => ({ ...k, [c.provider]: e.target.value }))}
                  placeholder={c.configured ? "Paste a new key to replace…" : "Paste API key…"}
                  className="flex-1 min-w-56 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15"
                  disabled={c.source === "ENV"}
                />
                <Button size="sm" icon={Save} loading={credBusy === `${c.provider}:save`} onClick={() => saveKey(c.provider)} disabled={c.source === "ENV"}>
                  Save
                </Button>
                <Button size="sm" variant="secondary" loading={credBusy === `${c.provider}:test`} onClick={() => testKey(c.provider)}>
                  Test
                </Button>
                {c.source === "DB" && (
                  <Button size="sm" variant="ghost" icon={Trash2} loading={credBusy === `${c.provider}:remove`} onClick={() => removeKey(c.provider)}>
                    Remove
                  </Button>
                )}
              </div>
              {c.source === "ENV" && (
                <p className="text-[10px] text-slate-400">Managed by the {c.provider}_API_KEY environment variable on the server.</p>
              )}
              {c.updatedByName && c.source === "DB" && (
                <p className="text-[10px] text-slate-400">Saved by {c.updatedByName}{c.updatedAt ? ` · ${new Date(c.updatedAt).toLocaleString()}` : ""}</p>
              )}
            </div>
          ))}
      </section>
      </div>
      )}

      {tab === "sharepoint" && (
      <div className="space-y-6">
      {/* SharePoint (Microsoft 365) connection */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide flex items-center gap-2">
            <Cloud className="w-4 h-4 text-emerald-600" /> SharePoint Connection
          </h3>
          {spStatus?.configured ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-emerald-500/10 text-emerald-700 border-emerald-500/20">
              <CheckCircle2 className="w-3.5 h-3.5" /> Connected
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-slate-100 text-slate-500 border-slate-200">
              Not connected
            </span>
          )}
        </div>
        <p className="text-xs text-slate-500">
          Pull the live Excel registers straight from your SharePoint document library into the Data Import
          pipeline. Credentials are stored encrypted.
        </p>

        {spStatus?.configured ? (
          <div className="space-y-3">
            <div className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 space-y-0.5">
              <p><span className="text-slate-400">Site:</span> <span className="font-mono">{spStatus.siteUrl}</span></p>
              <p><span className="text-slate-400">App (client) ID:</span> <span className="font-mono">{spStatus.clientIdHint}</span></p>
              {spStatus.updatedByName && (
                <p className="text-[10px] text-slate-400">Saved by {spStatus.updatedByName}{spStatus.updatedAt ? ` · ${new Date(spStatus.updatedAt).toLocaleString()}` : ""}</p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" icon={PlugZap} loading={spBusy === "test"} onClick={testSharepointConn}>
                Test connection
              </Button>
              <Button variant="secondary" icon={Trash2} loading={spBusy === "remove"} onClick={removeSharepoint}>
                Remove
              </Button>
            </div>
            <p className="text-[11px] text-slate-400">
              Import files from the connected site in <span className="font-semibold">Settings → Data Import → From SharePoint</span>.
              To change the site or credentials, remove and reconnect.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide mb-1">One-time Azure setup (IT admin)</p>
              <ol className="text-[11px] text-slate-600 list-decimal list-inside space-y-0.5">
                <li>Azure Portal → Microsoft Entra ID → App registrations → New registration.</li>
                <li>API permissions → Microsoft Graph → <span className="font-mono">Application</span> → add <span className="font-mono">Sites.Read.All</span> → Grant admin consent.</li>
                <li>Certificates &amp; secrets → New client secret — copy its <em>Value</em> immediately.</li>
                <li>The Tenant ID and Client ID are on the app&apos;s Overview page.</li>
              </ol>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              {([
                { k: "tenantId", label: "Tenant ID", ph: "00000000-0000-0000-0000-000000000000" },
                { k: "clientId", label: "Client ID", ph: "00000000-0000-0000-0000-000000000000" },
                { k: "clientSecret", label: "Client Secret (value)", ph: "•••••••••", secret: true },
                { k: "siteUrl", label: "Site URL", ph: "https://yourcompany.sharepoint.com/sites/Maintenance" },
              ] as { k: keyof typeof spForm; label: string; ph: string; secret?: boolean }[]).map((f) => (
                <div key={f.k} className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-500 uppercase">{f.label}</label>
                  <input
                    type={f.secret ? "password" : "text"}
                    value={spForm[f.k]}
                    onChange={(e) => setSpForm((s) => ({ ...s, [f.k]: e.target.value }))}
                    placeholder={f.ph}
                    autoComplete="off"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15"
                  />
                </div>
              ))}
            </div>
            <Button
              icon={PlugZap}
              loading={spBusy === "save"}
              onClick={saveSharepoint}
              disabled={!spForm.tenantId || !spForm.clientId || !spForm.clientSecret || !spForm.siteUrl}
            >
              Connect &amp; save
            </Button>
          </div>
        )}
      </section>
      </div>
      )}

      {tab === "data" && (
      <div className="space-y-3">
        {([
          {
            href: "/settings/import",
            icon: Database,
            title: "Data Import",
            desc: "Go-live registers from CSV / Excel or straight from SharePoint — equipment, schedule, users and components, with preview before commit.",
          },
          {
            href: "/settings/users",
            icon: UsersIcon,
            title: "User Management",
            desc: "Accounts, roles and access — create users, reset passwords, deactivate leavers.",
          },
          {
            href: "/account",
            icon: UserCircle,
            title: "My Account & Preferences",
            desc: "Personal settings — density, landing page, notification and AI-chat preferences. Every user has their own.",
          },
        ] as const).map(({ href, icon: Icon, title, desc }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-4 bg-white border border-slate-200 rounded-xl p-4 hover:border-emerald-300 hover:shadow-sm transition-all group"
          >
            <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-100 shrink-0">
              <Icon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">{title}</p>
              <p className="text-xs text-slate-500 mt-0.5 leading-snug">{desc}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-emerald-500 ml-auto shrink-0 transition-colors" />
          </Link>
        ))}

        {/* Database maintenance — self-service index migration for the deployed DB. */}
        <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-2.5">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-semibold text-slate-900">Database maintenance</h3>
          </div>
          <p className="text-xs text-slate-500 leading-snug">
            Applies the performance indexes this version of the app expects (equipment lookups, per-machine
            documents/components/history, audit queries). Safe to run any time — it only creates what&apos;s missing
            and never touches data. Run once after updating the app.
          </p>
          <Button variant="secondary" icon={RefreshCw} loading={dbMaintBusy} onClick={runDbMaintenance}>
            Apply performance indexes
          </Button>
        </section>
      </div>
      )}

      {tab === "notifications" && (
      <div className="space-y-6">
      {/* Email delivery */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide flex items-center gap-2">
            <Mail className="w-4 h-4 text-emerald-600" /> Email Delivery
          </h3>
          <div className="flex items-center gap-2">
            {emailStatus && (
              emailStatus.ready ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-emerald-500/10 text-emerald-700 border-emerald-500/20">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Configured
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-amber-500/10 text-amber-700 border-amber-500/20">
                  <XCircle className="w-3.5 h-3.5" /> Not configured
                </span>
              )
            )}
            <button
              onClick={loadEmailStatus}
              title="Re-check after redeploying"
              className="p-1 rounded-md text-slate-400 hover:text-emerald-600 hover:bg-emerald-50"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <p className="text-xs text-slate-500">
          Reminders, escalations and sign-off requests are emailed to each person&apos;s address when SMTP is configured.
          Set the variables below in your hosting environment (Vercel → Project → Settings → Environment Variables),
          redeploy, then verify the connection and send a test.
        </p>

        {emailStatus && !emailStatus.ready && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3">
            {/* Auto-detected likely causes (wrong value / misnamed variable). */}
            {emailStatus.hints && emailStatus.hints.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 space-y-1">
                <p className="text-[11px] font-semibold text-amber-800 uppercase tracking-wide flex items-center gap-1">
                  <Info className="w-3.5 h-3.5" /> Likely cause detected
                </p>
                {emailStatus.hints.map((h, i) => (
                  <p key={i} className="text-[11px] text-amber-800">• {h}</p>
                ))}
              </div>
            )}
            {/* Per-variable diagnosis — shows exactly what this deployment sees. */}
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">What this deployment sees</p>
              {([
                { k: "EMAIL_ENABLED", ok: emailStatus.enabled, note: "must be exactly true (no quotes)" },
                { k: "SMTP_HOST", ok: !!emailStatus.host, note: "e.g. smtp.gmail.com" },
                { k: "SMTP_USER", ok: emailStatus.hasUser, note: "the sending address" },
                { k: "SMTP_PASS", ok: emailStatus.hasPass, note: "16-char Google App Password" },
                { k: "EMAIL_FROM", ok: !!emailStatus.from, note: "sender name/address" },
                { k: "APP_URL", ok: emailStatus.appUrlSet, note: "optional — absolute email links", optional: true },
              ] as { k: string; ok: boolean; note: string; optional?: boolean }[]).map((v) => (
                <div key={v.k} className="flex items-center gap-2 text-[11px]">
                  {v.ok ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  ) : (
                    <XCircle className={`w-3.5 h-3.5 shrink-0 ${v.optional ? "text-slate-300" : "text-rose-500"}`} />
                  )}
                  <span className={`font-mono ${v.ok ? "text-slate-700" : v.optional ? "text-slate-400" : "text-rose-600 font-semibold"}`}>{v.k}</span>
                  <span className="text-slate-400">— {v.ok ? "set" : v.optional ? "not set (optional)" : `missing · ${v.note}`}</span>
                </div>
              ))}
            </div>

            <div className="space-y-1.5 pt-1 border-t border-slate-200">
              <p className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Set these in Vercel → Settings → Environment Variables (Production), then redeploy</p>
              <pre className="text-[11px] font-mono text-slate-700 whitespace-pre-wrap leading-relaxed">{`EMAIL_ENABLED=true
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=you@gmail.com
SMTP_PASS=<16-char Google App Password>
EMAIL_FROM=LIMSL CMS <you@gmail.com>
APP_URL=https://<your-app>.vercel.app`}</pre>
              <p className="text-[11px] text-amber-700">
                Common cause: env vars only apply to <strong>new</strong> deployments and to the <strong>environment they&apos;re scoped to</strong>.
                Add them to <strong>Production</strong>, don&apos;t wrap values in quotes, then trigger a fresh redeploy. Full walkthrough:
                <span className="font-mono"> docs/NOTIFICATIONS.md</span>.
              </p>
            </div>
          </div>
        )}

        {emailStatus && emailStatus.ready && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
            <div className="rounded-lg border border-slate-200 p-2">
              <p className="text-slate-400 uppercase tracking-wide">Host</p>
              <p className="font-mono text-slate-700 truncate">{emailStatus.host}:{emailStatus.port}</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-2">
              <p className="text-slate-400 uppercase tracking-wide">Security</p>
              <p className="font-mono text-slate-700">{emailStatus.secure ? "SSL (465)" : "STARTTLS"}</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-2 col-span-2">
              <p className="text-slate-400 uppercase tracking-wide">From</p>
              <p className="font-mono text-slate-700 truncate">{emailStatus.from}</p>
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
          <div className="flex-1 space-y-1.5">
            <label className={label}>Send a test to (optional)</label>
            <input
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="name@leemachinery.net — blank sends to you"
              className={`${timeField} w-full`}
            />
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" icon={PlugZap} loading={verifying} onClick={verifyConnection} disabled={!emailStatus?.ready}>
              Verify connection
            </Button>
            <Button icon={Mail} loading={sendingTest} onClick={sendTestEmail} disabled={!emailStatus?.ready}>
              Send test
            </Button>
          </div>
        </div>

        {/* Where the mail actually goes. SMTP acceptance is not delivery, and a
            green tick against a quarantined message costs hours of looking in
            the wrong place. */}
        {diagnosis && (
          <div
            className={`rounded-lg border p-4 space-y-3 ${
              diagnosis.severity === "fail"
                ? "bg-rose-50 border-rose-200"
                : diagnosis.severity === "warn"
                  ? "bg-amber-50 border-amber-200"
                  : "bg-emerald-50 border-emerald-200"
            }`}
          >
            <div className="flex items-start gap-2.5">
              {diagnosis.severity === "ok" ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle
                  className={`w-4 h-4 shrink-0 mt-0.5 ${diagnosis.severity === "fail" ? "text-rose-600" : "text-amber-600"}`}
                />
              )}
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-900">Delivery route for {diagnosis.recipient}</p>
                <p className="text-xs text-slate-700 mt-1 leading-relaxed">{diagnosis.headline}</p>
              </div>
            </div>

            {diagnosis.actions?.length > 0 && (
              <ol className="space-y-1.5 pl-1">
                {diagnosis.actions.map((a: string, i: number) => (
                  <li key={i} className="flex gap-2 text-xs text-slate-700 leading-relaxed">
                    <span className="font-mono text-slate-400 shrink-0">{i + 1}.</span>
                    <span>{a}</span>
                  </li>
                ))}
              </ol>
            )}

            <div className="pt-2 border-t border-black/5 grid gap-1 text-[11px] text-slate-500 font-mono">
              {diagnosis.mxHosts?.length > 0 && <p className="truncate">MX · {diagnosis.mxHosts.join(", ")}</p>}
              {diagnosis.smtpResponse && <p className="truncate">SMTP · {diagnosis.smtpResponse}</p>}
            </div>
          </div>
        )}
      </section>

      {/* Overdue escalations */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide flex items-center gap-2">
          <BellRing className="w-4 h-4 text-emerald-600" /> Maintenance Reminders &amp; Escalations
        </h3>
        <p className="text-xs text-slate-500">
          Reminds responsible people about maintenance <strong>due soon</strong>, and escalates <strong>overdue</strong>
          activities and lapsed permits to them and to managers. Runs safely any number of times a day (each item is only
          notified once). Wire the endpoint to a daily scheduler, or run it on demand here.
        </p>
        <Button variant="secondary" icon={BellRing} loading={escalating} onClick={runEscalation}>
          Run escalation now
        </Button>
      </section>

      {/* Notification routing — who gets what */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide flex items-center gap-2">
            <BellRing className="w-4 h-4 text-emerald-600" /> Notification Routing
          </h3>
          <Button icon={Save} loading={routingSaving} onClick={saveRoutingCfg}>Save routing</Button>
        </div>
        <p className="text-xs text-slate-500">
          Control which notification kinds are sent, and which roles receive the role-targeted ones. Personal notices
          (your sign-off step, a work order assigned to you) always go to the person concerned — routing can only switch
          them off. Each recipient&apos;s own channel preferences (email, sound, desktop) still apply on top.
        </p>
        <div className="divide-y divide-slate-100">
          {routingEvents.map((ev) => {
            const r = routeFor(ev);
            const activeRoles = r.roles ?? ev.defaultRoles;
            return (
              <div key={ev.event} className="py-3 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">{ev.label}</p>
                    <p className="text-[11px] text-slate-500">{ev.desc}</p>
                  </div>
                  <Toggle checked={r.enabled !== false} onChange={(v) => setRoute(ev.event, { enabled: v })} ariaLabel={`${ev.label} enabled`} />
                </div>
                {r.enabled !== false && !ev.personal && ev.defaultRoles && (
                  <div className="flex flex-wrap gap-1.5">
                    {ROLES.filter((rk) => rk !== "SUPER_ADMIN").map((rk) => {
                      const on = (activeRoles ?? []).includes(rk);
                      return (
                        <button
                          key={rk}
                          onClick={() => toggleRouteRole(ev, rk)}
                          className={`px-2 py-1 rounded-full text-[10px] font-semibold border transition-colors ${
                            on ? "bg-emerald-600 border-emerald-600 text-white" : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"
                          }`}
                        >
                          {ROLE_LABELS[rk] ?? rk}
                        </button>
                      );
                    })}
                  </div>
                )}
                {r.enabled !== false && !ev.personal && !ev.defaultRoles && (
                  <p className="text-[10px] text-slate-400">Sent to whoever must sign the pending step (chain-driven).</p>
                )}
              </div>
            );
          })}
        </div>
      </section>
      </div>
      )}

      {tab === "calendar" && meta.updatedByName && (
        <p className="text-[11px] text-slate-400 text-right">
          Last updated by {meta.updatedByName}
          {meta.updatedAt ? ` · ${new Date(meta.updatedAt).toLocaleString()}` : ""}
        </p>
      )}
        </div>
      </div>
    </div>
  );
}
