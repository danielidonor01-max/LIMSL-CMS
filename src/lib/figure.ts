// src/lib/figure.ts
// Deciding whether a displayed figure is a number the counter may roll.
//
// The counter replaces the text it is given with digits it draws itself, so it
// must only ever be handed a figure it can draw back EXACTLY. The first version
// guessed: parseFloat turned "92%" into 92 and dropped the sign, "3.5" became
// "4" because nobody passed the decimals, "07" lost its zero, and an asset tag
// like "LEE/PE/0012" would have rolled up to "LEE/PE/12". On a compliance
// screen a wrong number is worse than a still one, so anything that is not one
// plain number with a short unit around it is left as text.

export type Figure = {
  /** Text before the number, e.g. "₦" or "≥ ". Never letters, digits, slashes. */
  prefix: string;
  num: number;
  decimals: number;
  /** Width of the whole part as written, so "07" keeps its zero. */
  padStart: number;
  /** "," when the source grouped thousands, "" when it did not. */
  separator: string;
  /** Text after the number, e.g. "%", " hrs", "d". Never digits or slashes. */
  suffix: string;
};

// prefix: at most two symbol characters and an optional space; no letters
//   (that is how an ID starts), no digits, slashes, dots, commas or signs.
// number: optional minus, whole part either plain or grouped in threes, then
//   optional decimals.
// suffix: a short unit with no digits and no slash, so "12-14", "1 of 3",
//   "2026-11-09" and "3/4" are all refused.
const FIGURE =
  /^([^\p{L}\p{N}\s/\\.,+\-]{0,2}\s?|\+)(-)?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?([^\p{N}/\\]{0,12})$/u;

export function parseFigure(value: string | number | null | undefined): Figure | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    // String() is what the screen would have shown, so it is the source.
    return parseFigure(String(value));
  }

  const match = FIGURE.exec(value);
  if (!match) return null;
  const [, prefix, minus, whole, fraction = "", suffix] = match;

  // A number that would not survive the trip through a float is refused
  // rather than drawn wrong.
  const digits = whole.replace(/,/g, "");
  const num = Number(`${minus ?? ""}${digits}.${fraction || "0"}`);
  if (!Number.isFinite(num) || Math.abs(num) * 10 ** fraction.length > Number.MAX_SAFE_INTEGER) return null;

  return {
    prefix,
    num,
    decimals: fraction.length,
    padStart: digits.length > 1 && digits.startsWith("0") ? digits.length : 1,
    separator: whole.includes(",") ? "," : "",
    suffix,
  };
}

/** The figure as text, exactly as the counter will draw it at rest. */
export function formatFigure(f: Figure): string {
  const abs = Math.abs(f.num);
  const [w, d = ""] = abs.toFixed(f.decimals).split(".");
  const whole = w.padStart(f.padStart, "0").replace(/\B(?=(\d{3})+(?!\d))/g, f.separator);
  const sign = f.num < 0 && Number(abs.toFixed(f.decimals)) !== 0 ? "-" : "";
  return `${f.prefix}${sign}${whole}${f.decimals ? `.${d}` : ""}${f.suffix}`;
}
