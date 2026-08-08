import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// DB text timestamps are stored WITHOUT milliseconds (to_char … 'SS"Z"'), while
// Date.toISOString() emits them. Any lexicographic range comparison against a
// stored timestamp must use this second-precision form, or the boundary second
// compares wrong ('.' sorts before 'Z').
export function isoSeconds(d: Date = new Date()): string {
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

// en-GB, matching how Nigeria writes dates (day first) — formatCurrency was
// already localised to en-NG while dates were rendering US-format.
//
// The month stays spelled out deliberately. A purely numeric date is ambiguous
// between conventions (03/04/2026 is two different days), and in a system whose
// records are read by auditors and insurers that ambiguity is a liability, not
// a preference.
export const DATE_LOCALE = "en-GB";

export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return "N/A";
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    return date.toLocaleDateString(DATE_LOCALE, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateString;
  }
}

export function formatCurrency(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return "₦0.00";
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
  }).format(amount);
}
