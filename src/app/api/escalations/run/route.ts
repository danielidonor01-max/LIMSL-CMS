// src/app/api/escalations/run/route.ts
// Runs the overdue-work escalation scan. Two ways in:
//  • a scheduler (cron / Windows Task Scheduler) presenting  Authorization: Bearer <CRON_SECRET>
//  • a signed-in Super Admin (the "Run now" button in App Settings)
// The scan is idempotent and deduped, so repeated calls in a day won't re-nag.
import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/authz";
import { SETTINGS_WRITE_ROLES } from "@/lib/roles";
import { runEscalations } from "@/lib/escalations";

export async function POST(request: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    const authHeader = request.headers.get("authorization") ?? "";
    const viaToken = !!secret && authHeader === `Bearer ${secret}`;

    if (!viaToken) {
      const gate = await requireRoles(SETTINGS_WRITE_ROLES);
      if (gate.res) return gate.res;
    }

    // A cron tick honours the configured send window; a person pressing "Run
    // now" always runs. A button that silently does nothing outside 07:00 is
    // indistinguishable from a broken button.
    const summary = await runEscalations(new Date(), viaToken ? "scheduled" : "manual");
    return NextResponse.json(summary);
  } catch (error) {
    console.error("Escalation run failed:", error);
    return NextResponse.json({ error: "Escalation run failed" }, { status: 500 });
  }
}
