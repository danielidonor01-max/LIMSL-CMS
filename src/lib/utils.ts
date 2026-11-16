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

// en-GB, matching how Nigeria writes dates (day first), formatCurrency was
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

// Date and time of day, for anything where the hour matters: a notification
// that a permit is waiting reads very differently at 07:10 than at 16:50, and
// the date alone hid that.
export function formatDateTime(dateString: string | null | undefined): string {
  if (!dateString) return "N/A";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;
  const day = date.toLocaleDateString(DATE_LOCALE, { year: "numeric", month: "short", day: "numeric" });
  const time = date.toLocaleTimeString(DATE_LOCALE, { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${day}, ${time}`;
}

// How long ago, in the words a person would use. Past a week the exact date
// says more than "23 days ago", so it stops there.
export function timeAgo(dateString: string | null | undefined, now: number = Date.now()): string {
  if (!dateString) return "";
  const t = new Date(dateString).getTime();
  if (isNaN(t)) return "";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr${h === 1 ? "" : "s"} ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} day${d === 1 ? "" : "s"} ago`;
  return "";
}

export function formatCurrency(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return "₦0.00";
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
  }).format(amount);
}
