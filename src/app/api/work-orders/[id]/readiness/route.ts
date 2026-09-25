// src/app/api/work-orders/[id]/readiness/route.ts
// Whether work may start on this job today, and every condition behind the
// answer. The same check the clock-on route enforces, so the screen and the
// refusal can never disagree about what is missing.
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { loadReadiness } from "@/lib/maintenance/work-readiness-db";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await params;
    const r = await loadReadiness(id);
    if (!r) return NextResponse.json({ error: "Work order not found" }, { status: 404 });
    return NextResponse.json(r);
  } catch (error) {
    console.error("Failed to read work readiness:", error);
    return NextResponse.json({ error: "Failed to read work readiness" }, { status: 500 });
  }
}
