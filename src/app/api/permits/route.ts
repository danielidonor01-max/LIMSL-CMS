// src/app/api/permits/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { permits, equipment, users } from "@/lib/db/schema";
import { count, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireRoles } from "@/lib/authz";
import { PERMIT_WRITE_ROLES } from "@/lib/roles";
import { ensureSignoffChain, getSignoffChain } from "@/lib/signoff/service";
import { chainSummary } from "@/lib/signoff/chains";

// A permit's status is driven by its signatures, never by a button.
//  • PENDING_APPROVAL → ACTIVE once the PTW chain is fully signed (work may begin)
//  • ACTIVE → CLOSED once the close-out chain is fully signed
//  • ACTIVE → EXPIRED once the permit window lapses
// Same reconcile-on-read pattern the Procedure module uses.
export async function reconcilePermits() {
  const all = await db.select().from(permits);
  const now = new Date();

  for (const p of all) {
    if (p.status === "PENDING_APPROVAL") {
      const chain = await getSignoffChain("PERMIT", p.id);
      if (chain.length && chainSummary(chain).complete) {
        await db
          .update(permits)
          .set({ status: "ACTIVE", approvedAt: new Date().toISOString() })
          .where(eq(permits.id, p.id));
        // Authorised — open the close-out chain so the job can be signed off later.
        await ensureSignoffChain("PERMIT_CLOSEOUT", p.id);
      }
      continue;
    }

    if (p.status === "ACTIVE") {
      const closeout = await getSignoffChain("PERMIT_CLOSEOUT", p.id);
      if (closeout.length && chainSummary(closeout).complete) {
        await db
          .update(permits)
          .set({ status: "CLOSED", closedAt: new Date().toISOString() })
          .where(eq(permits.id, p.id));
        continue;
      }
      if (p.expiryDate && new Date(p.expiryDate) < now) {
        await db.update(permits).set({ status: "EXPIRED" }).where(eq(permits.id, p.id));
      }
    }
  }
}

export async function GET() {
  try {
    await reconcilePermits();

    const list = await db.select().from(permits);
    const eqList = await db.select().from(equipment);
    const byId = new Map(eqList.map((e) => [e.id, e]));

    const enriched = await Promise.all(
      list.map(async (r) => {
        const e = byId.get(r.equipmentId);
        const chain = await getSignoffChain("PERMIT", r.id);
        return {
          ...r,
          equipmentName: e?.name ?? null,
          assetId: e?.assetId ?? null,
          approval: chainSummary(chain),
        };
      }),
    );

    return NextResponse.json(enriched);
  } catch (error: any) {
    console.error("Failed to fetch permit list:", error);
    return NextResponse.json({ error: "Failed to fetch permits", details: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const gate = await requireRoles(PERMIT_WRITE_ROLES);
    if (gate.res) return gate.res;

    const body = await request.json();

    if (!body.equipmentId || !body.workDescription) {
      return NextResponse.json(
        { error: "Equipment and work description are required." },
        { status: 400 },
      );
    }

    // A permit must name an accountable holder. "Maintenance Team" is not
    // accountable to an auditor — a person is.
    if (!body.permitHolderId) {
      return NextResponse.json(
        { error: "A permit holder must be assigned before the permit can be raised." },
        { status: 400 },
      );
    }
    const [holder] = await db
      .select()
      .from(users)
      .where(eq(users.id, body.permitHolderId))
      .limit(1);
    if (!holder) {
      return NextResponse.json({ error: "Permit holder not found." }, { status: 400 });
    }

    const countResult = await db.select({ value: count() }).from(permits);
    const totalCount = countResult[0]?.value || 0;
    const permitNumber = `PTW-2026-${(totalCount + 1).toString().padStart(4, "0")}`;

    const validHours = Number(body.validHours) > 0 ? Number(body.validHours) : 24;

    const newPermit = {
      id: nanoid(),
      permitNumber,
      workOrderId: body.workOrderId || null,
      equipmentId: body.equipmentId,
      workDescription: body.workDescription,
      hazardsIdentified: body.hazardsIdentified || "",
      controlMeasures: body.controlMeasures || "",
      lotoApplied: body.lotoApplied || false,
      ppeRequired: body.ppeRequired ? JSON.stringify(body.ppeRequired) : "[]",
      areaBarricaded: body.areaBarricaded || false,
      issuedById: gate.actor?.id ?? null,
      permitHolderId: holder.id,
      permitHolderName: holder.name,
      issuedDate: new Date().toISOString(),
      expiryDate: new Date(Date.now() + validHours * 3600 * 1000).toISOString(),
      // Raised unapproved — work may not begin until the chain is fully signed.
      status: "PENDING_APPROVAL",
    };

    await db.insert(permits).values(newPermit);
    await ensureSignoffChain("PERMIT", newPermit.id);

    return NextResponse.json(newPermit, { status: 201 });
  } catch (error: any) {
    console.error("Failed to create Permit-to-Work:", error);
    return NextResponse.json({ error: "Failed to create Permit-to-Work", details: error.message }, { status: 500 });
  }
}
