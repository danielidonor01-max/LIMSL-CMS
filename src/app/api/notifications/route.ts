// src/app/api/notifications/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { notifications } from "@/lib/db/schema";
import { and, eq, desc, isNull } from "drizzle-orm";
import { auth } from "@/auth";

// GET → the current user's in-app notifications (newest first) + unread count.
export async function GET() {
  try {
    const session = await auth();
    const user = session?.user as { id?: string } | undefined;
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, user.id))
      .orderBy(desc(notifications.createdAt))
      .limit(100);

    const unread = rows.filter((r) => !r.readAt).length;
    return NextResponse.json({ notifications: rows, unread });
  } catch (error: any) {
    console.error("Failed to load notifications:", error);
    return NextResponse.json({ error: "Failed to load notifications", details: error.message }, { status: 500 });
  }
}

// PATCH → mark one ({ id }) or all ({ all: true }) of the current user's
// notifications as read. A user can only ever touch their own rows.
export async function PATCH(request: Request) {
  try {
    const session = await auth();
    const user = session?.user as { id?: string } | undefined;
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const now = new Date().toISOString();

    if (body.all) {
      await db
        .update(notifications)
        .set({ readAt: now })
        .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)));
      return NextResponse.json({ success: true });
    }

    if (body.id) {
      await db
        .update(notifications)
        .set({ readAt: now })
        .where(and(eq(notifications.id, body.id), eq(notifications.userId, user.id)));
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Provide id or all" }, { status: 400 });
  } catch (error: any) {
    console.error("Failed to update notifications:", error);
    return NextResponse.json({ error: "Failed to update notifications", details: error.message }, { status: 500 });
  }
}
