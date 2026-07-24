// src/lib/user-prefs.ts
// Per-user preferences — the single source of truth for their shape and defaults.
// Pure (no server-only imports) so both the client preferences UI and the server
// (notify recipient selection, /api/me) can share it. Stored as JSON in
// users.preferences; parsePrefs() always returns a fully-populated object so
// callers never branch on undefined.

export type Density = "comfortable" | "compact";

export type UserPrefs = {
  defaultLanding: string; // path to land on after sign-in
  density: Density; // list/table spacing
  notifyEmail: boolean; // receive email notifications (when SMTP is configured)
  notifyInApp: boolean; // show the in-app notification inbox badge
};

export const DEFAULT_PREFS: UserPrefs = {
  defaultLanding: "/",
  density: "comfortable",
  notifyEmail: true,
  notifyInApp: true,
};

// Landing pages a user may choose — kept to broadly-accessible destinations so
// the choice is valid for every role (route guards still apply on navigation).
export const LANDING_OPTIONS: { value: string; label: string }[] = [
  { value: "/", label: "Dashboard" },
  { value: "/equipment", label: "Equipment register" },
  { value: "/work-orders", label: "Work orders" },
  { value: "/schedule", label: "Maintenance schedule" },
  { value: "/notifications", label: "Notifications" },
];

export function parsePrefs(raw: unknown): UserPrefs {
  if (!raw || typeof raw !== "string") return { ...DEFAULT_PREFS };
  try {
    const p = JSON.parse(raw) as Partial<UserPrefs>;
    return {
      defaultLanding: typeof p.defaultLanding === "string" ? p.defaultLanding : DEFAULT_PREFS.defaultLanding,
      density: p.density === "compact" ? "compact" : "comfortable",
      notifyEmail: p.notifyEmail !== false,
      notifyInApp: p.notifyInApp !== false,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

// Coerce an arbitrary client payload into a valid prefs object for persistence.
export function sanitizePrefs(input: unknown): UserPrefs {
  const p = (input ?? {}) as Partial<UserPrefs>;
  const landingValid = LANDING_OPTIONS.some((o) => o.value === p.defaultLanding);
  return {
    defaultLanding: landingValid ? (p.defaultLanding as string) : DEFAULT_PREFS.defaultLanding,
    density: p.density === "compact" ? "compact" : "comfortable",
    notifyEmail: p.notifyEmail !== false,
    notifyInApp: p.notifyInApp !== false,
  };
}
