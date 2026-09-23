// src/lib/db/seed-prune-accounts.ts
// Takes the demo staff back out of the user register.
//
// The seeds used to invent eight people — a Foreman, a QA/QC officer, an HSE
// officer, two technicians, a Factory Manager and a COO — so the screens looked
// populated during the build. They are gone from the seeds now, but they are
// still sitting in every database those seeds have ever run against, holding
// roles that decide who may sign a permit, behind a password committed to this
// repository. This removes them.
//
// Two rules make it safe to run against a live database:
//
//   1. IT ONLY EVER TOUCHES ACCOUNTS IT NAMES. seed-accounts.ts holds a
//      DENY-list of the demo staff, not a keep-list of the real ones. A
//      keep-list would delete every person LIMSL hires after the day it was
//      written, because they are all "everything else".
//
//   2. NOTHING THAT HAS DONE ANYTHING IS DELETED. A user id appears on
//      signatures, audit rows, work orders, permits and schedule assignments.
//      Deleting such a row would either break a foreign key or, worse, orphan a
//      signature — and a signature whose signer no longer exists is not a
//      record, it is a gap where the evidence used to be. Those accounts are
//      DEACTIVATED instead: they can no longer sign in, and everything they
//      signed stays readable and attributable. That is the ISO 9001/45001
//      answer, and it is not negotiable for the sake of a tidier table.
//
// Idempotent. Run it twice and the second run reports nothing to do.
//
//   DATABASE_URL=postgresql://... npx tsx src/lib/db/seed-prune-accounts.ts
//   DATABASE_URL=... npx tsx src/lib/db/seed-prune-accounts.ts --dry-run
import { db } from "./index";
import { users, auditLog, notifications } from "./schema";
import { inArray, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { isPrunable, DEMO_ACCOUNTS } from "./seed-accounts";

type Brief = { id: string; name: string; email: string };

// Every column in the database that points at users.id.
//
// The first version of this listed seven tables by hand — signoffs, work
// orders, corrective, permits, schedule, notifications, audit — copied from the
// endpoint this replaces. It ran, decided six accounts had done nothing, and
// Postgres refused the delete: `competency_matrix` also references users, and
// neither list knew. A hand-written list of foreign keys is a list that is
// already out of date, and the failure mode is the dangerous direction — it
// says "no activity" about somebody who has some.
//
// So it asks the database. Adding a table with a user reference cannot put this
// out of step, because there is nothing here to update.
async function columnsReferencingUsers(): Promise<{ table: string; column: string }[]> {
  const res = await db.execute(sql`
    select con.conrelid::regclass::text as table_name,
           att.attname                  as column_name
      from pg_constraint con
      join pg_attribute att
        on att.attrelid = con.conrelid
       and att.attnum = any(con.conkey)
     where con.contype = 'f'
       and con.confrelid = 'users'::regclass
  `);
  const rows = (Array.isArray(res) ? res : (res as { rows?: unknown[] }).rows ?? []) as {
    table_name: string;
    column_name: string;
  }[];
  return rows.map((r) => ({ table: r.table_name, column: r.column_name }));
}

export async function pruneSeedAccounts({ dryRun = false }: { dryRun?: boolean } = {}) {
  const all = await db.select().from(users);
  const doomed = all.filter((u) => isPrunable(u.email)).map((u) => u.id);

  // A notification is not evidence.
  //
  // In production, six of the eight demo accounts were pinned in place by
  // nothing but unread in-app messages — "PM due", "permit expiring" — sent to
  // people who cannot sign in to read them. Treating those the same as a
  // signature is what left the register full of disabled ghosts: the rule said
  // "has activity, keep for the audit trail", and the activity was a stale
  // toast.
  //
  // So they are cleared first, and only then is the question asked. Nothing an
  // auditor would look for lives here; the work orders, permits, signatures and
  // audit rows are all still checked below and still protect their owners.
  if (doomed.length && !dryRun) {
    await db.delete(notifications).where(inArray(notifications.userId, doomed));
  }

  const refs = await columnsReferencingUsers();
  const referenced = new Set<string>();
  for (const { table, column } of refs) {
    // Modelled, not skipped: a dry run that counted notifications would preview
    // a different outcome from the run it is previewing.
    if (table === "notifications") continue;
    const res = await db.execute(
      sql`select distinct ${sql.identifier(column)} as id from ${sql.identifier(table)} where ${sql.identifier(column)} is not null`,
    );
    const rows = (Array.isArray(res) ? res : (res as { rows?: unknown[] }).rows ?? []) as { id: string }[];
    for (const r of rows) if (r.id) referenced.add(r.id);
  }
  console.log(`Checked ${refs.length} column(s) referencing users.id across the schema.`);

  const untouched: Brief[] = [];
  const toDelete: Brief[] = [];
  const toDeactivate: Brief[] = [];
  // Targets that cannot go: they hold a work order, a permit or a schedule
  // assignment, and they are already switched off. Reported rather than passed
  // over in silence, because "done" and "refused" must not look the same.
  const heldByRecords: Brief[] = [];

  for (const u of all) {
    const brief = { id: u.id, name: u.name, email: u.email };
    if (!isPrunable(u.email)) {
      untouched.push(brief);
      continue;
    }
    if (referenced.has(u.id)) {
      // Already switched off, and pinned in place by something real. Nothing
      // more can be done to it without destroying the record that pins it.
      if (u.isActive === false) {
        heldByRecords.push(brief);
        continue;
      }
      toDeactivate.push(brief);
      continue;
    }
    // Deliberately NOT skipped when already inactive. Production had the demo
    // staff switched off but still sitting in the register, which is the state
    // this exists to clear: "disabled" is a person who might come back, and
    // these are not people. If they have no activity, they go.
    toDelete.push(brief);
  }

  console.log(`\nNot touched, ${untouched.length} account(s) this never targets:`);
  untouched.forEach((u) => console.log(`   • ${u.name} <${u.email}>`));
  console.log(`\nDeleting ${toDelete.length} demo account(s) with no records attached:`);
  toDelete.forEach((u) => console.log(`   • ${u.name} <${u.email}>`));
  console.log(`\nDeactivating ${toDeactivate.length} demo account(s) that have signed or raised something:`);
  toDeactivate.forEach((u) => console.log(`   • ${u.name} <${u.email}>`));
  if (heldByRecords.length) {
    console.log(
      `\nLeft disabled, ${heldByRecords.length} demo account(s) that CANNOT be deleted — a work order,` +
        ` permit or schedule assignment still names them, and removing the account would orphan it:`,
    );
    heldByRecords.forEach((u) => console.log(`   • ${u.name} <${u.email}>`));
  }

  if (dryRun) {
    console.log("\n--dry-run: nothing was written.\n");
    return { untouched, heldByRecords, deleted: 0, deactivated: 0 };
  }

  if (toDelete.length) {
    await db.delete(users).where(inArray(users.id, toDelete.map((u) => u.id)));
  }
  if (toDeactivate.length) {
    await db
      .update(users)
      .set({ isActive: false })
      .where(inArray(users.id, toDeactivate.map((u) => u.id)));
  }

  if (toDelete.length || toDeactivate.length) {
    await db.insert(auditLog).values({
      id: nanoid(),
      userId: null,
      userName: "System",
      action: "DELETE",
      entityType: "user",
      entityId: "seed-accounts",
      entityDescription:
        `Demo accounts pruned: ${toDelete.length} deleted, ${toDeactivate.length} deactivated ` +
        `(they have activity, so their records stay attributable). ` +
        `${heldByRecords.length} left disabled because a record still names them.`,
    });
  }

  console.log(
    `\n✅ Done. ${toDelete.length} deleted, ${toDeactivate.length} deactivated, ` +
      `${heldByRecords.length} left disabled, ${untouched.length} untouched.\n`,
  );
  return { untouched, heldByRecords, deleted: toDelete.length, deactivated: toDeactivate.length };
}

// Says so plainly when there is nothing here it targets, rather than reporting
// "0 removed" against the wrong DATABASE_URL and being believed.
async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const all = await db.select({ email: users.email }).from(users);
  const targets = all.filter((u) => isPrunable(u.email)).length;
  if (targets === 0) {
    console.log(
      `\nNothing to do: none of the ${DEMO_ACCOUNTS.length} demo accounts are in this database ` +
        `(${all.length} users found). If that is a surprise, check DATABASE_URL.\n`,
    );
    process.exit(0);
  }
  await pruneSeedAccounts({ dryRun });
}

if (process.argv[1]?.includes("seed-prune-accounts")) {
  main()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error("❌ Prune failed:", e);
      process.exit(1);
    });
}
