// src/components/Button.tsx
// The single, standard button used across the app so every button looks and
// behaves the same, consistent padding, icon spacing, sizes and variants.
// Renders a <button> by default, or a Next <Link> when `href` is given.
"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost" | "subtle" | "dark";
export type ButtonSize = "sm" | "md" | "lg";

const BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition-all " +
  "disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none whitespace-nowrap";

// md and lg carry a 44px minimum height, the platform touch-target floor. A
// technician wearing gloves cannot reliably hit the 32px these used to be.
// sm stays compact for dense table rows, where taps are rarer and deliberate.
const SIZES: Record<ButtonSize, string> = {
  // A button label is the name of an action, not metadata about one, so it
  // reads at body size. The default sat at 12px, which is the size this app
  // used for table captions — every primary action in the system was set in
  // caption type, and that is most of why the interface read as cramped.
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm min-h-11",
  lg: "px-5 py-2.5 text-sm min-h-11",
};

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-brand-600 hover:bg-brand-500 text-white shadow-card shadow-brand-950/10",
  secondary: "bg-surface border border-line text-ink-700 hover:bg-ink-100 hover:border-ink-300",
  danger: "bg-danger-600 hover:bg-danger-500 text-white shadow-card shadow-danger-950/10",
  ghost: "text-ink-600 hover:text-ink-900 hover:bg-ink-100",
  subtle: "bg-ink-100 hover:bg-ink-200 text-ink-700 border border-line",
  // Matches the navigation rather than the brand. For the one lead action on a
  // page that already has brand-coloured controls, where a second green button
  // would compete with them instead of leading them.
  dark: "bg-nav hover:bg-nav-active text-white shadow-card",
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
    // tel:, mailto: and absolute URLs are not app routes, and handing one to
    // the router gives a dead control rather than a phone call. Added when the
    // emergency contact list needed a dialable button and had to hand-roll the
    // styling to get one, which the button guard correctly refused.
    const external = /^(tel:|mailto:|sms:|https?:)/i.test(String(props.href));
    if (external) {
      return (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        <a className={cls} {...(rest as any)}>
          {inner}
        </a>
      );
    }
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
