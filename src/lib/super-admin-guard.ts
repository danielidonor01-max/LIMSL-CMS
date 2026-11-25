// src/lib/super-admin-guard.ts
// Only a Super Admin can create accounts, reset passwords and change roles, so
// an edit that leaves nobody holding the role locks everybody out of account
// administration for good. Nothing used to stop the last Super Admin
// deactivating or demoting their own account.

type Account = { role: string; isActive: boolean | null };

export function isActiveSuperAdmin(u: Account): boolean {
  // "ADMIN" is the original seed's name for the role (see auth.config.ts).
  return (u.role === "SUPER_ADMIN" || u.role === "ADMIN") && u.isActive !== false;
}

/** True when this edit would take away the last active Super Admin. */
export function leavesNoSuperAdmin(
  target: Account,
  edit: { role?: string; isActive?: boolean },
  otherActiveSuperAdmins: number,
): boolean {
  if (!isActiveSuperAdmin(target)) return false;
  const after = { role: edit.role ?? target.role, isActive: edit.isActive ?? target.isActive };
  return !isActiveSuperAdmin(after) && otherActiveSuperAdmins === 0;
}
