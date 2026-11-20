// src/lib/maintenance/compliance-rule-store.ts
// Reads and saves the PM counting rule. The decisions are in
// ./compliance-rule.ts, which is pure.
import { db } from "@/lib/db";
import { appSettings, auditLog } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { DEFAULT_COMPLIANCE_RULE, normaliseComplianceRule, type ComplianceRule } from "./compliance-rule";

export type StoredRule = { rule: ComplianceRule; setByName: string | null; setAt: string | null };

export async function getStoredComplianceRule(): Promise<StoredRule> {
  try {
    const [row] = await db
      .select({ complianceRule: appSettings.complianceRule })
      .from(appSettings)
      .where(eq(appSettings.id, "singleton"))
      .limit(1);
    if (!row?.complianceRule) return { rule: DEFAULT_COMPLIANCE_RULE, setByName: null, setAt: null };
    const parsed = JSON.parse(row.complianceRule);
    return { rule: normaliseComplianceRule(parsed), setByName: parsed.setByName ?? null, setAt: parsed.setAt ?? null };
  } catch {
    // A rule that cannot be read must not stop compliance being reported.
    return { rule: DEFAULT_COMPLIANCE_RULE, setByName: null, setAt: null };
  }
}

export async function getComplianceRule(): Promise<ComplianceRule> {
  return (await getStoredComplianceRule()).rule;
}

export async function saveComplianceRule(input: unknown, actor: { id?: string | null; name?: string | null }): Promise<StoredRule> {
  const before = await getStoredComplianceRule();
  const rule = normaliseComplianceRule(input);
  const setAt = new Date().toISOString();
  const setByName = actor.name ?? null;
  const value = JSON.stringify({ ...rule, setByName, setAt });
  await db
    .insert(appSettings)
    .values({ id: "singleton", complianceRule: value })
    .onConflictDoUpdate({ target: appSettings.id, set: { complianceRule: value } });
  // The rule decides the compliance figure, so who changed it and from what is on the record.
  await db.insert(auditLog).values({
    id: nanoid(),
    userId: actor.id ?? null,
    userName: actor.name || "System",
    action: "UPDATE",
    entityType: "compliance_rule",
    entityId: "singleton",
    entityDescription: "PM compliance counting rule changed",
    changes: JSON.stringify({ from: before.rule, to: rule }),
  });
  return { rule, setByName, setAt };
}
