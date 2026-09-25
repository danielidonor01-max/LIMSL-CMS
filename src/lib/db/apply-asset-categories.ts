// src/lib/db/apply-asset-categories.ts
// Moving the maintenance interval from the machine onto its category.
//
// Three steps, in this order:
//
//   1. Create the two tables (additive, idempotent).
//   2. Seed a row for every category in use. Its interval is the one most of
//      its machines ALREADY have, so the change adopts the register's own
//      majority rather than imposing one; a category nothing is in yet falls
//      back to quarterly and can be changed through Settings.
//   3. Bring the minority into line: a machine whose interval differs from its
//      category's takes the category's, and its future plan is rebuilt. Those
//      machines are listed first, so the dry run says exactly who moves.
//
//   DATABASE_URL=... npx tsx src/lib/db/apply-asset-categories.ts --dry-run
//   DATABASE_URL=... npx tsx src/lib/db/apply-asset-categories.ts
import { db } from "@/lib/db";
import { assetCategories, equipment, auditLog } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { EQUIPMENT_CATEGORY_LABELS } from "@/lib/constants";
import { FREQUENCY_MONTHS } from "@/lib/maintenance/plan-generation";
import { replanMachine } from "@/lib/maintenance/asset-categories";

const DDL = [
  `CREATE TABLE IF NOT EXISTS asset_categories (
     code                  text PRIMARY KEY,
     label                 text NOT NULL,
     maintenance_frequency text NOT NULL,
     is_active             boolean NOT NULL DEFAULT true,
     created_at            text NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
     updated_at            text NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
   )`,
  `CREATE TABLE IF NOT EXISTS asset_category_changes (
     id                  text PRIMARY KEY,
     change_number       text NOT NULL UNIQUE,
     kind                text NOT NULL,
     category_code       text NOT NULL,
     proposed_label      text NOT NULL,
     proposed_frequency  text NOT NULL,
     previous_label      text,
     previous_frequency  text,
     reason              text NOT NULL,
     status              text NOT NULL DEFAULT 'PENDING_APPROVAL',
     proposed_by_id      text REFERENCES users(id),
     proposed_by_name    text,
     applied_at          text,
     machines_affected   integer,
     plan_rows_replaced  integer,
     created_at          text NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
   )`,
  `CREATE INDEX IF NOT EXISTS asset_category_changes_code_idx ON asset_category_changes (category_code)`,
];

const pretty = (code: string) =>
  code
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

/** The interval most machines in a category already use; ties go to the more frequent. */
function majority(freqs: (string | null)[]): string {
  const counts = new Map<string, number>();
  for (const f of freqs) {
    const k = String(f ?? "").toUpperCase();
    if (FREQUENCY_MONTHS[k]) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  if (counts.size === 0) return "QUARTERLY";
  return [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || FREQUENCY_MONTHS[a[0]] - FREQUENCY_MONTHS[b[0]],
  )[0][0];
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Refusing to guess which database to change.");
    process.exit(1);
  }

  console.log(`\n1. Tables${dryRun ? " (dry run: would create if missing)" : ""}`);
  if (!dryRun) {
    for (const s of DDL) await db.execute(sql.raw(s));
    console.log("   ok");
  }

  const machines = await db.select().from(equipment);
  let existing: (typeof assetCategories.$inferSelect)[] = [];
  try {
    existing = await db.select().from(assetCategories);
  } catch {
    existing = [];
  }
  const have = new Map(existing.map((c) => [c.code, c]));

  const codes = new Set<string>([...Object.keys(EQUIPMENT_CATEGORY_LABELS), ...machines.map((m) => m.category)]);

  console.log(`\n2. Categories`);
  const plan: { code: string; label: string; frequency: string; isNew: boolean }[] = [];
  for (const code of [...codes].filter(Boolean).sort()) {
    const current = have.get(code);
    const inCat = machines.filter((m) => m.category === code);
    const frequency = current?.maintenanceFrequency ?? majority(inCat.map((m) => m.maintenanceFrequency));
    const label = current?.label ?? EQUIPMENT_CATEGORY_LABELS[code] ?? pretty(code);
    plan.push({ code, label, frequency, isNew: !current });
    console.log(
      `   ${current ? "keep" : "add "}  ${label.padEnd(26)} ${frequency.padEnd(12)} ${String(inCat.length).padStart(3)} machine(s)`,
    );
  }

  const byCode = new Map(plan.map((p) => [p.code, p]));
  const movers = machines.filter(
    (m) =>
      m.status !== "DECOMMISSIONED" &&
      byCode.get(m.category) &&
      String(m.maintenanceFrequency ?? "").toUpperCase() !== byCode.get(m.category)!.frequency,
  );

  console.log(`\n3. Machines whose interval differs from their category's (${movers.length})`);
  for (const m of movers) {
    console.log(
      `   ${m.assetId.padEnd(14)} ${m.name.slice(0, 32).padEnd(32)} ` +
        `${String(m.maintenanceFrequency ?? "none").padEnd(12)} -> ${byCode.get(m.category)!.frequency}`,
    );
  }

  if (dryRun) {
    console.log(`\n--dry-run: nothing was written.\n`);
    process.exit(0);
  }

  for (const p of plan.filter((p) => p.isNew)) {
    await db.insert(assetCategories).values({ code: p.code, label: p.label, maintenanceFrequency: p.frequency });
  }

  let replaced = 0;
  for (const m of movers) {
    const frequency = byCode.get(m.category)!.frequency;
    await db.update(equipment).set({ maintenanceFrequency: frequency }).where(eq(equipment.id, m.id));
    const r = await replanMachine({ ...m, maintenanceFrequency: frequency });
    replaced += r.removed;
  }

  await db.insert(auditLog).values({
    id: nanoid(),
    userId: null,
    userName: "System",
    action: "UPDATE",
    entityType: "asset_category",
    entityId: null,
    entityDescription:
      `Maintenance interval moved onto asset categories: ${plan.filter((p) => p.isNew).length} categor(ies) ` +
      `seeded from the register's majority interval, ${movers.length} machine(s) aligned to their ` +
      `category, ${replaced} future plan row(s) replaced.`,
  });

  console.log(`\nDone. ${movers.length} machine(s) aligned, ${replaced} future plan row(s) replaced.\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
