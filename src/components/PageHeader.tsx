// src/components/PageHeader.tsx
// Standard page title row used across every module (replaces the per-page
// full-width <header> bars so every screen matches: sidebar + top search + this).
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function PageHeader({
  title,
  subtitle,
  icon: Icon,
  backHref,
  backLabel = "Back",
  actions,
  tone = "emerald",
}: {
  title: string;
  subtitle?: string;
  icon?: React.ElementType;
  backHref?: string;
  backLabel?: string;
  actions?: React.ReactNode;
  tone?: "emerald" | "rose" | "sky" | "amber";
}) {
  const toneCls: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-600 border-emerald-200",
    rose: "bg-rose-50 text-rose-600 border-rose-200",
    sky: "bg-sky-50 text-sky-600 border-sky-200",
    amber: "bg-amber-50 text-amber-600 border-amber-200",
  };
  return (
    <div className="space-y-3">
      {backHref && (
        <Link href={backHref} className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900">
          <ArrowLeft className="w-3.5 h-3.5" /> {backLabel}
        </Link>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {Icon && (
            <div className={`p-2 rounded-lg border ${toneCls[tone]}`}>
              <Icon className="w-5 h-5" />
            </div>
          )}
          <div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900">{title}</h2>
            {subtitle && <p className="text-xs text-slate-500 font-mono">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
