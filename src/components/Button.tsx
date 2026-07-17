// src/components/Button.tsx
// The single, standard button used across the app so every button looks and
// behaves the same — consistent padding, icon spacing, sizes and variants.
// Renders a <button> by default, or a Next <Link> when `href` is given.
"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost" | "subtle";
export type ButtonSize = "sm" | "md" | "lg";

const BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition-all " +
  "disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none whitespace-nowrap";

const SIZES: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-xs",
  lg: "px-5 py-2.5 text-sm",
};

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm shadow-emerald-950/10",
  secondary: "bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 hover:border-slate-300",
  danger: "bg-rose-600 hover:bg-rose-500 text-white shadow-sm shadow-rose-950/10",
  ghost: "text-slate-600 hover:text-slate-900 hover:bg-slate-100",
  subtle: "bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200",
};

type CommonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ElementType; // leading icon (lucide component)
  iconRight?: React.ElementType; // trailing icon
  loading?: boolean;
  fullWidth?: boolean;
  className?: string;
  children?: React.ReactNode;
};

type AsButton = CommonProps &
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, keyof CommonProps> & { href?: undefined };
type AsLink = CommonProps &
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, keyof CommonProps> & { href: string };

export default function Button(props: AsButton | AsLink) {
  const {
    variant = "primary",
    size = "md",
    icon: Icon,
    iconRight: IconRight,
    loading = false,
    fullWidth = false,
    className = "",
    children,
    ...rest
  } = props as CommonProps & Record<string, unknown>;

  const cls = `${BASE} ${SIZES[size]} ${VARIANTS[variant]} ${fullWidth ? "w-full" : ""} ${className}`;
  const iconSize = size === "lg" ? "w-5 h-5" : "w-4 h-4";

  const inner = (
    <>
      {loading ? <Loader2 className={`${iconSize} animate-spin`} /> : Icon ? <Icon className={iconSize} /> : null}
      {children}
      {IconRight && !loading ? <IconRight className={iconSize} /> : null}
    </>
  );

  // `rest` still carries href (for links) or button attrs; spread as-is.
  if ("href" in props && props.href !== undefined) {
    return (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      <Link className={cls} {...(rest as any)}>
        {inner}
      </Link>
    );
  }

  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <button className={cls} disabled={loading || (rest as any).disabled} {...(rest as any)}>
      {inner}
    </button>
  );
}
