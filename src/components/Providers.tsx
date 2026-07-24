// src/components/Providers.tsx
"use client";

import { SessionProvider } from "next-auth/react";
import { Toaster } from "sonner";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    // The JWT session is long-lived and carries only role/id — no need to poll
    // it or refetch on every window focus. Both default to on and cause constant
    // re-renders + /api/auth/session round trips across the app.
    <SessionProvider refetchOnWindowFocus={false} refetchInterval={0}>
      {children}
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
