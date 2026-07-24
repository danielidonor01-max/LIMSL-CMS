// src/app/settings/users/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import {
  Users as UsersIcon,
  Loader2,
  UserPlus,
  ShieldAlert,
  KeyRound,
  Check,
  Copy,
} from "lucide-react";
import { Badge } from "@/components/Badge";
import Dropdown from "@/components/Dropdown";
import Select from "@/components/Select";
import { ROLES, ROLE_LABELS, ROLE_BADGE, canManageUsers } from "@/lib/roles";

type User = {
  id: string;
  name: string;
  email: string;
  role: string;
  jobTitle: string | null;
  department: string | null;
  phone: string | null;
  isActive: boolean | null;
  mustChangePassword: boolean | null;
};

export default function UsersAdminPage() {
  const { data: session, status } = useSession();
  const role = (session?.user as { role?: string })?.role;
  const [list, setList] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", role: "TECHNICIAN", jobTitle: "", phone: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = () => {
    fetch("/api/users?includeInactive=1")
      .then((r) => r.json())
      .then((d) => setList(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    if (role) load();
  }, [role]);

  const isAdmin = canManageUsers(role);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    const d = await res.json();
    if (!res.ok) {
      setError(d.error || "Failed to create user");
      return;
    }
    setTempPassword({ email: d.email, password: d.tempPassword });
    setShowForm(false);
    setForm({ name: "", email: "", role: "TECHNICIAN", jobTitle: "", phone: "" });
    load();
  };

  const changeRole = async (id: string, newRole: string) => {
    await fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    load();
  };

  const toggleActive = async (u: User) => {
    await fetch(`/api/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !(u.isActive !== false) }),
    });
    load();
  };

  const resetPassword = async (u: User) => {
    const res = await fetch(`/api/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resetPassword: true }),
    });
    const d = await res.json();
    if (res.ok && d.tempPassword) setTempPassword({ email: u.email, password: d.tempPassword });
  };

  const grouped = useMemo(() => {
    const byRole: Record<string, User[]> = {};
    list.forEach((u) => (byRole[u.role] = [...(byRole[u.role] ?? []), u]));
    return ROLES.filter((r) => byRole[r]).map((r) => ({ role: r, users: byRole[r] }));
  }, [list]);

  if (status === "loading") {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="p-10 max-w-md mx-auto text-center space-y-3">
        <ShieldAlert className="w-10 h-10 text-rose-500 mx-auto" />
        <h2 className="text-lg font-bold text-slate-900">Access restricted</h2>
        <p className="text-sm text-slate-500">
          User administration is available to Super Admins only. Your role is{" "}
          <span className="font-semibold">{ROLE_LABELS[role ?? "VIEWER"] ?? role}</span>.
        </p>
      </div>
    );
  }

  const field = "w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:border-emerald-500/40";

  return (
    <div className="p-6 max-w-6xl w-full mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200">
            <UsersIcon className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900">User Management</h2>
            <p className="text-xs text-slate-500 font-mono">Super Admin · roles & access control</p>
          </div>
        </div>
        <button
          onClick={() => { setShowForm((s) => !s); setError(null); }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold"
        >
          <UserPlus className="w-4 h-4" /> New User
        </button>
      </div>

      {/* Temp password reveal */}
      {tempPassword && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center justify-between gap-3">
          <div className="text-sm">
            <p className="font-semibold text-emerald-800">Temporary password for {tempPassword.email}</p>
            <p className="text-emerald-700 font-mono text-lg">{tempPassword.password}</p>
            <p className="text-[11px] text-emerald-600 mt-1">Share this once; the user must change it on first login.</p>
          </div>
          <button
            onClick={() => { navigator.clipboard.writeText(tempPassword.password); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-emerald-200 rounded-lg text-xs font-semibold text-emerald-700"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {copied ? "Copied" : "Copy"}
          </button>
        </div>
      )}

      {/* Create form */}
      {showForm && (
        <form onSubmit={create} className="bg-white border border-slate-200 rounded-xl p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Full name</label>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className={field} required />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Email</label>
            <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className={field} required />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Role</label>
            <Select value={form.role} onChange={(v) => setForm((f) => ({ ...f, role: v }))} className="w-full">
              {ROLES.filter((r) => r !== "VIEWER").map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </Select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Job title (optional)</label>
            <input value={form.jobTitle} onChange={(e) => setForm((f) => ({ ...f, jobTitle: e.target.value }))} className={field} />
          </div>
          {error && <p className="sm:col-span-2 text-xs text-rose-600">{error}</p>}
          <div className="sm:col-span-2 flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-xs font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-100">Cancel</button>
            <button type="submit" disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white rounded-lg text-xs font-semibold">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />} Create user
            </button>
          </div>
        </form>
      )}

      {/* Users table grouped by role */}
      {loading ? (
        <div className="py-16 flex justify-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin text-emerald-600" /></div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                  <th className="py-3 px-4 font-medium">Name</th>
                  <th className="py-3 px-4 font-medium">Email</th>
                  <th className="py-3 px-4 font-medium">Role</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  <th className="py-3 px-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {grouped.flatMap((g) =>
                  g.users.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900">{u.name}</div>
                        {u.jobTitle && <div className="text-[10px] text-slate-400">{u.jobTitle}</div>}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-500">{u.email}</td>
                      <td className="py-3 px-4">
                        <Dropdown
                          value={u.role}
                          onChange={(r) => changeRole(u.id, r)}
                          ariaLabel={`Change role for ${u.name}`}
                          options={ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
                          triggerClassName={`px-2 py-1 rounded-full border text-[10px] font-semibold ${ROLE_BADGE[u.role] ?? "bg-slate-100 border-slate-200"}`}
                        />
                      </td>
                      <td className="py-3 px-4">
                        <Badge className={u.isActive !== false ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/20" : "bg-slate-500/10 text-slate-500 border-slate-500/20"}>
                          {u.isActive !== false ? "Active" : "Disabled"}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap space-x-2">
                        <button onClick={() => resetPassword(u)} title="Reset password" className="inline-flex items-center gap-1 text-slate-500 hover:text-emerald-600">
                          <KeyRound className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => toggleActive(u)} className="text-[11px] font-semibold text-slate-500 hover:text-slate-900">
                          {u.isActive !== false ? "Disable" : "Enable"}
                        </button>
                      </td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
