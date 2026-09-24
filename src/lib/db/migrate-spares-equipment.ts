// src/lib/db/migrate-spares-equipment.ts
import { db } from "./index";
import { sql } from "drizzle-orm";

async function main() {
  console.log("Applying spare_part_equipment migration...");
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS spare_part_equipment (
      id text PRIMARY KEY,
      spare_part_id text NOT NULL REFERENCES spare_parts(id) ON DELETE CASCADE,
      equipment_id text NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
      notes text,
      created_at text NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS spare_part_equipment_spare_idx ON spare_part_equipment (spare_part_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS spare_part_equipment_equipment_idx ON spare_part_equipment (equipment_id)`);
  console.log("spare_part_equipment table created/verified.");

  await db.execute(sql`
    INSERT INTO spare_part_equipment (id, spare_part_id, equipment_id)
    SELECT 'spe-' || id, id, equipment_id
    FROM spare_parts
    WHERE equipment_id IS NOT NULL
    ON CONFLICT (id) DO NOTHING
  `);
  console.log("Backfilled existing equipment links into spare_part_equipment.");
}

main().then(() => process.exit(0)).catch((e) => {
  console.error("Migration failed:", e);
  process.exit(1);
});
