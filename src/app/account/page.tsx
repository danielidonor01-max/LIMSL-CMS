// src/app/account/page.tsx
// Self-service account page, every user manages their own profile and
// preferences here (no admin rights needed). Distinct from /settings/users
// (Super Admin account administration) and /settings (org-wide app settings).
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import {
  UserCircle, Loader2, Save, KeyRound, Mail, Phone, MessageCircle, SlidersHorizontal,
  LayoutGrid, Rows3, Bell, ChevronRight, Sparkles, Check,
} from "lucide-react";
import Button from "@/components/Button";
import Select from "@/components/Select";
import Toggle from "@/components/Toggle";
import { Badge } from "@/components/Badge";
import { ROLE_BADGE } from "@/lib/roles";
import { useUserPrefs } from "@/components/PreferencesProvider";
import { DEFAULT_PREFS, LANDING_OPTIONS, type UserPrefs } from "@/lib/user-prefs";
import PageSkeleton from "@/components/Skeleton";

type Me = {
  name: string; email: string; phone: string; whatsapp: string;
  role: string; roleLabel: string; department: string | null; jobTitle: string | null;
  preferences: UserPrefs;
};

export default function AccountPage() {
  const { update } = useSession();
  const { refresh } = useUserPrefs();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [prefsSavedAt, setPrefsSavedAt] = useState<number | null>(null);
  const [emailDraft, setEmailDraft] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);

  const requestEmailChange = async () => {
    const next = emailDraft.trim().toLowerCase();
    if (!next) return;
    setEmailBusy(true);
    try {
      const res = await fetch("/api/account/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: next }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || "Could not start the change.");
        return;
      }
      setPendingEmail(d.pending);
      setEmailDraft("");
      toast.success("Check the new address for a confirmation link.");
    } finally {
      setEmailBusy(false);
    }
  };

  const [profile, setProfile] = useState({ name: "", email: "", phone: "", whatsapp: "" });
  const [prefs, setPrefs] = useState<UserPrefs>(DEFAULT_PREFS);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Me | null) => {
        if (!d) return;
        setMe(d);
        setProfile({ name: d.name, email: d.email, phone: d.phone, whatsapp: d.whatsapp });
        setPrefs(d.preferences);
      })
      .finally(() => setLoading(false));
  }, []);

  const saveProfile = async () => {
    setSavingProfile(true);
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // Email is deliberately excluded. It changes through a verified flow of
        // its own, because a typo here would break password recovery.
        body: JSON.stringify({ ...profile, email: undefined }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || "Could not save profile.");
        return;
      }
      toast.success("Profile updated.");
      if (d.name) await update({ name: d.name });
    } finally {
      setSavingProfile(false);
    }
  };

  const savePrefs = async (next: UserPrefs) => {
    setPrefs(next);
    setSavingPrefs(true);
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferences: next }),
      });
      if (!res.ok) {
        toast.error("Could not save preferences.");
        return;
      }
      await refresh(); // apply density / landing app-wide immediately
      // Preferences save the moment you touch them, profile needs a button.
      // Two save models on one page with no signal leaves people unsure whether
      // a toggle stuck, so this one confirms itself.
      setPrefsSavedAt(Date.now());
    } finally {
      setSavingPrefs(false);
    }
  };

  if (loading) {
    return (
      <PageSkeleton variant="form" label="Loading your account" />
    );
  }

  const label = "text-[11px] font-semibold text-slate-500 uppercase tracking-wide";
  const field =
    "w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15";

  return (
    <div className="p-6 max-w-3xl w-full mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center">
          <UserCircle className="w-6 h-6" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl font-bold tracking-tight text-slate-900">{me?.name}</h2>
            {me && <Badge className={ROLE_BADGE[me.role] ?? ""}>{me.roleLabel}</Badge>}
          </div>
          <p className="text-xs text-slate-500">
            {me?.jobTitle ? `${me.jobTitle} · ` : ""}
            {me?.department ?? ""}
          </p>
        </div>
      </div>

      {/* Profile */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <UserCircle className="w-4 h-4 text-emerald-600" /> Profile
          </h3>
          <Button size="sm" icon={Save} loading={savingProfile} onClick={saveProfile}>Save profile</Button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className={label}>Full name</label>
            <input value={profile.name} onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))} className={field} />
          </div>
          <div className="space-y-1.5">
            <label className={label}><Phone className="w-3 h-3 inline mr-1" />Phone</label>
            <input value={profile.phone} onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))} placeholder="e.g. +234…" className={field} />
          </div>
          <div className="space-y-1.5">
            <label className={label}><MessageCircle className="w-3 h-3 inline mr-1" />WhatsApp</label>
            <input value={profile.whatsapp} onChange={(e) => setProfile((p) => ({ ...p, whatsapp: e.target.value }))} placeholder="e.g. +234…" className={field} />
          </div>
        </div>
        <p className="text-[11px] text-slate-500">
          Your role and department are set by a Super Admin.
        </p>

        {/* Sign-in address. Kept apart from the fields above because it is the
            only one that can lock you out: password recovery emails whatever is
            on file, so a typo saved instantly leaves no way back. Verified at
            the new address before anything changes. */}
        <div className="pt-4 border-t border-slate-100 space-y-2">
          <label className={label}>
            <Mail className="w-3 h-3 inline mr-1" />
            Sign-in address
          </label>
          <p className="text-sm text-slate-900 font-mono break-all">{me?.email}</p>

          {pendingEmail ? (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
              <p className="text-[11px] text-amber-900 leading-relaxed">
                Waiting for <span className="font-mono font-semibold">{pendingEmail}</span> to confirm. Until then this
                address stays your sign-in. The link expires in an hour.
              </p>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
              <input
                type="email"
                value={emailDraft}
                onChange={(e) => setEmailDraft(e.target.value)}
                placeholder="New address"
                aria-label="New sign-in address"
                className={`${field} sm:max-w-xs`}
              />
              <Button
                size="sm"
                variant="secondary"
                loading={emailBusy}
                onClick={requestEmailChange}
                disabled={!emailDraft.trim()}
              >
                Send confirmation
              </Button>
            </div>
          )}

          <p className="text-[11px] text-slate-500">
            We send a link to the new address, and tell the current one that a change was asked for. Nothing changes
            until the link is opened.
          </p>
        </div>
      </section>

      {/* Preferences */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-5">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-emerald-600" /> Preferences
          {savingPrefs ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-normal text-slate-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving
            </span>
          ) : prefsSavedAt ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-normal text-emerald-600">
              <Check className="w-3.5 h-3.5" /> Saved
            </span>
          ) : (
            <span className="text-[11px] font-normal text-slate-400">Saves as you change them</span>
          )}
        </h3>

        {/* Default landing */}
        <div className="space-y-1.5">
          <label className={label}>Landing page after sign-in</label>
          <Select
            value={prefs.defaultLanding}
            onChange={(v) => savePrefs({ ...prefs, defaultLanding: v })}
            options={LANDING_OPTIONS}
            className="max-w-xs"
            ariaLabel="Landing page after sign-in"
          />
        </div>

        {/* Density */}
        <div className="space-y-2">
          <label className={label}>List density</label>
          <div className="flex gap-2">
            {([
              { v: "comfortable", label: "Comfortable", icon: LayoutGrid },
              { v: "compact", label: "Compact", icon: Rows3 },
            ] as const).map(({ v, label: l, icon: Icon }) => {
              const on = prefs.density === v;
              return (
                <button
                  key={v}
                  onClick={() => savePrefs({ ...prefs, density: v })}
                  className={`flex-1 sm:flex-none inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold border transition-all ${
                    on ? "bg-emerald-600 border-emerald-600 text-white" : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                  }`}
                >
                  <Icon className="w-4 h-4" /> {l}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-slate-500">Compact fits more on screen by tightening tables, lists and page spacing.</p>
        </div>

        {/* Notifications */}
        <div className="space-y-2.5">
          <label className={label}><Bell className="w-3 h-3 inline mr-1" />Notifications</label>
          <p className="text-[11px] text-slate-500 -mt-1">
            These control how you are reached. A Super Admin can switch an event off for everyone, in which case
            nobody receives it whatever is set here.
          </p>
          <ToggleRow
            title="Email notifications"
            desc="Reminders, escalations and sign-off requests, sent by email."
            checked={prefs.notifyEmail}
            onChange={(v) => savePrefs({ ...prefs, notifyEmail: v })}
          />
          <ToggleRow
            title="In-app notifications"
            desc="Show the notification inbox badge in the top bar."
            checked={prefs.notifyInApp}
            onChange={(v) => savePrefs({ ...prefs, notifyInApp: v })}
          />
          <ToggleRow
            title="Notification sound"
            desc="Play a short chime when a new notification arrives while the app is open."
            checked={prefs.notifySound}
            onChange={(v) => savePrefs({ ...prefs, notifySound: v })}
          />
          <ToggleRow
            title="Desktop (system) notifications"
            desc="Show a system notification for new alerts. Your browser asks permission once."
            checked={prefs.notifyDesktop}
            onChange={async (v) => {
              if (v && typeof Notification !== "undefined" && Notification.permission !== "granted") {
                const perm = await Notification.requestPermission();
                if (perm !== "granted") {
                  toast.error("Permission declined. Desktop notifications stay off.");
                  return;
                }
              }
              savePrefs({ ...prefs, notifyDesktop: v });
            }}
          />
        </div>

        {/* AI chat */}
        <div className="space-y-2.5">
          <label className={label}><Sparkles className="w-3 h-3 inline mr-1" />AI chat</label>
          <ToggleRow
            title="Enter key sends the message"
            desc="Off: Enter starts a new line, send with Ctrl+Enter or the Send button. On: Enter sends; Shift+Enter starts a new line."
            checked={prefs.chatEnterToSend}
            onChange={(v) => savePrefs({ ...prefs, chatEnterToSend: v })}
          />
        </div>
      </section>

      {/* Security */}
      <section className="bg-white border border-slate-200 rounded-xl p-5">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-3">
          <KeyRound className="w-4 h-4 text-emerald-600" /> Security
        </h3>
        <Link
          href="/change-password"
          className="flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors group"
        >
          <div className="flex items-center gap-3">
            <KeyRound className="w-4 h-4 text-slate-400" />
            <div>
              <p className="text-sm font-medium text-slate-900">Change password</p>
              <p className="text-xs text-slate-500">Update the password you use to sign in.</p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
        </Link>
      </section>
    </div>
  );
}

function ToggleRow({
  title, desc, checked, onChange,
}: { title: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4 p-3 rounded-lg border border-slate-200">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-900">{title}</p>
        <p className="text-[11px] text-slate-500 mt-0.5">{desc}</p>
      </div>
      <Toggle checked={checked} onChange={onChange} ariaLabel={title} />
    </div>
  );
}
