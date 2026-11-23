// src/lib/maintenance/category-move.ts
// Moving machines from one category to another, one or many at a time
// (LIMSL, 23 Nov 2026).
//
// A machine's category decides how often it is serviced and on which days, so
// a move is a change of regime, not a relabel: the machine takes the new
// category's interval and its untouched future plan is rebuilt on that
// category's calendar. Work already done, overdue, deferred or under way stays
// as it is, because those are decisions and history.
//
// Pure: which machines may move and why not. The route applies it.

export type MoveCandidate = {
  id: string;
  name: string | null;
  category: string;
  status: string | null;
  removedAt?: string | null;
};

export type MoveRefusal = { id: string; name: string | null; why: string };

export function planCategoryMove(
  machines: MoveCandidate[],
  toCategory: string,
  /** Machines with a PM batch still open: their batch belongs to the old category. */
  inOpenBatch: Set<string>,
): { movable: MoveCandidate[]; refused: MoveRefusal[] } {
  const movable: MoveCandidate[] = [];
  const refused: MoveRefusal[] = [];
  for (const m of machines) {
    const no = (why: string) => refused.push({ id: m.id, name: m.name, why });
    if (m.removedAt) no("It has been removed from the register.");
    else if (m.status === "DECOMMISSIONED") no("It is decommissioned.");
    else if (m.category === toCategory) no("It is already in that category.");
    else if (inOpenBatch.has(m.id)) no("It is on a PM batch that is still open. Finish or cancel the batch first.");
    else movable.push(m);
  }
  return { movable, refused };
}

/** Null when the request can go ahead. */
export function validateMoveRequest(input: { equipmentIds: unknown; toCategory: unknown }): string | null {
  if (!Array.isArray(input.equipmentIds) || input.equipmentIds.length === 0) return "Choose at least one machine to move.";
  if (input.equipmentIds.some((v) => typeof v !== "string" || !v)) return "The list of machines is not valid.";
  if (input.equipmentIds.length > 200) return "Move at most 200 machines at a time.";
  if (typeof input.toCategory !== "string" || !input.toCategory.trim()) return "Choose the category to move them to.";
  return null;
}
