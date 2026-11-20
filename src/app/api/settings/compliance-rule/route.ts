// src/app/api/settings/compliance-rule/route.ts
// The PM counting rule. Anyone signed in may read it, because the schedule and
// its Log show how the figure is counted. Only the Super Admin changes it.
import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/authz";
import { SETTINGS_WRITE_ROLES } from "@/lib/roles";
import { DEFAULT_COMPLIANCE_RULE, validateComplianceRule } from "@/lib/maintenance/compliance-rule";
import { getStoredComplianceRule, saveComplianceRule } from "@/lib/maintenance/compliance-rule-store";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ...(await getStoredComplianceRule()), defaults: DEFAULT_COMPLIANCE_RULE });
}

export async function PUT(request: Request) {
  const gate = await requireRoles(SETTINGS_WRITE_ROLES);
  if (gate.res) return gate.res;
  try {
    const body = await request.json();
    const problem = validateComplianceRule(body.rule);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    const saved = await saveComplianceRule(body.rule, { id: gate.actor?.id, name: gate.actor?.name });
    return NextResponse.json({ ok: true, ...saved, defaults: DEFAULT_COMPLIANCE_RULE });
  } catch (error) {
    console.error("Failed to save the compliance rule:", error);
    return NextResponse.json({ error: "Failed to save the counting rule." }, { status: 500 });
  }
}
