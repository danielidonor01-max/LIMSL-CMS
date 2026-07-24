// src/components/PreferencesProvider.tsx
// Loads the signed-in user's preferences once, then applies the two that are
// app-wide: list DENSITY (a data-attribute on <html> that globals.css keys off)
// and the DEFAULT LANDING page (a one-time redirect right after sign-in). Other
// screens read prefs via useUserPrefs(); the account page calls refresh() after
// saving so changes take effect immediately.
"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { DEFAULT_PREFS, type UserPrefs } from "@/lib/user-prefs";

type Ctx = { prefs: UserPrefs; refresh: () => Promise<void> };
const PreferencesContext = createContext<Ctx>({ prefs: DEFAULT_PREFS, refresh: async () => {} });

export const useUserPrefs = () => useContext(PreferencesContext);

export default function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const router = useRouter();
  const [prefs, setPrefs] = useState<UserPrefs>(DEFAULT_PREFS);

  // Redirect happens here (not a separate effect) so it fires once prefs have
  // actually arrived, avoiding a race with the default "/". The sessionStorage
  // guard keeps it to the first arrival — later, deliberate visits to "/" stay.
  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/me");
      if (!res.ok) return;
      const data = await res.json();
      const p = data?.preferences as UserPrefs | undefined;
      if (!p) return;
      setPrefs(p);
      if (
        typeof window !== "undefined" &&
        window.location.pathname === "/" &&
        p.defaultLanding &&
        p.defaultLanding !== "/" &&
        !sessionStorage.getItem("landingApplied")
      ) {
        sessionStorage.setItem("landingApplied", "1");
        router.replace(p.defaultLanding);
      }
    } catch {
      // Preferences are non-critical chrome — never block the app on them.
    }
  }, [router]);

  useEffect(() => {
    if (status === "authenticated") {
      refresh();
    } else if (status === "unauthenticated") {
      setPrefs(DEFAULT_PREFS);
      // Re-arm the one-time redirect so the next sign-in honours the landing pref.
      if (typeof window !== "undefined") sessionStorage.removeItem("landingApplied");
    }
  }, [status, refresh]);

  // Apply density globally; globals.css tightens spacing under [data-density=compact].
  useEffect(() => {
    document.documentElement.dataset.density = prefs.density;
  }, [prefs.density]);

  return <PreferencesContext.Provider value={{ prefs, refresh }}>{children}</PreferencesContext.Provider>;
}
