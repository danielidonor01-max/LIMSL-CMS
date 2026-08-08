// src/app/offline/page.tsx
// Served by the service worker when a page is requested with no connection and
// nothing cached for it. Says what is true and what still works, rather than
// leaving the browser's own "no internet" dinosaur to imply the app is broken.
"use client";

import { WifiOff, RefreshCw } from "lucide-react";

export default function OfflinePage() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="max-w-md text-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-700 grid place-items-center mx-auto">
          <WifiOff className="w-7 h-7" />
        </div>
        <h1 className="text-lg font-bold text-slate-900">You&apos;re offline</h1>
        <p className="text-sm text-slate-600 leading-relaxed">
          This page hasn&apos;t been opened on this device before, so there&apos;s nothing saved to show you.
          Pages you have already visited will still open.
        </p>
        <p className="text-xs text-slate-500 leading-relaxed">
          Anything you were filling in is kept on this phone, and anything you submitted while offline is queued
          and will send itself when you have signal. Nothing has been lost.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-2 px-4 min-h-11 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500"
        >
          <RefreshCw className="w-4 h-4" /> Try again
        </button>
      </div>
    </div>
  );
}
