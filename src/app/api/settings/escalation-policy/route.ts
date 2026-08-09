// src/app/api/settings/escalation-policy/route.ts
import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/authz";
import { SETTINGS_WRITE_ROLES } from "@/lib/roles";
import { getEscalationPolicy, saveEscalationPolicy } from "@/lib/maintenance/escalation-store";
import { DEFAULT_ESCALATION_POLICY } from "@/lib/maintenance/escalation-policy";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireRoles(SETTINGS_WRITE_ROLES);
  if (gate.res) return gate.res;
  return NextResponse.json({
    policy: await getEscalationPolicy(),
    defaults: DEFAULT_ESCALATION_POLICY,
  });
}

export async function PUT(request: Request) {
  const gate = await requireRoles(SETTINGS_WRITE_ROLES);
  if (gate.res) return gate.res;
  try {
    const body = await request.json();
    // normalisePolicy inside saveEscalationPolicy clamps and sorts, so a
    // hand-crafted request cannot store a policy that notifies nobody or sends
    // continuously.
    const policy = await saveEscalationPolicy(body.policy);
    return NextResponse.json({ ok: true, policy });
  } catch (error) {
    console.error("Failed to save escalation policy:", error);
    return NextResponse.json({ error: "Failed to save the escalation policy." }, { status: 500 });
  }
}
