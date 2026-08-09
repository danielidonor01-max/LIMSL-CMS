// src/components/Badge.tsx
import { cn } from "@/lib/utils";

export function Badge({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      // 11px, not 10px: status is the primary signal on every list page and it
      // is read in a bright workshop. Callers pass -700 text tones (measured
      // ≥4.5:1 on the /10 tint) rather than -600, which measured 2.95-4.26:1
      // and failed AA at this size.
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border whitespace-nowrap",
        className,
      )}
    >
      {children}
    </span>
  );
}
