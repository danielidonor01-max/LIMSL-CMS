// src/app/api/earthing/pits/route.ts
// The earth pits of the LIMSL site. Each one is tested on its own and judged
// against its own limit, so the pit is the unit the module is built around.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { earthPits, auditLog } from "@/lib/db/schema";
import { asc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireRoles } from "@/lib/authz";
import { MAINTENANCE_WRITE_ROLES } from "@/lib/roles";
import { isMissingTable } from "@/lib/db/missing-table";
import {
  EARTHING_SETUP_MESSAGE,
  ELECTRODE_TYPES,
  normalisePitCode,
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

    const code = normalisePitCode(body.code);
    const [clash] = await db.select({ id: earthPits.id }).from(earthPits).where(eq(earthPits.code, code)).limit(1);
    if (clash) return NextResponse.json({ error: `There is already a pit coded ${code}.` }, { status: 409 });

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
    await db.insert(earthPits).values(row);

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
