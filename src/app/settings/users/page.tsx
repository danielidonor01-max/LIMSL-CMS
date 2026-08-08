// src/app/settings/users/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import {
  Users as UsersIcon,
  Loader2,
  UserPlus,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  KeyRound,
  Check,
  Copy,
  Search,
  Phone,
  MessageCircle,
  Pencil,
  Shield,
  Info,
  UserCog,
  Download,
  Printer,
} from "lucide-react";
import { downloadCSV } from "@/lib/export";
import { toast } from "sonner";
import { Badge } from "@/components/Badge";
import Button from "@/components/Button";
import Modal from "@/components/Modal";
import KebabMenu from "@/components/KebabMenu";
import Select from "@/components/Select";
import {
  ROLES,
  ROLE_LABELS,
  ROLE_BADGE,
  ROLE_DEPARTMENT,
  ROLE_RANK,
  ROLE_ALLOWED_PATHS,
  MAINTENANCE_WRITE_ROLES,
  PERMIT_WRITE_ROLES,
  TRAINING_WRITE_ROLES,
  COMPLIANCE_WRITE_ROLES,
  WMS_WRITE_ROLES,
  SETTINGS_WRITE_ROLES,
  canManageUsers,
} from "@/lib/roles";

type User = {
  id: string;
  name: string;
  email: string;
  role: string;
  jobTitle: string | null;
  department: string | null;
  phone: string | null;
  whatsapp: string | null;
  isActive: boolean | null;
  mustChangePassword: boolean | null;
  createdAt?: string | null;
};

// Write-permission sets, sourced from the canonical exports — never re-derived.
// `short` is the column head in the matrix, where horizontal room is scarce.
const PERMISSION_SETS: { label: string; short: string; roles: string[] }[] = [
  { label: "Maintenance write", short: "Maintenance", roles: MAINTENANCE_WRITE_ROLES },
  { label: "Permits (issue/close)", short: "Permits", roles: PERMIT_WRITE_ROLES },
  { label: "Training & competency", short: "Training", roles: TRAINING_WRITE_ROLES },
  { label: "Compliance records", short: "Compliance", roles: COMPLIANCE_WRITE_ROLES },
  { label: "WMS", short: "WMS", roles: WMS_WRITE_ROLES },
  { label: "App settings & users", short: "Admin", roles: SETTINGS_WRITE_ROLES },
];

const MODULE_LABELS: Record<string, string> = {
  "/": "Dashboard",
  "/equipment": "Equipment",
  "/documents": "Documents",
  "/procedure": "Maintenance Procedure",
  "/schedule": "Schedule",
  "/work-orders": "Work Orders",
  "/corrective": "Corrective Maintenance",
  "/audit": "Audit Log",
  "/kpi": "KPI Dashboard",
  "/reports": "Reports",
  "/training": "Training",
  "/wms": "WMS",
  "/calibration": "Calibration",
  "/permits": "Permits",
};

