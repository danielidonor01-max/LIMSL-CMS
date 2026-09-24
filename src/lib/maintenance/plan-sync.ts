// src/lib/maintenance/plan-sync.ts
// Writing a machine's plan into the schedule.
//
// The arithmetic lives in plan-generation.ts and is pure. This is the half that
// touches the database, kept separate so the rule can be tested without one and
// so every caller — adding a machine, changing its interval, importing a
// hundred at once — puts the same rows in.
//
// It only ever ADDS the dates that are missing. Rows somebody has rescheduled,
// deferred or completed are decisions people made, and a generator that
// overwrote them would erase those decisions silently, which is worse than
// having no generator at all.
import { db } from "@/lib/db";
import { maintenanceSchedule, auditLog } from "@/lib/db/schema";
import { and, eq, gte, lte } from "drizzle-orm";
import { nanoid } from "nanoid";
import { plannedDatesFor, missingDates } from "./plan-generation";

export type PlanSyncResult = { added: number; dates: string[]; skipped: number };

export async function syncPlanForEquipment(
  machine: {
    id: string;
    assetId?: string | null;
    name?: string | null;
    maintenanceFrequency?: string | null;
    commissioningDate?: string | null;
    lastMaintenanceDate?: string | null;
  },
  opts: {
    year?: number;
    /** Nothing is planned before this. Defaults to today. */
    notBefore?: string | null;
    actor?: { id?: string | null; name?: string | null };
  } = {},
): Promise<PlanSyncResult> {
  const year = opts.year ?? new Date().getFullYear();
  const notBefore = opts.notBefore === null ? null : (opts.notBefore ?? new Date().toISOString().slice(0, 10));

  const wanted = plannedDatesFor({
    frequency: machine.maintenanceFrequency,
    anchorDate: machine.lastMaintenanceDate || machine.commissioningDate || null,
    year,
    notBefore,
  });
  if (wanted.length === 0) return { added: 0, dates: [], skipped: 0 };

  const existing = await db
    .select({ plannedDate: maintenanceSchedule.plannedDate })
    .from(maintenanceSchedule)
    .where(
      and(
        eq(maintenanceSchedule.equipmentId, machine.id),
        gte(maintenanceSchedule.plannedDate, `${year}-01-01`),
        lte(maintenanceSchedule.plannedDate, `${year}-12-31`),
      ),
    );

  const gaps = missingDates(wanted, existing);
  if (gaps.length === 0) return { added: 0, dates: [], skipped: existing.length };

  await db.insert(maintenanceSchedule).values(
    gaps.map((g) => ({
      id: nanoid(),
      equipmentId: machine.id,
      year,
      quarter: g.quarter,
      month: g.month,
      plannedDate: g.plannedDate,
      activityType: g.activityType,
      maintenanceFrequency: machine.maintenanceFrequency ?? null,
      status: "SCHEDULED",
    })),
  );

  const label = [machine.assetId, machine.name].filter(Boolean).join(" ") || machine.id;
  await db.insert(auditLog).values({
    id: nanoid(),
    userId: opts.actor?.id ?? null,
    userName: opts.actor?.name || "System",
    action: "CREATE",
    entityType: "maintenance_schedule",
    entityId: machine.id,
    entityDescription:
      `${label} added to the ${year} plan, ${gaps.length} PM activit${gaps.length === 1 ? "y" : "ies"} ` +
      `at ${String(machine.maintenanceFrequency ?? "").toLowerCase().replace(/_/g, " ")}: ` +
      gaps.map((g) => g.plannedDate).join(", "),
  });

  return { added: gaps.length, dates: gaps.map((g) => g.plannedDate), skipped: existing.length };
}
