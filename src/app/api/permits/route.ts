// src/app/api/permits/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { permits, equipment, users, wmsDocuments, isolationPoints, contractors } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireRoles } from "@/lib/authz";
import { PERMIT_ISSUE_ROLES } from "@/lib/roles";
import { nextDocNumber } from "@/lib/doc-number";
import { ensureSignoffChain, getSignoffChain } from "@/lib/signoff/service";
import { chainSummary } from "@/lib/signoff/chains";
import { assessContractor, blockReason } from "@/lib/hse/contractors";

// A Permit-to-Work is valid for one working day. It must be re-raised the next
// day, never renewed — this is fixed policy, not a per-permit setting.
export const PERMIT_VALIDITY_HOURS = 24;

// A permit's status is driven by its signatures, never by a button.
//  • PENDING_APPROVAL → ACTIVE once the PTW chain is fully signed (work may begin)
//  • ACTIVE → CLOSED once the close-out chain is fully signed
//  • PENDING_APPROVAL/ACTIVE → EXPIRED once the 24h window lapses (must be reissued)
// Same reconcile-on-read pattern the Procedure module uses.
export async function reconcilePermits() {
  const all = await db.select().from(permits);
  const now = new Date();

  for (const p of all) {
    const lapsed = !!p.expiryDate && new Date(p.expiryDate) < now;

    if (p.status === "PENDING_APPROVAL") {
      const chain = await getSignoffChain("PERMIT", p.id);
      if (chain.length && chainSummary(chain).complete) {
        await db
          .update(permits)
          .set({ status: "ACTIVE", approvedAt: new Date().toISOString() })
          .where(eq(permits.id, p.id));
        // Authorised — open the close-out chain so the job can be signed off later.
        await ensureSignoffChain("PERMIT_CLOSEOUT", p.id);
      } else if (lapsed) {
        // A permit not fully signed within its day lapses — it cannot be
        // approved the next day; a fresh permit must be raised.
        await db.update(permits).set({ status: "EXPIRED" }).where(eq(permits.id, p.id));
      }
      continue;
    }

    // A permit that WAS authorised (approvedAt set) put real isolation on real
    // machinery. If it then lapses, that isolation still exists in the field and
    // someone still has to sign "isolation removed, safe to re-energise" — so an
    // EXPIRED permit must remain closable. Previously only ACTIVE permits were
    // checked, which left the HSE de-isolation step permanently unsignable and
    // equipment isolated with no record of who removed the locks.
    if (p.status === "ACTIVE" || (p.status === "EXPIRED" && p.approvedAt)) {
      const closeout = await getSignoffChain("PERMIT_CLOSEOUT", p.id);
      if (closeout.length && chainSummary(closeout).complete) {
        await db
          .update(permits)
          // CLOSED_LATE is honest: the work was closed out, but after the
          // permit's validity window — an auditable distinction.
          .set({
            status: p.status === "EXPIRED" ? "CLOSED_LATE" : "CLOSED",
            closedAt: new Date().toISOString(),
          })
          .where(eq(permits.id, p.id));
        continue;
      }
      if (lapsed && p.status === "ACTIVE") {
        await db.update(permits).set({ status: "EXPIRED" }).where(eq(permits.id, p.id));
        // Keep the close-out chain available on the now-expired permit.
        await ensureSignoffChain("PERMIT_CLOSEOUT", p.id);
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
    return NextResponse.json({ error: "Failed to fetch permits" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    // HSE is the issuing authority — only HSE (or Super Admin) may raise a permit.
    const gate = await requireRoles(PERMIT_ISSUE_ROLES);
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

    // ISO 45001 8.1.4.2. Where the work is being done by an outside company, the
    // gate is here or it is nowhere: a contractor register that never stops
    // anybody working is a spreadsheet. Insurance and induction both lapse
    // silently — nobody is emailed by their insurer's expiry date — so the check
    // has to happen at the moment a permit is raised.
    if (body.contractorId) {
      const [contractor] = await db
        .select()
        .from(contractors)
        .where(eq(contractors.id, body.contractorId))
        .limit(1);
      if (!contractor) {
        return NextResponse.json({ error: "Contractor not found on the register." }, { status: 400 });
      }
      const eligibility = assessContractor(contractor);
      if (!eligibility.eligible) {
        return NextResponse.json(
          { error: blockReason(contractor.companyName, eligibility), reasons: eligibility.reasons },
          { status: 409 },
        );
      }
    }

    // ISO 45001 6.1.2: a permit with no hazards and no controls is a signature
    // ritual. The JHA was optional, so a permit could be raised, fully signed
    // and made ACTIVE carrying zero hazard content.
    const jha = Array.isArray(body.jha)
      ? body.jha.filter((r: { task?: string; hazard?: string; control?: string }) => r?.hazard?.trim() && r?.control?.trim())
      : [];
    if (jha.length === 0 && !String(body.hazardsIdentified ?? "").trim()) {
      return NextResponse.json(
        {
          error:
            "Identify at least one hazard and its control measure before raising the permit — " +
            "a permit without hazard content cannot authorise work (ISO 45001 6.1.2).",
        },
        { status: 400 },
      );
    }

    // The UI filters the WMS list to APPROVED client-side only; a direct API
    // call could attach a DRAFT or REJECTED method statement, undermining the
    // WMS approval chain. Verify server-side.
    if (body.wmsId) {
      const [wms] = await db.select().from(wmsDocuments).where(eq(wmsDocuments.id, body.wmsId)).limit(1);
      if (!wms) return NextResponse.json({ error: "The selected Work Method Statement was not found." }, { status: 400 });
      if (wms.status !== "APPROVED") {
        return NextResponse.json(
          { error: `WMS ${wms.wmsNumber} is ${String(wms.status).toLowerCase().replace(/_/g, " ")} — only an APPROVED method statement may back a permit.` },
          { status: 409 },
        );
      }
    }

    const permitNumber = await nextDocNumber("PTW");

    // Fixed one-working-day validity — permits are re-raised, never renewed.
    const expiryDate = new Date(Date.now() + PERMIT_VALIDITY_HOURS * 3600 * 1000).toISOString();

    const newPermit = {
      id: nanoid(),
      permitNumber,
      workOrderId: body.workOrderId || null,
      equipmentId: body.equipmentId,
      workDescription: body.workDescription,
      hazardsIdentified: body.hazardsIdentified || "",
      controlMeasures: body.controlMeasures || "",
      wmsId: body.wmsId || null,
      jha: jha.length ? JSON.stringify(jha) : null,
      lotoApplied: body.lotoApplied || false,
      ppeRequired: body.ppeRequired ? JSON.stringify(body.ppeRequired) : "[]",
      areaBarricaded: body.areaBarricaded || false,
      issuedById: gate.actor?.id ?? null,
      permitHolderId: holder.id,
      permitHolderName: holder.name,
      // Recorded so the permit itself shows who was on site, not just which of
      // our own people signed for them.
      contractorId: body.contractorId || null,
      issuedDate: new Date().toISOString(),
      expiryDate,
      // Raised unapproved — work may not begin until the chain is fully signed.
      status: "PENDING_APPROVAL",
    };

    await db.insert(permits).values(newPermit);

    // The isolation register: each energy source made safe, its device and
    // lock/tag, and who applied it. "lotoApplied: true" alone is not an
    // isolation certificate for a machine with electrical, hydraulic,
    // pneumatic, stored and gravitational energy on it.
    const points = Array.isArray(body.isolationPoints) ? body.isolationPoints : [];
    const validPoints = points.filter(
      (p: { energySource?: string; isolationDevice?: string }) => p?.energySource?.trim() && p?.isolationDevice?.trim(),
    );
    if (newPermit.lotoApplied && validPoints.length === 0) {
      return NextResponse.json(
        {
          error:
            "LOTO is marked as applied — list the isolation points (energy source, isolating device and lock/tag) " +
            "so the de-isolation can be verified at close-out (ISO 45001 8.1.2).",
        },
        { status: 400 },
      );
    }
    if (validPoints.length) {
      await db.insert(isolationPoints).values(
        validPoints.map((p: Record<string, string>) => ({
          id: nanoid(),
          permitId: newPermit.id,
          energySource: String(p.energySource).slice(0, 40),
          isolationDevice: String(p.isolationDevice).slice(0, 120),
          lockTagNumber: p.lockTagNumber ? String(p.lockTagNumber).slice(0, 60) : null,
          appliedByName: gate.actor?.name ?? null,
          appliedById: gate.actor?.id ?? null,
          appliedAt: new Date().toISOString(),
          verifiedZeroEnergy: false,
        })),
      );
    }

    await ensureSignoffChain("PERMIT", newPermit.id, newPermit.permitNumber);

    return NextResponse.json(newPermit, { status: 201 });
  } catch (error: any) {
    console.error("Failed to create Permit-to-Work:", error);
    return NextResponse.json({ error: "Failed to create Permit-to-Work" }, { status: 500 });
  }
}
