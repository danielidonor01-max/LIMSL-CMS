// src/app/api/earthing/pits/[id]/route.ts
// Edit a pit, or take it out of use. A pit is never deleted: its tests are the
// record of the site's earthing, and they point at it.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { earthPits, auditLog } from "@/lib/db/schema";
import { and, eq, ne } from "drizzle-orm";
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

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const gate = await requireRoles(MAINTENANCE_WRITE_ROLES);
    if (gate.res) return gate.res;

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const [pit] = await db.select().from(earthPits).where(eq(earthPits.id, id)).limit(1);
    if (!pit) return NextResponse.json({ error: "Earth pit not found" }, { status: 404 });

    const problem = validatePit(body, { partial: true });
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });

    const set: Partial<typeof earthPits.$inferInsert> = {};
    const changes: string[] = [];

    if (body.code !== undefined) {
      const code = normalisePitCode(body.code);
      if (code !== pit.code) {
        const [clash] = await db
          .select({ id: earthPits.id })
          .from(earthPits)
          .where(and(eq(earthPits.code, code), ne(earthPits.id, pit.id)))
          .limit(1);
        if (clash) return NextResponse.json({ error: `There is already a pit coded ${code}.` }, { status: 409 });
        set.code = code;
        changes.push(`code ${pit.code} → ${code}`);
      }
    }
    if (body.name !== undefined) set.name = String(body.name).trim();
    if (body.location !== undefined) set.location = trimOrNull(body.location);
    if (body.description !== undefined) set.description = trimOrNull(body.description);
    if (body.electrodeType !== undefined) {
      set.electrodeType = (ELECTRODE_TYPES as readonly string[]).includes(String(body.electrodeType))
        ? String(body.electrodeType)
        : null;
    }
    // Changing the limit does not re-judge old tests: each one keeps the limit
    // it was judged against. Said in the audit line, because it is the change
    // an auditor will ask about.
    if (body.limitOhms !== undefined) {
      const limit = Number(body.limitOhms);
      if (limit !== pit.limitOhms) {
        set.limitOhms = limit;
        changes.push(`limit ${pit.limitOhms} Ω → ${limit} Ω (earlier tests keep the limit they were judged against)`);
      }
    }
    if (body.active !== undefined) {
      const active = Boolean(body.active);
      if (active !== pit.active) {
        set.active = active;
        changes.push(active ? "put back in use" : "taken out of use");
      }
    }

    if (Object.keys(set).length === 0) return NextResponse.json(pit);

    set.updatedAt = new Date().toISOString();
    await db.update(earthPits).set(set).where(eq(earthPits.id, pit.id));

    await db.insert(auditLog).values({
      id: nanoid(),
      userId: gate.actor?.id ?? null,
      userName: gate.actor?.name ?? "User",
      action: "UPDATE",
      entityType: "earth_pit",
      entityId: pit.id,
      entityDescription: `Earth pit ${set.code ?? pit.code} edited${changes.length ? `: ${changes.join("; ")}` : ""}`,
      changes: JSON.stringify(set),
    });

    const [refreshed] = await db.select().from(earthPits).where(eq(earthPits.id, pit.id)).limit(1);
    return NextResponse.json(refreshed ?? { ...pit, ...set });
  } catch (err) {
    if (isMissingTable(err)) return NextResponse.json({ error: EARTHING_SETUP_MESSAGE }, { status: 503 });
    console.error("Failed to edit earth pit:", err);
    return NextResponse.json({ error: "Failed to edit the earth pit" }, { status: 500 });
  }
}
