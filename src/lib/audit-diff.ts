// src/lib/audit-diff.ts
// What an edit actually changed, field by field, for the audit log and for
// rules that lock a field once it has been set.
//
// Screens send whole forms back, unchanged fields included, so "the body named
// this field" is not "this field changed". Blank (null, undefined, "") counts
// as one value, objects compare by their JSON, and timestamps compare to the
// minute, because a form round-trips "2026-11-14T08:00:00.000Z" as
// "2026-11-14T08:00".

export type FieldChange = { from: unknown; to: unknown };

const DATE_LIKE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?/;

// JSON columns are compared by content: keys in any order, and a key holding a
// blank is the same as the key being absent ({"why2": null} vs {"why2": ""}).
function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v).sort()) {
      const c = canonical((v as Record<string, unknown>)[k]);
      if (c !== "" && c !== null && c !== undefined) out[k] = c;
    }
    return out;
  }
  if (typeof v === "string") return v.trim();
  return v ?? "";
}

export function comparable(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") {
    const s = v.trim();
    if (s.startsWith("{") || s.startsWith("[")) {
      try {
        return comparable(JSON.parse(s));
      } catch {
        return s;
      }
    }
    return DATE_LIKE.test(s) ? s.slice(0, 16) : s;
  }
  if (typeof v === "object") {
    const c = JSON.stringify(canonical(v));
    return c === "{}" || c === "[]" ? "" : c;
  }
  return String(v);
}

export function isBlank(v: unknown): boolean {
  return comparable(v) === "";
}

/** The fields of `next` whose value differs from `before`. */
export function fieldChanges(
  before: Record<string, unknown>,
  next: Record<string, unknown>,
  ignore: string[] = ["updatedAt"],
): Record<string, FieldChange> {
  const out: Record<string, FieldChange> = {};
  for (const key of Object.keys(next)) {
    if (ignore.includes(key)) continue;
    if (comparable(before[key]) !== comparable(next[key])) out[key] = { from: before[key] ?? null, to: next[key] ?? null };
  }
  return out;
}
