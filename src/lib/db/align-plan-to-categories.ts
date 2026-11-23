// src/lib/db/align-plan-to-categories.ts
// Put every machine's upcoming PM plan on its category's calendar
// (LIMSL, 23 Nov 2026).
//
//   npx tsx --env-file=.env.local src/lib/db/align-plan-to-categories.ts           report only
//   npx tsx --env-file=.env.local src/lib/db/align-plan-to-categories.ts --apply   writes it
//
// For each machine in service it removes the future PM visits nobody has
// touched that are not on the category's days (the rule is isReplannable:
// scheduled, no work order, no batch, not deferred), and adds the category's
// days that are missing: what is left of this year and the first of next.
//
// One exception keeps a visit that is off the calendar: where the category has
// no round left this year and the machine would go longer than its interval
// without a PM (or has never had one), its earliest pending visit stays as a
// catch-up. After that it follows the category like every other machine.
//
// It never touches work that is completed, overdue, deferred, batched or
// started, and it never adds a visit in the past: a round nobody planned is
// not a round that was missed, and the record must not say it was.
import { db } from "@/lib/db";
import { auditLog, equipment, maintenanceSchedule } from "@/lib/db/schema";
import { inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { isReplannable, listCategories } from "@/lib/maintenance/asset-categories";
import { FREQUENCY_MONTHS, upcomingCategoryDates } from "@/lib/maintenance/plan-generation";

const dayNumber = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / 864e5;

const APPLY = process.argv.includes("--apply");

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  console.log(APPLY ? "APPLYING." : "REPORT ONLY: nothing is changed.");
  const cats = await listCategories();
  const machines = (await db.select().from(equipment)).filter(
    (m: typeof equipment.$inferSelect) => !m.removedAt && m.status !== "DECOMMISSIONED" && m.category,
  );
  const rows = await db.select().from(maintenanceSchedule);

  const remove: (typeof maintenanceSchedule.$inferSelect)[] = [];
  const add: { machine: typeof equipment.$inferSelect; date: string }[] = [];
  const perCategory = new Map<string, { label: string; dates: string[]; machines: number; removed: Map<string, number>; added: Map<string, number>; neverPlanned: number; kept: string[] }>();
  let kept = 0;

  for (const m of machines) {
    const cat = cats.find((c) => c.code === m.category);
    if (!cat?.defaultStartDate) continue;
    const wanted = upcomingCategoryDates(cats, cat.code, today);
    const mine = rows.filter((r: typeof maintenanceSchedule.$inferSelect) => r.equipmentId === m.id);
    const pm = mine.filter((r: typeof maintenanceSchedule.$inferSelect) => r.activityType === "PM");
    const stat = perCategory.get(cat.code) ?? { label: cat.label, dates: wanted, machines: 0, removed: new Map(), added: new Map(), neverPlanned: 0, kept: [] as string[] };
    stat.machines++;
    if (pm.length === 0) stat.neverPlanned++;
    const off = pm
      .filter((r) => isReplannable(r, today) && !wanted.includes(r.plannedDate.slice(0, 10)))
      .sort((a, b) => a.plannedDate.localeCompare(b.plannedDate));
    // The catch-up: no category round left this year, and the gap from the
    // machine's last PM to the category's next day is longer than its interval.
    const next = wanted[0];
    const lastDone = pm
      .filter((r) => r.status === "COMPLETED")
      .map((r) => (r.completedDate ?? r.plannedDate).slice(0, 10))
      .sort()
      .pop();
    const interval = (FREQUENCY_MONTHS[(cat.maintenanceFrequency ?? "").toUpperCase()] ?? 3) * 30.5;
    const overdueByThen = !!next && next.slice(0, 4) > today.slice(0, 4) && (!lastDone || dayNumber(next) - dayNumber(lastDone) > interval + 3);
    const keep = overdueByThen && off[0] && off[0].plannedDate < next ? off[0] : null;
    if (keep) {
      stat.kept.push(`${m.name ?? m.assetId} ${keep.plannedDate}`);
      kept++;
    }
    for (const r of off) {
      if (r === keep) continue;
      remove.push(r);
      stat.removed.set(r.plannedDate, (stat.removed.get(r.plannedDate) ?? 0) + 1);
    }
    const have = new Set(mine.map((r: typeof maintenanceSchedule.$inferSelect) => r.plannedDate.slice(0, 10)));
    for (const d of wanted) {
      if (!have.has(d)) {
        add.push({ machine: m, date: d });
        stat.added.set(d, (stat.added.get(d) ?? 0) + 1);
      }
    }
    perCategory.set(cat.code, stat);
  }

  const show = (m: Map<string, number>) => [...m].sort().map(([d, n]) => `${d} x${n}`).join(", ") || "none";
  for (const s of [...perCategory.values()].sort((a, b) => a.label.localeCompare(b.label))) {
    console.log(`\n${s.label} (${s.machines} machines, ${s.neverPlanned} never on the plan)`);
    console.log(`  category days ahead: ${s.dates.join(", ") || "none"}`);
    console.log(`  off-calendar visits removed: ${show(s.removed)}`);
    console.log(`  category visits added:       ${show(s.added)}`);
    if (s.kept.length) console.log(`  catch-up visits kept:        ${s.kept.join("; ")}`);
  }
  console.log(`\nTotal: ${remove.length} off-calendar visits removed, ${add.length} category visits added, ${kept} catch-up visits kept, across ${machines.length} machines.`);

  if (!APPLY) process.exit(0);

  await db.transaction(async (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => {
    for (let i = 0; i < remove.length; i += 200) {
      await tx.delete(maintenanceSchedule).where(inArray(maintenanceSchedule.id, remove.slice(i, i + 200).map((r) => r.id)));
    }
    const values = add.map(({ machine, date }) => {
      const month = Number(date.slice(5, 7));
      return {
        id: nanoid(),
        equipmentId: machine.id,
        year: Number(date.slice(0, 4)),
        quarter: Math.floor((month - 1) / 3) + 1,
        month,
        plannedDate: date,
        activityType: "PM",
        maintenanceFrequency: cats.find((c) => c.code === machine.category)?.maintenanceFrequency ?? machine.maintenanceFrequency ?? null,
        plannedCategory: machine.category,
        status: "SCHEDULED",
      };
    });
    for (let i = 0; i < values.length; i += 200) await tx.insert(maintenanceSchedule).values(values.slice(i, i + 200));
    await tx.insert(auditLog).values({
      id: nanoid(),
      userName: "System",
      action: "UPDATE",
      entityType: "maintenance_schedule",
      entityDescription: `Upcoming PM plan aligned to the category calendars: ${remove.length} untouched future visits that were not on their category's days removed, ${add.length} category visits added, ${kept} catch-up visits kept. Completed, overdue, deferred and started work was not changed.`,
      changes: JSON.stringify({
        removed: remove.map((r) => ({ equipmentId: r.equipmentId, date: r.plannedDate })),
        added: add.map((a) => ({ equipmentId: a.machine.id, date: a.date })),
      }),
    });
  });
  console.log("Done.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
