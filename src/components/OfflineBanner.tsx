// src/components/OfflineBanner.tsx
// Workshop wifi drops. Until now the only signal was that a submit quietly did
// nothing, which is indistinguishable from success — so a technician would walk
// away believing a fault was logged. This says so plainly, and reassures them
// that what they've typed is still on the phone.
"use client";

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

export default function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-40 flex items-center justify-center gap-2 bg-amber-500 px-4 py-2 text-center text-xs font-semibold text-amber-950 no-print"
    >
      <WifiOff className="w-4 h-4 shrink-0" />
      You&apos;re offline — anything you type is kept on this phone. Reconnect before submitting.
    </div>
  );
}
