// src/components/Badge.tsx
import { cn } from "@/lib/utils";

export function Badge({
  className,
  children,
  dot = false,
}: {
  className?: string;
  children: React.ReactNode;
  // A leading dot, for a status that is live right now rather than a
  // classification. Reserve it: if everything has a dot it stops meaning
  // "currently true" and becomes decoration on every pill in the app.
  dot?: boolean;
}) {
  return (
    <span
      // 11px, not 10px: status is the primary signal on every list page and it
      // is read in a bright workshop. Callers pass -700 text tones (measured
      // ≥4.5:1 on the /10 tint) rather than -600, which measured 2.95-4.26:1
      // and failed AA at this size.
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold border whitespace-nowrap",
        className,
      )}
    >
      {dot && (
        // currentColor, so the dot follows whatever tone the caller passed and
        // can never drift out of step with the label beside it.
        <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0" aria-hidden="true" />
      )}
      {children}
    </span>
  );
}
