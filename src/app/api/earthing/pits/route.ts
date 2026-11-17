// src/app/api/earthing/pits/route.ts
// The earth pits of the LIMSL site. Each one is tested on its own and judged
// against its own limit, so the pit is the unit the module is built around.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { earthPits, auditLog } from "@/lib/db/schema";
import { asc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireRoles } from "@/lib/authz";
import { MAINTENANCE_WRITE_ROLES } from "@/lib/roles";
import { isMissingTable } from "@/lib/db/missing-table";
import {
  EARTHING_SETUP_MESSAGE,
  ELECTRODE_TYPES,
  nextPitCode,
  validatePit,
} from "@/lib/earthing/earthing";

const trimOrNull = (v: unknown): string | null => {
  const s = String(v ?? "").trim();
  return s ? s : null;
};

export async function GET() {
  try {
    const pits = await db.select().from(earthPits).orderBy(asc(earthPits.code));
    return NextResponse.json({ pits, setupRequired: false });
  } catch (err) {
    if (isMissingTable(err)) {
      return NextResponse.json({ pits: [], setupRequired: true, error: EARTHING_SETUP_MESSAGE });
    }
    console.error("Failed to load earth pits:", err);
    return NextResponse.json({ error: "Failed to load earth pits" }, { status: 500 });
  }
}

// Adding a pit is part of looking after the site's installation, which is
// maintenance work, so it follows MAINTENANCE_WRITE_ROLES like the tests do.
export async function POST(request: Request) {
  try {
    const gate = await requireRoles(MAINTENANCE_WRITE_ROLES);
    if (gate.res) return gate.res;

    const body = await request.json().catch(() => ({}));
    const problem = validatePit(body);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });

    // The number is generated (EP-01, EP-02, …); anything typed is ignored.
    const used = await db.select({ code: earthPits.code }).from(earthPits);
    const code = nextPitCode(used.map((p) => p.code));

    const now = new Date().toISOString();
    const row = {
      id: nanoid(),
      code,
      name: String(body.name).trim(),
      location: trimOrNull(body.location),
      description: trimOrNull(body.description),
      electrodeType: (ELECTRODE_TYPES as readonly string[]).includes(String(body.electrodeType))
        ? String(body.electrodeType)
        : null,
      limitOhms: Number(body.limitOhms),
      active: true,
      createdById: gate.actor?.id ?? null,
      createdByName: gate.actor?.name ?? null,
      createdAt: now,
      updatedAt: now,
    };
    // Two pits added at the same moment draw the same number; the unique
    // index refuses the second, which then takes the next one.
    try {
      await db.insert(earthPits).values(row);
    } catch {
      const again = await db.select({ code: earthPits.code }).from(earthPits);
      row.code = nextPitCode(again.map((p) => p.code));
      await db.insert(earthPits).values(row);
    }

    await db.insert(auditLog).values({
      id: nanoid(),
      userId: gate.actor?.id ?? null,
      userName: gate.actor?.name ?? "User",
      action: "CREATE",
      entityType: "earth_pit",
      entityId: row.id,
      entityDescription: `Earth pit ${row.code} ${row.name} added (limit ${row.limitOhms} Ω)`,
    });

    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    if (isMissingTable(err)) return NextResponse.json({ error: EARTHING_SETUP_MESSAGE }, { status: 503 });
    console.error("Failed to add earth pit:", err);
    return NextResponse.json({ error: "Failed to add the earth pit" }, { status: 500 });
  }
}
