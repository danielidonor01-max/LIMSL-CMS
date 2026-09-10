// src/lib/hse/emergency-contact-kinds.ts
// What kind of emergency contact this is, and the order they are needed in.
//
// Lifted out of the emergency page when the scan passport started showing the
// same contacts and rendered "FIRE" at somebody, which is a database value
// wearing a label. Two lists would have drifted the first time one was edited.
//
// Ordered the way an emergency runs, not alphabetically, and the numbers here
// drive the display_order column so the fire service cannot sort below a
// stationery supplier.

export const CONTACT_KINDS = [
  { value: "FIRE", label: "Fire service", order: 10 },
  { value: "AMBULANCE", label: "Ambulance", order: 20 },
  { value: "CLINIC", label: "Clinic or hospital", order: 30 },
  { value: "INTERNAL", label: "Internal (first aider, warden, manager)", order: 40 },
  { value: "POLICE", label: "Police", order: 50 },
  { value: "REGULATOR", label: "Regulator or agency", order: 60 },
  { value: "UTILITY", label: "Utility (power, gas, water)", order: 70 },
  { value: "OTHER", label: "Other", order: 100 },
] as const;

const BY_VALUE = new Map<string, string>(CONTACT_KINDS.map((k) => [k.value, k.label]));

/** The readable name, or the raw value if somebody adds a kind without a label. */
export const contactKindLabel = (kind: string | null | undefined): string =>
  BY_VALUE.get(String(kind ?? "")) ?? String(kind ?? "Contact");

export const contactKindOrder = (kind: string | null | undefined): number =>
  CONTACT_KINDS.find((k) => k.value === kind)?.order ?? 100;

// The kinds anybody standing at a machine may need, in the order they would
// need them. A regulator or a utility is a business call, not an emergency one,
// so they stay off the public passport.
export const PUBLIC_CONTACT_KINDS: string[] = ["FIRE", "AMBULANCE", "CLINIC", "INTERNAL"];
