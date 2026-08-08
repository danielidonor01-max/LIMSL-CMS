// src/app/api/notifications/audit-recipients/route.ts
// Which of our own people will actually receive what we send them.
//
// Deliverability is a property of the (sender, recipient-domain) pair, not of
// the app — so with a consumer-domain sender, an entire staff domain can be
// silently quarantined while the CMS reports every message as sent. This
// answers "who is affected" once, up front, instead of one confused support
// conversation at a time.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireRoles } from "@/lib/authz";
import { SETTINGS_WRITE_ROLES } from "@/lib/roles";
import { config } from "@/lib/config";
import { diagnoseRecipient, domainOf } from "@/lib/notifications/deliverability";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireRoles(SETTINGS_WRITE_ROLES);
  if (gate.res) return gate.res;

  const staff = await db
    .select({ name: users.name, email: users.email })
    .from(users)
    .where(eq(users.isActive, true));

  // One DNS lookup per distinct domain, not per person.
  const byDomain = new Map<string, string[]>();
  let withoutEmail = 0;
  for (const u of staff) {
    const domain = domainOf(u.email ?? "");
    if (!domain) {
      withoutEmail++;
      continue;
    }
    byDomain.set(domain, [...(byDomain.get(domain) ?? []), u.name]);
  }

  const domains = await Promise.all(
    [...byDomain.entries()].map(async ([domain, people]) => {
      const d = await diagnoseRecipient(`someone@${domain}`, config.smtpUser);
      return {
        domain,
        people: people.sort(),
        userCount: people.length,
        severity: d.severity,
        hostLabel: d.hostLabel,
        headline: d.headline,
        actions: d.actions,
      };
    }),
  );

  const order: Record<string, number> = { fail: 0, warn: 1, ok: 2 };
  domains.sort((a, b) => (order[a.severity] ?? 3) - (order[b.severity] ?? 3) || b.userCount - a.userCount);

  return NextResponse.json({
    sender: config.smtpUser || null,
    senderDomain: domainOf(config.smtpUser),
    domains,
    withoutEmail,
    atRiskUsers: domains.filter((d) => d.severity !== "ok").reduce((a, d) => a + d.userCount, 0),
    totalUsers: staff.length,
  });
}
