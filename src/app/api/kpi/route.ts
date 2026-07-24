// src/app/api/kpi/route.ts
// KPIs are computed live from real operational data — see src/lib/kpi/compute.ts.
import { NextResponse } from "next/server";
import { computeKpis } from "@/lib/kpi/compute";

export async function GET() {
  try {
    const data = await computeKpis();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Failed to compute KPIs:", error);
    return NextResponse.json({ error: "Failed to compute KPIs" }, { status: 500 });
  }
}