const moduleLabel = (p: string) =>
  MODULE_LABELS[p] ??
  p.replace(/^\//, "").split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

const deptLabel = (d?: string | null) => {
  if (!d || d === "—") return null;
  if (d === "QA_QC") return "QA/QC";
  return d.charAt(0) + d.slice(1).toLowerCase();
};

const AVATAR_TINTS = [
  "bg-emerald-100 text-emerald-700",
  "bg-sky-100 text-sky-700",
  "bg-violet-100 text-violet-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-teal-100 text-teal-700",
];
const avatarTint = (s: string) =>
  AVATAR_TINTS[Array.from(s).reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_TINTS.length];
const initials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";

function Avatar({ name, size = "w-9 h-9 text-xs" }: { name: string; size?: string }) {
  return (
    <span className={`${size} ${avatarTint(name)} rounded-full flex items-center justify-center font-bold shrink-0`}>
      {initials(name)}
    </span>
  );
}

export default function UsersAdminPage() {
  const { data: session, status } = useSession();
  const role = (session?.user as { role?: string })?.role;

  // Session resolves client-side only — render nothing role-dependent pre-mount.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [list, setList] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageTab, setPageTab] = useState<"users" | "roles">("users");
  const [roleView, setRoleView] = useState<"cards" | "matrix">("cards");

  // Toolbar filters
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // Create-user modal
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", role: "TECHNICIAN", jobTitle: "", phone: "", whatsapp: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // One-time temp password reveal (create + reset flows)
  const [tempPassword, setTempPassword] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // Edit modal
  const [editUser, setEditUser] = useState<User | null>(null);
  const [editForm, setEditForm] = useState({ name: "", jobTitle: "", department: "", phone: "", role: "TECHNICIAN" });
  const [editSaving, setEditSaving] = useState(false);

  // Disable confirmation
  const [confirmDisable, setConfirmDisable] = useState<User | null>(null);
  const [disabling, setDisabling] = useState(false);

  // Roles tab — "Change members" modal
  const [membersRole, setMembersRole] = useState<string | null>(null);
  const [roleSaving, setRoleSaving] = useState<string | null>(null); // user id being reassigned

  const load = () => {
    fetch("/api/users?includeInactive=1")
      .then((r) => r.json())
      .then((d) => setList(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    if (role) load();
  }, [role]);

  const isAdmin = mounted && canManageUsers(role);

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
    setForm({ name: "", email: "", role: "TECHNICIAN", jobTitle: "", phone: "", whatsapp: "" });
    load();
  };

  const changeRole = async (id: string, newRole: string) => {
    setRoleSaving(id);
    try {
      const res = await fetch(`/api/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || "Failed to change role.");
        return;
      }
      toast.success(`Role changed to ${ROLE_LABELS[newRole] ?? newRole}.`);
      load();
    } finally {
      setRoleSaving(null);
    }
  };

  const setActive = async (u: User, active: boolean) => {
    const res = await fetch(`/api/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: active }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast.error(d.error || "Failed to update account.");
      return;
    }
    toast.success(active ? `${u.name} re-enabled.` : `${u.name} disabled — they can no longer sign in.`);
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
    else toast.error(d.error || "Failed to reset password.");
  };

  const openEdit = (u: User) => {
    setEditForm({
      name: u.name,
      jobTitle: u.jobTitle ?? "",
      department: u.department ?? "",
      phone: u.phone ?? "",
      role: u.role,
    });
    setEditUser(u);
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editUser) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/users/${editUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editForm.name,
          jobTitle: editForm.jobTitle || null,
          department: editForm.department || null,
          phone: editForm.phone || null,
          role: editForm.role,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || "Failed to save changes.");
        return;
      }
      toast.success(`${editForm.name} updated.`);
      setEditUser(null);
      load();
    } finally {
      setEditSaving(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return list.filter((u) => {
      const matchesSearch = !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
      const matchesRole = roleFilter === "ALL" || u.role === roleFilter;
      const active = u.isActive !== false;
      const matchesStatus =
        statusFilter === "ALL" || (statusFilter === "ACTIVE" ? active : !active);
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [list, search, roleFilter, statusFilter]);

  const membersByRole = useMemo(() => {
    const byRole: Record<string, User[]> = {};
    list.forEach((u) => (byRole[u.role] = [...(byRole[u.role] ?? []), u]));
    return byRole;
  }, [list]);

  // The matrix is a compliance artefact — an auditor asks to keep a copy, so it
  // leaves the app as a file rather than a screenshot.
  const exportMatrix = () => {
    downloadCSV(
      `role-permission-matrix-${new Date().toISOString().slice(0, 10)}`,
      ROLES.map((r) => {
        const row: Record<string, unknown> = {
          Role: ROLE_LABELS[r] ?? r,
          Department: deptLabel(ROLE_DEPARTMENT[r]) ?? "—",
          "Sign-off rank": ROLE_RANK[r] ?? 0,
          "Active members": (membersByRole[r] ?? []).filter((m) => m.isActive !== false).length,
        };
        for (const p of PERMISSION_SETS) row[p.label] = p.roles.includes(r) ? "Yes" : "No";
        row["Module access"] = (ROLE_ALLOWED_PATHS[r] ?? []).map(moduleLabel).join("; ") || "All modules";
        return row;
      }),
    );
  };

  // Departments offered in the edit form come from the canonical role→department
  // map, so the list can never drift from roles.ts.
  const departments = useMemo(
    () => Array.from(new Set(Object.values(ROLE_DEPARTMENT).filter((d) => d !== "—"))),
    [],
  );

  if (status === "loading" || !mounted) {
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

  const field =
    "w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:border-emerald-500/40";
  const fieldLabel = "block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5";

  const statusBadge = (u: User) => (
    <Badge
      className={
        u.isActive !== false
          ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/20"
          : "bg-slate-500/10 text-slate-500 border-slate-500/20"
      }
    >
      {u.isActive !== false ? "Active" : "Disabled"}
    </Badge>
  );

  const kebabFor = (u: User) => (
    <KebabMenu
      ariaLabel={`Actions for ${u.name}`}
      items={[
        { label: "Edit details", icon: Pencil, onClick: () => openEdit(u) },
        { label: "Reset password", icon: KeyRound, onClick: () => resetPassword(u) },
        u.isActive !== false
          ? { label: "Disable account", icon: ShieldOff, danger: true, onClick: () => setConfirmDisable(u) }
          : { label: "Enable account", icon: ShieldCheck, onClick: () => setActive(u, true) },
      ]}
    />
  );

  return (
    <div className="p-6 max-w-6xl w-full mx-auto space-y-6">
      {/* Header */}
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
        {pageTab === "users" && (
          <Button icon={UserPlus} onClick={() => { setShowForm(true); setError(null); }}>
            Add user
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200" role="tablist" aria-label="User management sections">
        {([
          { id: "users", label: "Users", icon: UsersIcon },
          { id: "roles", label: "Roles", icon: Shield },
        ] as const).map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={pageTab === t.id}
            onClick={() => setPageTab(t.id)}
            className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold border-b-2 -mb-px transition-colors ${
              pageTab === t.id
                ? "border-emerald-600 text-emerald-700"
                : "border-transparent text-slate-500 hover:text-slate-900"
            }`}
          >
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {pageTab === "users" && (
        <>
          {/* Toolbar */}
          <div className="p-4 bg-white border border-slate-200 rounded-xl flex flex-col md:flex-row gap-3 md:items-center">
            <div className="relative flex-1 md:max-w-xs">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or email…"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 pl-10 pr-3 text-xs placeholder-slate-400 focus:outline-none focus:border-emerald-500/40"
              />
            </div>
            <div className="flex flex-wrap gap-2 md:ml-auto">
              <Select value={roleFilter} onChange={setRoleFilter} ariaLabel="Filter by role" className="w-full sm:w-52">
                <option value="ALL">All roles</option>
                {ROLES.map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </Select>
              <Select value={statusFilter} onChange={setStatusFilter} ariaLabel="Filter by status" className="w-full sm:w-36">
                <option value="ALL">All statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="DISABLED">Disabled</option>
              </Select>
            </div>
          </div>

          {/* Desktop table */}
          <div className="hidden md:block bg-white border border-slate-200 rounded-xl">
            <div className="overflow-x-auto rounded-xl">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                    <th className="py-3 px-4 font-medium">Name</th>
                    <th className="py-3 px-4 font-medium">Role</th>
                    <th className="py-3 px-4 font-medium">Department</th>
                    <th className="py-3 px-4 font-medium">Contact</th>
                    <th className="py-3 px-4 font-medium">Status</th>
                    <th className="py-3 px-4 font-medium">Created</th>
                    <th className="py-3 px-4 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="animate-pulse">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-slate-100" />
                            <div className="space-y-1.5">
                              <div className="h-3 w-32 bg-slate-100 rounded" />
                              <div className="h-2.5 w-44 bg-slate-100 rounded" />
                            </div>
                          </div>
                        </td>
                        {Array.from({ length: 5 }).map((_, j) => (
                          <td key={j} className="py-3 px-4"><div className="h-3 w-20 bg-slate-100 rounded" /></td>
                        ))}
                        <td className="py-3 px-4"><div className="h-7 w-7 bg-slate-100 rounded-lg ml-auto" /></td>
                      </tr>
                    ))
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-14 text-center text-slate-500">
                        <UsersIcon className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                        <p className="text-sm font-semibold text-slate-600">No users match</p>
                        <p className="text-xs text-slate-400 mt-0.5">Adjust the search or filters, or add a new user.</p>
                      </td>
                    </tr>
                  ) : (
                    filtered.map((u) => (
                      <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <Avatar name={u.name} />
                            <div className="min-w-0">
                              <div className="font-semibold text-slate-900 truncate">{u.name}</div>
                              <div className="text-[11px] text-slate-400 font-mono truncate">{u.email}</div>
                              {u.jobTitle && <div className="text-[10px] text-slate-400 truncate">{u.jobTitle}</div>}
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <Badge className={ROLE_BADGE[u.role] ?? "bg-slate-100 text-slate-600 border-slate-200"}>
                            {ROLE_LABELS[u.role] ?? u.role}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-slate-600">
                          {deptLabel(u.department) ?? deptLabel(ROLE_DEPARTMENT[u.role]) ?? <span className="text-slate-300">—</span>}
                        </td>
                        <td className="py-3 px-4">
                          {u.phone || u.whatsapp ? (
                            <div className="space-y-0.5">
                              {u.phone && (
                                <div className="flex items-center gap-1.5 text-slate-600">
                                  <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" /> {u.phone}
                                </div>
                              )}
                              {u.whatsapp && (
                                <div className="flex items-center gap-1.5 text-slate-600">
                                  <MessageCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> {u.whatsapp}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {statusBadge(u)}
                          {u.mustChangePassword && (
                            <div className="text-[10px] text-amber-600 mt-1">Temp password pending</div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                          {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex justify-end">{kebabFor(u)}</div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="bg-white border border-slate-200 rounded-xl p-4 animate-pulse flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-slate-100 shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-32 bg-slate-100 rounded" />
                    <div className="h-2.5 w-44 bg-slate-100 rounded" />
                  </div>
                </div>
              ))
            ) : filtered.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl py-12 text-center text-slate-500">
                <UsersIcon className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                <p className="text-sm font-semibold text-slate-600">No users match</p>
                <p className="text-xs text-slate-400 mt-0.5">Adjust the search or filters, or add a new user.</p>
              </div>
            ) : (
              filtered.map((u) => (
                <div key={u.id} className="bg-white border border-slate-200 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <Avatar name={u.name} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900 truncate">{u.name}</p>
                      <p className="text-[11px] text-slate-400 font-mono truncate">{u.email}</p>
                      <div className="flex flex-wrap items-center gap-1.5 mt-2">
                        <Badge className={ROLE_BADGE[u.role] ?? "bg-slate-100 text-slate-600 border-slate-200"}>
                          {ROLE_LABELS[u.role] ?? u.role}
                        </Badge>
                        {statusBadge(u)}
                      </div>
                    </div>
                    <div className="shrink-0">{kebabFor(u)}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {pageTab === "roles" && (
        <div className="space-y-4">
          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-sky-50 border border-sky-100 text-sky-800 text-xs">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <p>
              Role <strong>definitions</strong> — write permissions, sign-off seniority and module scope — are
              controlled in code (<span className="font-mono">src/lib/roles.ts</span>) and change only through a
              reviewed release, so they stay auditable for ISO 9001/45001. Role <strong>membership</strong> (who holds
              each role) is managed here and every change is audit-logged. A signer may sign steps of their own role or
              any junior rank; a Super Admin may sign or override any step.
            </p>
          </div>

          {/* Cards answer "what can this role do". The matrix answers "who can do
              this thing" — the direction an auditor reads, and the artefact they
              ask for by name. */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex gap-1 bg-slate-100 border border-slate-200 rounded-lg p-1 w-fit">
              {(["cards", "matrix"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setRoleView(v)}
                  className={`px-3 min-h-9 rounded-md text-xs font-semibold transition-all ${
                    roleView === v ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  {v === "cards" ? "By role" : "Permission matrix"}
                </button>
              ))}
            </div>
            {roleView === "matrix" && (
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" icon={Download} onClick={exportMatrix}>
                  Export CSV
                </Button>
                <Button variant="secondary" size="sm" icon={Printer} onClick={() => window.print()}>
                  Print
                </Button>
              </div>
            )}
          </div>

          {roleView === "matrix" && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                      <th className="py-3 px-4 font-semibold sticky left-0 bg-slate-50 z-10">Role</th>
                      <th className="py-3 px-3 font-semibold text-center whitespace-nowrap">Members</th>
                      <th className="py-3 px-3 font-semibold text-center whitespace-nowrap" title="Higher rank may sign any junior step">
                        Sign-off rank
                      </th>
                      {PERMISSION_SETS.map((p) => (
                        <th key={p.label} className="py-3 px-3 font-semibold text-center whitespace-nowrap" title={p.label}>
                          {p.short}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {ROLES.map((r) => {
                      const members = membersByRole[r] ?? [];
                      const activeMembers = members.filter((m) => m.isActive !== false).length;
                      return (
                        <tr key={r} className="hover:bg-slate-50">
                          <td className="py-3 px-4 sticky left-0 bg-white z-10">
                            <Badge className={ROLE_BADGE[r] ?? "bg-slate-100 text-slate-600 border-slate-200"}>
                              {ROLE_LABELS[r]}
                            </Badge>
                            <p className="text-[10px] text-slate-500 mt-1">
                              {deptLabel(ROLE_DEPARTMENT[r]) ?? "No department"}
                            </p>
                          </td>
                          <td
                            className={`py-3 px-3 text-center font-semibold ${
                              activeMembers === 0 ? "text-amber-600" : "text-slate-700"
                            }`}
                            title={activeMembers === 0 ? "Nobody holds this role — any step requiring it cannot be signed" : undefined}
                          >
                            {activeMembers}
                          </td>
                          <td className="py-3 px-3 text-center text-slate-500 font-mono">{ROLE_RANK[r] ?? 0}</td>
                          {PERMISSION_SETS.map((p) => {
                            const has = p.roles.includes(r);
                            return (
                              <td key={p.label} className="py-3 px-3 text-center">
                                {has ? (
                                  <Check className="w-4 h-4 text-emerald-600 inline" aria-label="Yes" />
                                ) : (
                                  <span className="text-slate-300" aria-label="No">—</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-slate-500 px-4 py-3 border-t border-slate-200">
                A tick is a <strong>write</strong> permission. A role with no ticks still participates through sign-off —
                QA/QC and HSE approve maintenance work rather than performing it. A role with{" "}
                <span className="text-amber-600 font-semibold">0 members</span> blocks every chain step that requires it.
              </p>
            </div>
          )}

          <div className={`grid sm:grid-cols-2 gap-4 ${roleView === "matrix" ? "hidden" : ""}`}>
            {ROLES.map((r) => {
              const members = membersByRole[r] ?? [];
              const perms = PERMISSION_SETS.filter((p) => p.roles.includes(r));
              const paths = ROLE_ALLOWED_PATHS[r];
              return (
                <div key={r} className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <Badge className={ROLE_BADGE[r] ?? "bg-slate-100 text-slate-600 border-slate-200"}>
                        {ROLE_LABELS[r]}
                      </Badge>
                      <p className="text-[11px] text-slate-400 mt-1.5">
                        {deptLabel(ROLE_DEPARTMENT[r]) ?? "No department"} · sign-off rank {ROLE_RANK[r] ?? 0}
                      </p>
                    </div>
                    <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 border border-slate-200 rounded-full px-2 py-0.5 whitespace-nowrap">
                      {members.length} member{members.length === 1 ? "" : "s"}
                    </span>
                  </div>

                  <div>
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Members</p>
                    {members.length === 0 ? (
                      <p className="text-xs text-slate-400">No users hold this role.</p>
                    ) : (
                      <p className="text-xs text-slate-600 leading-relaxed">
                        {members.map((m, i) => (
                          <span key={m.id} className={m.isActive === false ? "text-slate-400 line-through" : undefined}>
                            {m.name}{i < members.length - 1 ? ", " : ""}
                          </span>
                        ))}
                      </p>
                    )}
                  </div>

                  <div>
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Write permissions</p>
                    {perms.length === 0 ? (
                      <p className="text-xs text-slate-400">
                        {r === "VIEWER" ? "Read-only access." : "Participates via sign-off only — no direct writes."}
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {perms.map((p) => (
                          <Badge key={p.label} className="bg-emerald-500/10 text-emerald-700 border-emerald-500/20">
                            {p.label}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Module access</p>
                    {paths ? (
                      <div className="flex flex-wrap gap-1.5">
                        {paths.map((p) => (
                          <span key={p} className="text-[10px] font-medium text-slate-600 bg-slate-100 border border-slate-200 rounded-full px-2 py-0.5">
                            {moduleLabel(p)}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-600">
                        All modules{SETTINGS_WRITE_ROLES.includes(r) ? " — including Administration" : " (except Administration)"}
                      </p>
                    )}
                  </div>

                  <div className="mt-auto pt-1">
                    <Button variant="secondary" size="sm" icon={UserCog} onClick={() => setMembersRole(r)}>
                      Change members
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Create user */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title="Add user" subtitle="A temporary password is generated and shown once">
        <form onSubmit={create} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={fieldLabel}>Full name</label>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className={field} required />
          </div>
          <div>
            <label className={fieldLabel}>Email</label>
            <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className={field} required />
          </div>
          <div>
            <label className={fieldLabel}>Role</label>
            <Select value={form.role} onChange={(v) => setForm((f) => ({ ...f, role: v }))} className="w-full">
              {ROLES.filter((r) => r !== "VIEWER").map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </Select>
          </div>
          <div>
            <label className={fieldLabel}>Job title (optional)</label>
            <input value={form.jobTitle} onChange={(e) => setForm((f) => ({ ...f, jobTitle: e.target.value }))} className={field} />
          </div>
          <div>
            <label className={fieldLabel}>Phone (optional)</label>
            <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className={field} />
          </div>
          <div>
            <label className={fieldLabel}>WhatsApp (optional)</label>
            <input value={form.whatsapp} onChange={(e) => setForm((f) => ({ ...f, whatsapp: e.target.value }))} className={field} />
          </div>
          {error && <p className="sm:col-span-2 text-xs text-rose-600">{error}</p>}
          <div className="sm:col-span-2 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button type="submit" icon={UserPlus} loading={saving}>Create user</Button>
          </div>
        </form>
      </Modal>

      {/* Edit user */}
      <Modal open={!!editUser} onClose={() => setEditUser(null)} title="Edit user" subtitle={editUser?.email}>
        <form onSubmit={saveEdit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={fieldLabel}>Full name</label>
            <input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} className={field} required />
          </div>
          <div>
            <label className={fieldLabel}>Role</label>
            <Select value={editForm.role} onChange={(v) => setEditForm((f) => ({ ...f, role: v }))} className="w-full">
              {ROLES.map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </Select>
          </div>
          <div>
            <label className={fieldLabel}>Job title</label>
            <input value={editForm.jobTitle} onChange={(e) => setEditForm((f) => ({ ...f, jobTitle: e.target.value }))} className={field} />
          </div>
          <div>
            <label className={fieldLabel}>Department</label>
            <Select value={editForm.department} onChange={(v) => setEditForm((f) => ({ ...f, department: v }))} className="w-full" placeholder="Not set">
              <option value="">Not set</option>
              {departments.map((d) => (
                <option key={d} value={d}>{deptLabel(d) ?? d}</option>
              ))}
            </Select>
          </div>
          <div className="sm:col-span-2">
            <label className={fieldLabel}>Phone</label>
            <input value={editForm.phone} onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))} className={field} />
          </div>
          <div className="sm:col-span-2 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setEditUser(null)}>Cancel</Button>
            <Button type="submit" icon={Check} loading={editSaving}>Save changes</Button>
          </div>
        </form>
      </Modal>

      {/* Disable confirmation */}
      <Modal
        open={!!confirmDisable}
        onClose={() => setConfirmDisable(null)}
        title="Disable account"
        subtitle={confirmDisable?.email}
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            <span className="font-semibold text-slate-900">{confirmDisable?.name}</span> will no longer be able to sign
            in. Their historical records and sign-offs remain untouched for the audit trail, and the account can be
            re-enabled at any time.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmDisable(null)}>Cancel</Button>
            <Button
              variant="danger"
              icon={ShieldOff}
              loading={disabling}
              onClick={async () => {
                if (!confirmDisable) return;
                setDisabling(true);
                await setActive(confirmDisable, false);
                setDisabling(false);
                setConfirmDisable(null);
              }}
            >
              Disable account
            </Button>
          </div>
        </div>
      </Modal>

      {/* One-time temp password reveal */}
      <Modal
        open={!!tempPassword}
        onClose={() => { setTempPassword(null); setCopied(false); }}
        title="Temporary password"
        subtitle={tempPassword?.email}
      >
        <div className="space-y-4">
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-center">
            <p className="text-emerald-700 font-mono text-lg font-semibold break-all">{tempPassword?.password}</p>
          </div>
          <p className="text-xs text-slate-500">
            Shown once only — share it with the user now. They must change it at first login.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              icon={copied ? Check : Copy}
              onClick={() => {
                if (!tempPassword) return;
                navigator.clipboard.writeText(tempPassword.password);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button onClick={() => { setTempPassword(null); setCopied(false); }}>Done</Button>
          </div>
        </div>
      </Modal>

      {/* Roles tab — reassign members */}
      <Modal
        open={!!membersRole}
        onClose={() => setMembersRole(null)}
        title={membersRole ? `Change members — ${ROLE_LABELS[membersRole]}` : "Change members"}
        subtitle="Pick a new role for any user; changes apply immediately and are audit-logged"
      >
        <div className="space-y-2">
          {list.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">No users found.</p>
          ) : (
            list.map((u) => (
              <div
                key={u.id}
                className={`flex items-center gap-3 rounded-lg border p-2.5 ${
                  u.role === membersRole ? "border-emerald-200 bg-emerald-50/50" : "border-slate-200"
                }`}
              >
                <Avatar name={u.name} size="w-8 h-8 text-[10px]" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-slate-900 truncate">
                    {u.name}
                    {u.isActive === false && <span className="text-slate-400 font-normal"> · disabled</span>}
                  </p>
                  <p className="text-[10px] text-slate-400 font-mono truncate">{u.email}</p>
                </div>
                {roleSaving === u.id ? (
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-600 shrink-0 mx-3" />
                ) : (
                  <Select
                    value={u.role}
                    onChange={(v) => { if (v !== u.role) changeRole(u.id, v); }}
                    ariaLabel={`Role for ${u.name}`}
                    className="w-44 shrink-0"
                    options={ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
                  />
                )}
              </div>
            ))
          )}
        </div>
      </Modal>
    </div>
  );
}
