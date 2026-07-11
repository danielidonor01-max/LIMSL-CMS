// src/app/api/audit/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/db/schema";
import { desc } from "drizzle-orm";

export async function GET() {
  try {
    const list = await db.select().from(auditLog).orderBy(desc(auditLog.timestamp)).limit(100);
    return NextResponse.json(list);
  } catch (error: any) {
    console.error("Failed to fetch audit log:", error);
    return NextResponse.json({ error: "Failed to fetch audit logs", details: error.message }, { status: 500 });
  }
}
