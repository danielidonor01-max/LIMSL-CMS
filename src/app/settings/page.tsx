// src/app/settings/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { SlidersHorizontal, Clock, Save, ShieldAlert, Loader2, CalendarDays, Info, BellRing, Mail, KeyRound, Trash2, CheckCircle2, XCircle, PlugZap, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import Button from "@/components/Button";
import Toggle from "@/components/Toggle";
import { ROLE_LABELS, SETTINGS_WRITE_ROLES } from "@/lib/roles";
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
  const [tab, setTab] = useState<"calendar" | "notifications" | "integrations">("calendar");
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

  const loadCreds = () => {
    fetch("/api/settings/credentials")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.providers && setCreds(d.providers));
  };
  useEffect(loadCreds, []);

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
    try {
      const res = await fetch("/api/notifications/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: testEmail.trim() }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || "Failed to send test email.");
        return;
      }
      toast.success(`Test email sent to ${d.to}. Check the inbox (and spam).`);
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

  return (
    <div className="p-6 max-w-3xl w-full mx-auto space-y-6">
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

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200 overflow-x-auto">
        {([
          { id: "calendar", label: "Work Calendar", icon: CalendarDays },
          { id: "notifications", label: "Notifications & Email", icon: BellRing },
          { id: "integrations", label: "Integrations", icon: KeyRound },
        ] as const).map(({ id, label: l, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
              tab === id ? "text-emerald-700 border-emerald-500" : "text-slate-500 border-transparent hover:text-slate-900"
            }`}
          >
            <Icon className="w-4 h-4" /> {l}
          </button>
        ))}
      </div>

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

      {tab === "integrations" && (
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
        <div className="space-y-3">
          {creds.map((c) => (
            <div key={c.provider} className="rounded-lg border border-slate-200 p-3 space-y-2.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <span className="text-xs font-semibold text-slate-900">{c.label}</span>
                  <span className="text-[10px] text-slate-400 ml-2">{c.note}</span>
                </div>
                {c.configured ? (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-emerald-500/10 text-emerald-700 border-emerald-500/20">
                    Configured · {c.source === "ENV" ? "env var" : "saved"} · {c.keyHint}
                  </span>
                ) : (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-slate-100 text-slate-500 border-slate-200">
                    Not configured
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="password"
                  value={keyInput[c.provider] ?? ""}
                  onChange={(e) => setKeyInput((k) => ({ ...k, [c.provider]: e.target.value }))}
                  placeholder={c.configured ? "Paste a new key to replace…" : "Paste API key…"}
                  className="flex-1 min-w-56 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-emerald-500/40"
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
        </div>
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
      </div>
      )}

      {tab === "calendar" && meta.updatedByName && (
        <p className="text-[11px] text-slate-400 text-right">
          Last updated by {meta.updatedByName}
          {meta.updatedAt ? ` · ${new Date(meta.updatedAt).toLocaleString()}` : ""}
        </p>
      )}
    </div>
  );
}
