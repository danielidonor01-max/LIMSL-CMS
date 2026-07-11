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
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border whitespace-nowrap",
        className,
      )}
    >
      {children}
    </span>
  );
}
