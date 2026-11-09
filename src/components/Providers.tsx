// src/components/Providers.tsx
"use client";

import { SessionProvider } from "next-auth/react";
import { Toaster } from "sonner";
import { LazyMotion } from "motion/react";
import PreferencesProvider from "@/components/PreferencesProvider";

const loadMotionFeatures = () => import("@/lib/motion-features").then((mod) => mod.default);

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    // The JWT session is long-lived and carries only role/id, no need to poll
    // it or refetch on every window focus. Both default to on and cause constant
    // re-renders + /api/auth/session round trips across the app.
    <SessionProvider refetchOnWindowFocus={false} refetchInterval={0}>
      {/* strict makes a stray full `motion.*` component throw in development,
          because one of those silently pulls the whole engine back into the
          initial bundle and undoes the lazy load. */}
      <LazyMotion features={loadMotionFeatures} strict>
        <PreferencesProvider>{children}</PreferencesProvider>
      </LazyMotion>
      <Toaster
        position="top-right"
        richColors
        toastOptions={{
          style: { fontFamily: "var(--font-sans)", fontSize: "13px" },
        }}
      />
    </SessionProvider>
  );
}
