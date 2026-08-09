// src/components/ServiceWorker.tsx
// Registers the app-shell worker. Registration is deliberately deferred until
// after load so it never competes with the first paint on a slow workshop
// connection, the shell being cached matters on the *second* visit, not this
// one.
"use client";

import { useEffect } from "react";

export default function ServiceWorker() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    // A worker registered against a dev server caches half-built assets and
    // produces confusing stale-module errors; only run it on a real build.
    if (process.env.NODE_ENV !== "production") return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Registration fails on an insecure origin or with storage blocked.
        // The app works exactly as before without it, so there is nothing to
        // tell the user.
      });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register);
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
