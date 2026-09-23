// src/lib/signing-pin.ts
// The PIN entered at the moment of signing.
//
// OPTIONAL, and per person. A signature's evidential weight comes from the
// record around it — the authenticated session, the user id, the role, the
// timestamp and the audit row — and that record exists whether or not a PIN
// was typed. What the PIN adds is one specific thing: it says the person at
// the keyboard is the account holder AT THE MOMENT OF SIGNING, rather than
// whoever picked up a tablet somebody left logged in.
//
// Whether that risk is worth an extra six digits per signature is a judgement
// about where you work, so it belongs to the person signing. A foreman on a
// shared workshop tablet will want it. Somebody signing from their own laptop
// reasonably will not. It is set, changed and removed in Account settings, and
// where one is set it is enforced — turning it on is a decision, and it is not
// one a signing dialog may quietly skip.
//
// It is deliberately not the login password. On a shared tablet a login
// password typed a dozen times a shift in front of colleagues becomes a short
// password, and then a shared one. A separate short PIN is entered often and
// by design unlocks nothing except attribution.

export const PIN_LENGTH = 6;

export type PinCheck = { ok: true } | { ok: false; error: string };

const RUN_UP = "0123456789";
const RUN_DOWN = "9876543210";

/**
 * Whether a proposed PIN is acceptable.
 *
 * The rules are few and each rules out a PIN that a colleague standing behind
 * somebody would guess first. Anything more elaborate pushes people to write it
 * on the machine, which is the actual threat.
 */
export function validatePin(raw: unknown): PinCheck {
  // A string, not a number. 042917 sent as JSON number arrives as 42917, so a
  // PIN beginning with a zero would be silently refused for the one person who
  // chose it and work for everybody else.
  if (typeof raw !== "string") {
    return { ok: false, error: `The signing PIN is exactly ${PIN_LENGTH} digits.` };
  }
  const pin = raw;

  if (!new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin)) {
    return { ok: false, error: `The signing PIN is exactly ${PIN_LENGTH} digits.` };
  }
  if (new Set(pin).size === 1) {
    return { ok: false, error: "A PIN of one repeated digit is the first thing anybody tries." };
  }
  if (RUN_UP.includes(pin) || RUN_DOWN.includes(pin)) {
    return { ok: false, error: "A straight run of digits is the second thing anybody tries." };
  }
  // 121212, 123123. A repeating short block reads as random and is not.
  for (const block of [1, 2, 3]) {
    if (PIN_LENGTH % block !== 0) continue;
    const head = pin.slice(0, block);
    if (head.repeat(PIN_LENGTH / block) === pin && block !== PIN_LENGTH) {
      return { ok: false, error: "A repeating pattern is easier to read over a shoulder than it looks." };
    }
  }
  return { ok: true };
}

/**
 * Whether this user has chosen to protect their signature with a PIN.
 *
 * The single question both halves ask: the signing dialog, to decide whether to
 * show the field, and the route, to decide whether to check it. One function so
 * the page cannot ask for something the server ignores, or skip something the
 * server demands.
 */
export function hasSigningPin(signingPinHash: string | null | undefined): boolean {
  return !!signingPinHash;
}
