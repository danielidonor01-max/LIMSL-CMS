// src/lib/hse/permit-machines.ts
// The machines a permit covers. A PM batch permit lists every machine in the
// batch as a JSON array; a permit for one job lists one. Read through here so
// a malformed value is treated as "no list" rather than as an error.
export function permitMachines(equipmentIds: string | null | undefined, fallback?: string | null): string[] {
  try {
    const v = JSON.parse(equipmentIds ?? "[]");
    const list = Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
    if (list.length) return list;
  } catch {
    // fall through to the single machine
  }
  return fallback ? [fallback] : [];
}

export function permitCovers(equipmentIds: string | null | undefined, equipmentId: string): boolean {
  return permitMachines(equipmentIds).includes(equipmentId);
}
