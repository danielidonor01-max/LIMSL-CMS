// src/app/api/contractors/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { contractors, contractorPersonnel, auditLog } from "@/lib/db/schema";
import { nanoid } from "nanoid";
import { requireRoles } from "@/lib/authz";
import { COMPLIANCE_WRITE_ROLES } from "@/lib/roles";
import { assessContractor, assessPerson, summariseRegister } from "@/lib/hse/contractors";

// Eligibility is computed here, not in the browser — the permit route enforces
// the same rule, and two implementations of "may they work" would eventually
// disagree about who is standing on the shop floor.
export async function GET() {
  try {
    const [rows, people] = await Promise.all([
      db.select().from(contractors),
      db.select().from(contractorPersonnel),
    ]);

    const today = new Date().toISOString().slice(0, 10);
    const byContractor = new Map<string, typeof people>();
    for (const p of people) {
      byContractor.set(p.contractorId, [...(byContractor.get(p.contractorId) ?? []), p]);
    }

    const enriched = rows
      .map((c) => ({
        ...c,
        eligibility: assessContractor(c, today),
        personnel: (byContractor.get(c.id) ?? []).map((p) => ({ ...p, eligibility: assessPerson(p, today) })),
      }))
      // Blocked first: the register is read to find out who cannot work today.
      .sort((a, b) => Number(a.eligibility.eligible) - Number(b.eligibility.eligible) || a.companyName.localeCompare(b.companyName));

    return NextResponse.json({ contractors: enriched, summary: summariseRegister(rows, today) });
  } catch (error) {
    console.error("Failed to fetch contractors:", error);
    return NextResponse.json({ error: "Failed to fetch contractors" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const gate = await requireRoles(COMPLIANCE_WRITE_ROLES);
    if (gate.res) return gate.res;

    const body = await request.json();

    if (body.kind === "PERSON") {
      const name = String(body.name ?? "").trim();
      if (!name || !body.contractorId) {
        return NextResponse.json({ error: "A name and a contractor are required." }, { status: 400 });
      }
      const row = {
        id: nanoid(),
        contractorId: String(body.contractorId),
        name,
        jobTitle: body.jobTitle || null,
        inductionDate: body.inductionDate || null,
        inductionValidUntil: body.inductionValidUntil || null,
        competencyNotes: body.competencyNotes || null,
      };
      await db.insert(contractorPersonnel).values(row);
      return NextResponse.json(row, { status: 201 });
    }

    const companyName = String(body.companyName ?? "").trim();
    if (!companyName) {
      return NextResponse.json({ error: "A company name is required." }, { status: 400 });
    }

    const row = {
      id: nanoid(),
      companyName,
      tradeSpecialty: body.tradeSpecialty || null,
      contactPerson: body.contactPerson || null,
      phone: body.phone || null,
      email: body.email || null,
      insuranceProvider: body.insuranceProvider || null,
      insurancePolicyNumber: body.insurancePolicyNumber || null,
      insuranceExpiryDate: body.insuranceExpiryDate || null,
      insuranceCoverAmount: body.insuranceCoverAmount || null,
      inductionDate: body.inductionDate || null,
      inductionValidUntil: body.inductionValidUntil || null,
      inductionByName: body.inductionByName || gate.actor?.name || null,
      status: "ACTIVE",
      notes: body.notes || null,
    };

    await db.insert(contractors).values(row);
    await db.insert(auditLog).values({
      id: nanoid(),
      userId: gate.actor?.id ?? null,
      userName: gate.actor?.name || "System",
      action: "CREATE",
      entityType: "contractor",
      entityId: row.id,
      entityDescription: `${row.companyName} added to the contractor register`,
    });

    return NextResponse.json(row, { status: 201 });
  } catch (error) {
    console.error("Failed to create contractor:", error);
    return NextResponse.json({ error: "Failed to create contractor" }, { status: 500 });
  }
}
