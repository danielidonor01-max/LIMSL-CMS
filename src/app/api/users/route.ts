// src/app/api/users/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  try {
    const list = await db.select().from(users).where(eq(users.isActive, true));
    return NextResponse.json(list);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to fetch users:", error);
    return NextResponse.json(
      { error: "Failed to fetch users", details: message },
      { status: 500 },
    );
  }
}
