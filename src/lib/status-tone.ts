// src/lib/status-tone.ts
// What colour a count is allowed to be.
//
// Status colour was being applied to the label rather than to the situation, so
// "Awaiting approval: 0" rendered amber and "Active breakdowns: 0" rendered red.
// A zero in a warning colour is worse than useless: it reads as a problem from
// across the room, the reader walks over, and there is nothing there. Do that a
// few times and they stop trusting the colour anywhere in the app, including on
// the screens where it means a machine is down.
//
// So the rule is about the VALUE, not the field: colour says "there is
// something here to deal with", and nothing to deal with is never coloured.

export type Tone = "danger" | "warn" | "brand" | "info";

const TONE_CLASS: Record<Tone, string> = {
  danger: "text-danger-600",
  warn: "text-warn-600",
  brand: "text-brand-600",
  info: "text-info-600",
};

// The empty tone is muted rather than the body colour, so a zero reads as
// "nothing here" rather than as an ordinary number worth reading.
export const EMPTY_TONE = "text-ink-400";

export function countTone(value: number, tone: Tone): string {
  if (!Number.isFinite(value) || value === 0) return EMPTY_TONE;
  return TONE_CLASS[tone];
}

// A total is a scale, not a status: 0 documents and 400 documents are both just
// facts. Totals stay in the body colour and go muted only when empty.
export function totalTone(value: number): string {
  return !Number.isFinite(value) || value === 0 ? EMPTY_TONE : "text-ink-900";
}
