// src/lib/db/prune-to-core-users.ts
// Reducing the register to the people who actually use it.
//
// This keeps an explicit list and removes everyone else, which is the opposite
// shape from seed-prune-accounts.ts (a deny-list of known demo addresses). A
// keep-list is the more dangerous shape, because everything it fails to
// recognise is deleted, so the rails below are not optional:
//
//   1. It refuses to run unless an enabled Super Admin survives. A keep-list
//      with a typo in it otherwise deletes every account including the one you
//      would sign in with to undo it.
//   2. It never deletes a sign-off. A signature is the evidence that a permit,
//      a method statement or a PM was authorised, and it stays readable after
//      the signer leaves. That is the entire point of an audit trail.
//   3. It never reassigns somebody's records to somebody else. A work order
//      performed by a technician who has left was still performed by them, and
//      rewriting the name to whoever is convenient is falsifying the record.
//   4. An account that anything still references is DEACTIVATED, not deleted.
//      Deleting it would orphan the record that names it.
//
//   DATABASE_URL=... npx tsx src/lib/db/prune-to-core-users.ts --dry-run
//   DATABASE_URL=... npx tsx src/lib/db/prune-to-core-users.ts
import { db } from "@/lib/db";
import { users, notifications, auditLog } from "@/lib/db/schema";
import { sql, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";

// The people who stay. Everything not on this list goes, so it is checked
// against the register before anything is written.
export const KEEP_EMAILS = [
  "daniel.idonor@limsl.com",
  "danielidonor01@gmail.com",
  "marcaslive@gmail.com",
  "ajayioluwadamilola527@gmail.com",
].map((e) => e.toLowerCase());

const norm = (e: string | null | undefined) => (e ?? "").trim().toLowerCase();

// Asked of the database rather than written down here, because a hand-written
// list of foreign keys is a list that is already out of date, and the failure
// direction is the dangerous one: it would report "no activity" about somebody
// who has some, and then delete them.
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
  const rows = (Array.isArray(res) ? res : ((res as { rows?: unknown[] }).rows ?? [])) as {
    table_name: string;
    column_name: string;
  }[];
  return rows.map((r) => ({ table: r.table_name, column: r.column_name }));
}

type Brief = { id: string; name: string; email: string; role: string };

export async function pruneToCoreUsers({ dryRun = false }: { dryRun?: boolean } = {}) {
  const all = await db.select().from(users);
  const keep = all.filter((u) => KEEP_EMAILS.includes(norm(u.email)));
  const targets = all.filter((u) => !KEEP_EMAILS.includes(norm(u.email)));

  console.log(`\nKeeping ${keep.length} account(s):`);
  keep.forEach((u) => console.log(`   • ${u.name} <${u.email}> (${u.role})`));

  // Rail 1. Anything on the keep-list that is not in the register is almost
  // certainly a typo, and a typo here deletes a real person.
  const missing = KEEP_EMAILS.filter((e) => !all.some((u) => norm(u.email) === e));
  if (missing.length) {
    console.log(`\nWARNING, ${missing.length} address on the keep-list is not in this database:`);
    missing.forEach((e) => console.log(`   ? ${e}`));
    console.log(`   Check it before running for real — anyone it was meant to protect is in the list below.`);
  }

  const survivingAdmin = keep.find((u) => u.role === "SUPER_ADMIN" && u.isActive !== false);
  if (!survivingAdmin) {
    console.error(
      `\nREFUSING TO RUN: no enabled Super Admin is on the keep-list for this database.` +
        `\nRunning would remove every account that can administer the system, and there would be` +
        `\nno way back in. Fix the keep-list, or enable the Super Admin first.\n`,
    );
    return { refused: true as const };
  }

  if (targets.length === 0) {
    console.log(`\nNothing to remove.\n`);
    return { deleted: 0, deactivated: 0, heldByRecords: [] as Brief[] };
  }

  const doomed = targets.map((u) => u.id);

  // A notification is not evidence. An unread "PM due" sent to somebody who can
  // no longer sign in should not be what keeps their account on the register.
  // Cleared first, then the real question is asked. Skipped on a dry run so the
  // preview matches the run it previews.
  if (!dryRun) {
    await db.delete(notifications).where(inArray(notifications.userId, doomed));
  }

  const refs = await columnsReferencingUsers();
  const referenced = new Set<string>();
  for (const { table, column } of refs) {
    if (table === "notifications") continue;
    const res = await db.execute(
      sql`select distinct ${sql.identifier(column)} as id from ${sql.identifier(table)} where ${sql.identifier(column)} is not null`,
    );
    const rows = (Array.isArray(res) ? res : ((res as { rows?: unknown[] }).rows ?? [])) as { id: string }[];
    for (const r of rows) if (r.id) referenced.add(r.id);
  }
  console.log(`\nChecked ${refs.length} column(s) referencing users.id across the schema.`);

  const brief = (u: (typeof all)[number]): Brief => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
  });

  // Rails 2, 3 and 4 are all this one decision: anything a record points at is
  // switched off rather than removed, and the record is left exactly as it is.
  const toDelete = targets.filter((u) => !referenced.has(u.id)).map(brief);
  const toDeactivate = targets.filter((u) => referenced.has(u.id) && u.isActive !== false).map(brief);
  const heldByRecords = targets.filter((u) => referenced.has(u.id) && u.isActive === false).map(brief);

  console.log(`\nDeleting ${toDelete.length} account(s) that nothing references:`);
  toDelete.forEach((u) => console.log(`   • ${u.name} <${u.email}> (${u.role})`));
  console.log(`\nDeactivating ${toDeactivate.length} account(s) that signed or raised something:`);
  toDeactivate.forEach((u) => console.log(`   • ${u.name} <${u.email}> (${u.role})`));
  if (heldByRecords.length) {
    console.log(
      `\nLeft disabled, ${heldByRecords.length} account(s) that CANNOT be deleted — a work order,` +
        ` signature or permit still names them:`,
    );
    heldByRecords.forEach((u) => console.log(`   • ${u.name} <${u.email}>`));
  }

  if (dryRun) {
    console.log(`\n--dry-run: nothing was written.\n`);
    return { deleted: 0, deactivated: 0, heldByRecords };
  }

  if (toDeactivate.length) {
    await db
      .update(users)
      .set({ isActive: false })
      .where(inArray(users.id, toDeactivate.map((u) => u.id)));
  }
  if (toDelete.length) {
    await db.delete(users).where(inArray(users.id, toDelete.map((u) => u.id)));
  }

  await db.insert(auditLog).values({
    id: nanoid(),
    userId: null,
    userName: "System",
    action: "DELETE",
    entityType: "user",
    entityId: null,
    entityDescription:
      `Register reduced to core users: deleted ${toDelete.length} account(s) with no records, ` +
      `deactivated ${toDeactivate.length} that had. Kept ${keep.map((u) => u.email).join(", ")}. ` +
      `No signature or record was altered.`,
  });

  const remaining = await db.select({ n: users.name, e: users.email, a: users.isActive }).from(users);
  console.log(`\nRemaining accounts (${remaining.length}):`);
  remaining.forEach((u) => console.log(`   ${u.a === false ? "off" : "on "}  ${u.n} <${u.e}>`));
  console.log("");

  return { deleted: toDelete.length, deactivated: toDeactivate.length, heldByRecords };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Refusing to guess which database to change.");
    process.exit(1);
  }
  await pruneToCoreUsers({ dryRun });
}

if (process.argv[1]?.includes("prune-to-core-users")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
