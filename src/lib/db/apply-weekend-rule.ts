// src/lib/db/apply-weekend-rule.ts
// Moving the plan rows already written onto weekends.
//
// The generator stopped producing Saturday and Sunday dates (working-days.ts),
// but the plan written before that still has them. This moves each one the way
// the generator now would: a machine in a category goes to that category's day
// on the shared calendar, so it cannot land on a day another category owns;
// anything else goes to the next working day no category owns.
//
// Only rows nobody has made a decision about move: SCHEDULED or OVERDUE, no
// work order, no batch, not deferred, not rescheduled by hand. A row that would
// land on a day the machine already has the same activity is a duplicate, and
// is removed rather than doubled.
//
// Status follows the new date: a row moved onto today or later is SCHEDULED,
// one still in the past stays OVERDUE.
//
//   DATABASE_URL=... npx tsx src/lib/db/apply-weekend-rule.ts --dry-run
//   DATABASE_URL=... npx tsx src/lib/db/apply-weekend-rule.ts
import { db } from "@/lib/db";
import { maintenanceSchedule, equipment, auditLog } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { listCategories } from "@/lib/maintenance/asset-categories";
import { categoryCalendar, type CategoryCalendar } from "@/lib/maintenance/plan-generation";
import { isWeekend, toWorkingDay, addDays } from "@/lib/maintenance/working-days";

const MOVABLE = ["SCHEDULED", "OVERDUE"];

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Refusing to guess which database to change.");
    process.exit(1);
  }
  const today = new Date().toISOString().slice(0, 10);

  const rows = await db
    .select({
      id: maintenanceSchedule.id,
      equipmentId: maintenanceSchedule.equipmentId,
      plannedDate: maintenanceSchedule.plannedDate,
      activityType: maintenanceSchedule.activityType,
      status: maintenanceSchedule.status,
      workOrderId: maintenanceSchedule.workOrderId,
      batchId: maintenanceSchedule.batchId,
      deferredAt: maintenanceSchedule.deferredAt,
      category: equipment.category,
      assetId: equipment.assetId,
    })
    .from(maintenanceSchedule)
    .innerJoin(equipment, eq(maintenanceSchedule.equipmentId, equipment.id));

  const categories = await listCategories();
  const calendars = new Map<number, CategoryCalendar>();
  const calendarFor = (year: number) => {
    if (!calendars.has(year)) calendars.set(year, categoryCalendar(categories, year));
    return calendars.get(year)!;
  };

  const weekend = rows.filter((r) => isWeekend(r.plannedDate));
  const movable = weekend.filter(
    (r) => MOVABLE.includes(r.status) && !r.workOrderId && !r.batchId && !r.deferredAt,
  );
  const held = weekend.length - movable.length;

  const have = new Set(rows.map((r) => `${r.equipmentId}|${r.activityType}|${r.plannedDate}`));
  const moves: { id: string; from: string; to: string; status: string; assetId: string }[] = [];
  const dupes: { id: string; from: string; to: string; assetId: string }[] = [];

  for (const r of movable) {
    const year = Number(r.plannedDate.slice(0, 4));
    const cal = calendarFor(year);
    const others = new Set(
      [...cal.dates].filter(([code]) => code !== r.category).flatMap(([, ds]) => ds),
    );
    // The category's own day for this weekend: its first calendar date after
    // it, as long as that is the same week and not the next service.
    const own = r.category ? cal.dates.get(r.category) : undefined;
    const onCalendar = own?.find((d) => d > r.plannedDate && d <= addDays(r.plannedDate, 7));
    const to = onCalendar ?? toWorkingDay(r.plannedDate, others);
    if (to === r.plannedDate) continue;

    const key = `${r.equipmentId}|${r.activityType}|${to}`;
    if (have.has(key)) {
      dupes.push({ id: r.id, from: r.plannedDate, to, assetId: r.assetId });
      continue;
    }
    have.add(key);
    moves.push({ id: r.id, from: r.plannedDate, to, status: to < today ? "OVERDUE" : "SCHEDULED", assetId: r.assetId });
  }

  console.log(`\nPlan rows on a weekend: ${weekend.length}`);
  console.log(`  moving ................ ${moves.length}`);
  console.log(`  duplicate, removing ... ${dupes.length}`);
  console.log(`  held (a decision) ..... ${held}`);
  const byPair = new Map<string, number>();
  for (const m of moves) byPair.set(`${m.from} -> ${m.to}`, (byPair.get(`${m.from} -> ${m.to}`) ?? 0) + 1);
  for (const [k, v] of [...byPair].sort()) console.log(`    ${k}  ×${v}`);
  for (const d of dupes) console.log(`    duplicate: ${d.assetId} ${d.from} (already has ${d.to})`);

  if (dryRun) {
    console.log("\n--dry-run: nothing changed.");
    process.exit(0);
  }

  await db.transaction(async () => {
    for (const m of moves) {
      const d = new Date(`${m.to}T00:00:00Z`);
      await db
        .update(maintenanceSchedule)
        .set({
          plannedDate: m.to,
          year: d.getUTCFullYear(),
          month: d.getUTCMonth() + 1,
          quarter: Math.floor(d.getUTCMonth() / 3) + 1,
          status: m.status,
        })
        .where(eq(maintenanceSchedule.id, m.id));
    }
    if (dupes.length) {
      await db.delete(maintenanceSchedule).where(inArray(maintenanceSchedule.id, dupes.map((d) => d.id)));
    }
    await db.insert(auditLog).values({
      id: nanoid(),
      userId: null,
      userName: "System (weekend rule)",
      action: "UPDATE",
      entityType: "maintenance_schedule",
      entityId: "weekend-rule",
      entityDescription:
        `No PM on a Saturday or Sunday: ${moves.length} planned activit${moves.length === 1 ? "y" : "ies"} moved to the next free working day ` +
        `(on the category's calendar where it has one), ${dupes.length} duplicate${dupes.length === 1 ? "" : "s"} removed, ` +
        `${held} weekend row${held === 1 ? "" : "s"} left as decisions. Moves: ` +
        [...byPair].sort().map(([k, v]) => `${k} (${v})`).join("; "),
    });
  });

  console.log("\nDone.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
