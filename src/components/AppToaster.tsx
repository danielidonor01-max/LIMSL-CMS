// src/components/AppToaster.tsx
// The toast, in the RareUI manner (LIMSL, 16 Nov 2026) and in our own tokens.
//
// RareUI's toasts arrive on a spring and come into focus out of a slight blur,
// sit in a soft card, and carry a fine line that runs down while they wait.
// That is the look. The engine stays sonner: every toast in the app already
// calls toast.success / toast.error with a title, a description and sometimes
// an action, and rebuilding forty call sites to change how a message looks
// would be churn with no reader benefit. So sonner is run unstyled and dressed
// here, and the motion and the running line live in globals.css under
// [data-sonner-toast], where sonner exposes its state.
//
// Colour carries meaning only: the icon disc and the running line take the
// tone (brand for done, rose for failed, amber for warning, sky for info);
// the card itself stays white on a hairline, like every other panel.
"use client";

import { Toaster } from "sonner";
import { AlertTriangle, CheckCircle2, Info, Loader2, XCircle } from "lucide-react";

const disc = "grid place-items-center w-8 h-8 rounded-full shrink-0";

export default function AppToaster() {
  return (
    <Toaster
      position="top-right"
      gap={10}
      visibleToasts={4}
      duration={5000}
      closeButton
      offset={16}
      icons={{
        success: (
          <span className={`${disc} bg-brand-500/10 text-brand-600`}>
            <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
          </span>
        ),
        error: (
          <span className={`${disc} bg-danger-500/10 text-danger-600`}>
            <XCircle className="w-4 h-4" aria-hidden="true" />
          </span>
        ),
        warning: (
          <span className={`${disc} bg-warn-500/10 text-warn-700`}>
            <AlertTriangle className="w-4 h-4" aria-hidden="true" />
          </span>
        ),
        info: (
          <span className={`${disc} bg-info-500/10 text-info-700`}>
            <Info className="w-4 h-4" aria-hidden="true" />
          </span>
        ),
        loading: (
          <span className={`${disc} bg-ink-100 text-ink-500`}>
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          </span>
        ),
      }}
      toastOptions={{
        unstyled: true,
        // Read by the running line in globals.css, so it empties exactly as
        // the toast leaves. A call that sets its own duration sets this too.
        style: { "--toast-duration": "5000ms" } as React.CSSProperties,
        classNames: {
          toast:
            "app-toast group relative flex w-[var(--width)] items-start gap-3 overflow-hidden rounded-xl border border-line bg-surface p-3.5 pr-10 shadow-raised font-sans",
          content: "min-w-0 flex-1",
          title: "text-sm font-semibold text-ink-900 leading-snug",
          description: "mt-0.5 text-xs text-ink-600 leading-relaxed",
          icon: "shrink-0",
          actionButton:
            "self-center shrink-0 rounded-lg bg-brand-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition-colors",
          cancelButton:
            "self-center shrink-0 rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold text-ink-700 hover:bg-ink-100 transition-colors",
          closeButton:
            "absolute right-2 top-2 grid w-6 h-6 place-items-center rounded-full text-ink-400 hover:text-ink-900 hover:bg-ink-100 transition-colors [&_svg]:w-3.5 [&_svg]:h-3.5",
        },
      }}
    />
  );
}
