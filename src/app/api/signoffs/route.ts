// src/app/api/signoffs/route.ts
import { NextResponse } from "next/server";
import { ensureSignoffChain, getSignoffChain } from "@/lib/signoff/service";

// GET /api/signoffs?entityType=PM_CHECKLIST&entityId=... → the sign-off chain
// (created on first access from the configured chain for that entity type).
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const entityType = url.searchParams.get("entityType");
    const entityId = url.searchParams.get("entityId");
    if (!entityType || !entityId) {
      return NextResponse.json({ error: "entityType and entityId are required" }, { status: 400 });
    }
    await ensureSignoffChain(entityType, entityId);
    const chain = await getSignoffChain(entityType, entityId);
    return NextResponse.json(chain);
  } catch (error) {
    console.error("Failed to load sign-offs:", error);
    return NextResponse.json({ error: "Failed to load sign-offs" }, { status: 500 });
  }
}
