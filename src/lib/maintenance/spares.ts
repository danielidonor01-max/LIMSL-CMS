// src/lib/maintenance/spares.ts
// Critical spares, and the only question that matters about them.
//
// A parts list is inventory admin. What turns it into maintenance capability is
// this: for a CRITICAL machine, a spare below its minimum is a *predicted*
// outage whose length is already known, the supplier's lead time. That is a
// number you can act on weeks before anything breaks, and it is the reason
// AWAITING_PARTS shows up as unexplained downtime today.
//
// Everything here is pure so the arithmetic can be trusted without a database.

export type StockLevel = "OUT_OF_STOCK" | "BELOW_MINIMUM" | "AT_MINIMUM" | "ADEQUATE";

export const STOCK_LEVEL_LABELS: Record<StockLevel, string> = {
  OUT_OF_STOCK: "Out of stock",
  BELOW_MINIMUM: "Below minimum",
  AT_MINIMUM: "At minimum",
  ADEQUATE: "Adequate",
};

export const STOCK_LEVEL_BADGE: Record<StockLevel, string> = {
  OUT_OF_STOCK: "bg-rose-500/10 text-rose-700 border-rose-500/20",
  BELOW_MINIMUM: "bg-orange-500/10 text-orange-700 border-orange-500/20",
  AT_MINIMUM: "bg-amber-500/10 text-amber-700 border-amber-500/20",
  ADEQUATE: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
};

export function stockLevelOf(quantityOnHand: number, minimumQuantity: number): StockLevel {
  const qty = Number.isFinite(quantityOnHand) ? quantityOnHand : 0;
  const min = Number.isFinite(minimumQuantity) ? minimumQuantity : 0;
  if (qty <= 0) return "OUT_OF_STOCK";
  // With no minimum set nobody has said what "enough" means, so any stock at all
  // is reported as adequate rather than invented as a shortfall.
  if (min <= 0) return "ADEQUATE";
  if (qty < min) return "BELOW_MINIMUM";
  if (qty === min) return "AT_MINIMUM";
  return "ADEQUATE";
}

// Order up to the maximum where one is set, otherwise just back to the minimum.
export function reorderQuantity(
  quantityOnHand: number,
  minimumQuantity: number,
  maximumQuantity?: number | null,
): number {
  const qty = Math.max(0, Number.isFinite(quantityOnHand) ? quantityOnHand : 0);
  const min = Math.max(0, Number.isFinite(minimumQuantity) ? minimumQuantity : 0);
  const target = maximumQuantity && maximumQuantity > min ? maximumQuantity : min;
  return Math.max(0, target - qty);
}

export type SpareRisk = {
  level: StockLevel;
  // Days of production lost if the machine needs this part today.
  exposureDays: number;
  atRisk: boolean;
  severity: "none" | "low" | "medium" | "high";
  headline: string;
};

const CRITICALITY_WEIGHT: Record<string, number> = { CRITICAL: 3, HIGH: 2, MEDIUM: 1, LOW: 0 };

// What this shortfall actually costs, given the machine it belongs to.
export function spareRisk(input: {
  quantityOnHand: number;
  minimumQuantity: number;
  leadTimeDays?: number | null;
  onOrder?: boolean | null;
  equipmentCriticality?: string | null;
  equipmentName?: string | null;
}): SpareRisk {
  const level = stockLevelOf(input.quantityOnHand, input.minimumQuantity);
  const lead = Math.max(0, Number(input.leadTimeDays ?? 0));
  const weight = CRITICALITY_WEIGHT[(input.equipmentCriticality ?? "").toUpperCase().trim()] ?? 1;
  const short = level === "OUT_OF_STOCK" || level === "BELOW_MINIMUM";

  // Out of stock is the only case where the lead time is fully exposed: the
  // machine waits the whole of it. Below minimum still has cover on the shelf.
  const exposureDays = level === "OUT_OF_STOCK" ? lead : 0;

  if (!short) {
    return { level, exposureDays, atRisk: false, severity: "none", headline: STOCK_LEVEL_LABELS[level] };
  }

  // Being on order bounds the wait, so it takes a grade off, but it cannot
  // take one off a critical part that is entirely absent, because the exposure
  // if the machine fails this afternoon is exactly the same either way. A
  // purchase order is not a spare.
  const criticalAndAbsent = level === "OUT_OF_STOCK" && weight >= 3;
  const onOrderRelief = input.onOrder && !criticalAndAbsent ? 1 : 0;
  const raw = (level === "OUT_OF_STOCK" ? 2 : 1) + weight - onOrderRelief;
  const severity: SpareRisk["severity"] = raw >= 4 ? "high" : raw >= 3 ? "medium" : "low";

  const machine = input.equipmentName ? ` for ${input.equipmentName}` : "";
  const headline =
    level === "OUT_OF_STOCK"
      ? lead > 0
        ? `Out of stock${machine}, a failure today means ${lead} day${lead === 1 ? "" : "s"} down waiting on the supplier.`
        : `Out of stock${machine}, no lead time recorded, so the wait is unknown.`
      : `Below minimum${machine}, reorder before the shelf runs out.`;

  return { level, exposureDays, atRisk: true, severity, headline };
}

// Applying a movement. Stock is never allowed below zero: a negative balance is
// always a recording error, and silently accepting it destroys the one number
// the register exists to hold.
export function applyMovement(
  balance: number,
  movementType: string,
  quantity: number,
): { ok: true; balanceAfter: number; delta: number } | { ok: false; error: string } {
  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty <= 0) {
    return { ok: false, error: "Enter a quantity greater than zero." };
  }
  const current = Number.isFinite(balance) ? balance : 0;

  if (movementType === "RECEIPT") return { ok: true, balanceAfter: current + qty, delta: qty };

  if (movementType === "ISSUE") {
    if (qty > current) {
      return {
        ok: false,
        error: `Only ${current} in stock, you cannot issue ${qty}. Record a receipt first if stock arrived without being booked in.`,
      };
    }
    return { ok: true, balanceAfter: current - qty, delta: -qty };
  }

  if (movementType === "ADJUSTMENT") {
    // An adjustment sets the counted figure rather than moving by an amount.
    return { ok: true, balanceAfter: qty, delta: qty - current };
  }

  return { ok: false, error: "Movement must be a receipt, an issue or a stock adjustment." };
}

export const MOVEMENT_LABELS: Record<string, string> = {
  RECEIPT: "Received",
  ISSUE: "Issued to a job",
  ADJUSTMENT: "Stock count correction",
};
