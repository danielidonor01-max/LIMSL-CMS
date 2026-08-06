// src/app/api/settings/notification-routing/route.ts
// GET the event catalogue + stored overrides; PUT saves the full override map.
import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/db/schema";
import { requireRoles } from "@/lib/authz";
import { SETTINGS_WRITE_ROLES, ROLES } from "@/lib/roles";
import { NOTIFY_EVENTS, getRouting, saveRouting, type RoutingMap } from "@/lib/notifications/routing";

export async function GET() {
  const gate = await requireRoles(SETTINGS_WRITE_ROLES);
  if (gate.res) return gate.res;
  return NextResponse.json({ events: NOTIFY_EVENTS, routing: await getRouting() });
}

export async function PUT(request: Request) {
  const gate = await requireRoles(SETTINGS_WRITE_ROLES);
  if (gate.res) return gate.res;
  try {
    const body = await request.json();
    const known = new Set(NOTIFY_EVENTS.map((e) => e.event));
    const validRoles = new Set(ROLES as readonly string[]);
    const clean: RoutingMap = {};
    for (const [event, r] of Object.entries(body.routing ?? {})) {
      if (!known.has(event) || !r || typeof r !== "object") continue;
      const rec = r as { enabled?: unknown; roles?: unknown };
      clean[event] = {
        enabled: rec.enabled !== false,
        roles: Array.isArray(rec.roles)
          ? rec.roles.filter((x): x is string => typeof x === "string" && validRoles.has(x))
          : null,
      };
    }
    await saveRouting(clean);
    await db.insert(auditLog).values({
      id: nanoid(),
      userId: gate.actor?.id ?? null,
      userName: gate.actor?.name ?? "Admin",
      action: "UPDATE",
      entityType: "settings",
      entityId: "notification-routing",
      entityDescription: `Notification routing updated (${Object.keys(clean).length} overrides)`,
    });
    return NextResponse.json({ ok: true, routing: clean });
  } catch (error) {
    console.error("Failed to save notification routing:", error);
    return NextResponse.json({ error: "Failed to save routing" }, { status: 500 });
  }
}
