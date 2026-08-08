// src/app/api/dashboard/attention/route.ts
// What needs someone today, drawn from the registers that hold it.
//
// Phase 6 added four registers — spares, emergency equipment, contractors,
// condition monitoring — and each computes a "this is not right" figure. None
// of them reached anywhere a person would look. A maintenance manager opening
// the CMS on Monday could not see that two extinguishers were expired and a
// critical spare was out of stock; they had to already suspect it and go
// looking. A register nobody visits is a register nobody acts on.
//
// Each row is a fact plus the place to go and do something about it. Anything
// clean is omitted entirely: a list that always has rows in it stops being read.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  spareParts,
  equipment,
  emergencyEquipment,
  emergencyDrills,
  contractors,
  conditionPoints,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { canAccessPath } from "@/lib/roles";
import { spareRisk } from "@/lib/maintenance/spares";
import { readinessSummary, drillProgrammeStatus } from "@/lib/hse/emergency";
import { summariseRegister } from "@/lib/hse/contractors";
import { programmeHealth } from "@/lib/maintenance/condition";

export type AttentionItem = {
  key: string;
  severity: "danger" | "warning";
  title: string;
  detail: string;
  href: string;
  cta: string;
};

export async function GET() {
  try {
    const session = await auth();
    const role = (session?.user as { role?: string })?.role;

    const [spares, equip, emergency, drills, cons, points] = await Promise.all([
      db.select().from(spareParts),
      db.select({ id: equipment.id, criticality: equipment.criticality, name: equipment.name }).from(equipment),
      db.select().from(emergencyEquipment),
      db.select({ drillDate: emergencyDrills.drillDate, drillType: emergencyDrills.drillType }).from(emergencyDrills),
      db.select().from(contractors),
      db.select({ lastReadingDate: conditionPoints.lastReadingDate, intervalDays: conditionPoints.intervalDays }).from(conditionPoints),
    ]);

    const today = new Date().toISOString().slice(0, 10);
    const items: AttentionItem[] = [];
    const critById = new Map(equip.map((e) => [e.id, e]));

    // ── Spares ───────────────────────────────────────────────────────────────
    const risky = spares
      .map((s) => {
        const machine = s.equipmentId ? critById.get(s.equipmentId) : null;
        return {
          part: s,
          risk: spareRisk({
            quantityOnHand: s.quantityOnHand,
            minimumQuantity: s.minimumQuantity,
            leadTimeDays: s.leadTimeDays,
            onOrder: s.onOrder,
            equipmentCriticality: machine?.criticality,
            equipmentName: machine?.name,
          }),
        };
      })
      .filter((r) => r.risk.atRisk);

    if (risky.length) {
      const exposure = risky.reduce((a, r) => a + r.risk.exposureDays, 0);
      const high = risky.filter((r) => r.risk.severity === "high").length;
      items.push({
        key: "spares",
        severity: high > 0 ? "danger" : "warning",
        title: `${risky.length} spare${risky.length === 1 ? "" : "s"} below minimum`,
        detail:
          exposure > 0
            ? `${exposure} production day(s) already committed if those machines fail today`
            : "Cover on the shelf, but reorder before it runs out",
        href: "/spares",
        cta: "Open spares",
      });
    }

    // ── Emergency equipment ──────────────────────────────────────────────────
    const ready = readinessSummary(emergency, today);
    if (ready.notReady > 0) {
      items.push({
        key: "emergency",
        severity: "danger",
        title: `${ready.notReady} emergency item${ready.notReady === 1 ? "" : "s"} not ready`,
        detail: `Of ${ready.inService} in service — expired, defective, missing or never inspected`,
        href: "/emergency",
        cta: "Open register",
      });
    }

    const prog = drillProgrammeStatus(drills.filter((d) => d.drillType === "FIRE_EVACUATION"), 365, today);
    if (prog.status === "OVERDUE" || prog.status === "NEVER") {
      items.push({
        key: "drill",
        severity: "warning",
        title: prog.status === "NEVER" ? "No evacuation drill on record" : "Evacuation drill overdue",
        detail:
          prog.status === "NEVER"
            ? "ISO 45001 8.2 asks for periodic drills — none has been recorded"
            : `Last held ${prog.lastDrillDate} · ${prog.daysSince} days ago`,
        href: "/emergency",
        cta: "Record a drill",
      });
    }

    // ── Contractors ──────────────────────────────────────────────────────────
    const con = summariseRegister(cons, today);
    if (con.blocked > 0) {
      items.push({
        key: "contractors",
        severity: "warning",
        title: `${con.blocked} contractor${con.blocked === 1 ? "" : "s"} cannot be given a permit`,
        detail: "Insurance or site induction has lapsed, or they are suspended",
        href: "/contractors",
        cta: "Open register",
      });
    } else if (con.expiringSoon > 0) {
      items.push({
        key: "contractors-soon",
        severity: "warning",
        title: `${con.expiringSoon} contractor${con.expiringSoon === 1 ? "" : "s"} expiring within 30 days`,
        detail: "Chase the paperwork before it blocks a job",
        href: "/contractors",
        cta: "Open register",
      });
    }

    // ── Condition monitoring ─────────────────────────────────────────────────
    const health = programmeHealth(points, today);
    if (health.overdue > 0 || health.neverRead > 0) {
      items.push({
        key: "condition",
        severity: "warning",
        title: `${health.overdue + health.neverRead} condition point${health.overdue + health.neverRead === 1 ? "" : "s"} not being read`,
        detail: "Readings taken irregularly cannot show a trend, which is all this catches early",
        href: "/equipment",
        cta: "Open assets",
      });
    }

    // Never point someone at a page their role cannot open.
    const visible = items.filter((i) => canAccessPath(role, i.href));
    const order = { danger: 0, warning: 1 } as const;
    visible.sort((a, b) => order[a.severity] - order[b.severity]);

    return NextResponse.json({ items: visible });
  } catch (error) {
    console.error("Failed to compute attention items:", error);
    // A dashboard panel must never take the dashboard down with it.
    return NextResponse.json({ items: [] });
  }
}
