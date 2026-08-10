// src/app/api/permits/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  permits,
  equipment,
  users,
  wmsDocuments,
  jhaDocuments,
  isolationPoints,
  contractors,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireRoles } from "@/lib/authz";
import { PERMIT_ISSUE_ROLES } from "@/lib/roles";
import { nextDocNumber } from "@/lib/doc-number";
import { ensureSignoffChain, getSignoffChain } from "@/lib/signoff/service";
import { chainSummary } from "@/lib/signoff/chains";
import { assessContractor, blockReason } from "@/lib/hse/contractors";
import { reconcilePermits } from "@/lib/hse/permit-reconcile";
import {
  DEFAULT_PERMIT_VALIDITY_DAYS,
  normaliseValidityDays,
  expiryDateOf,
} from "@/lib/hse/permit-validity";
import {
  validateWorkTypes,
  missingMandatoryPrecautions,
  WORK_AREA_PRECAUTIONS,
  PPE_REQUIREMENTS,
  REQUIRED_DOCUMENTS,
  unmarkedItems,
  type ChecklistMarks,
} from "@/lib/hse/permit-form";

// Status transitions and the seven-day validity live in lib/hse/permit-reconcile.ts,
// re-exported so existing callers keep working.
export { reconcilePermits } from "@/lib/hse/permit-reconcile";

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
    // HSE is the issuing authority, only HSE (or Super Admin) may raise a permit.
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
    // accountable to an auditor, a person is.
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
    // silently, nobody is emailed by their insurer's expiry date, so the check
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

    // ── The document chain ────────────────────────────────────────────────
    // A permit is the last document in WO -> WMS -> JHA -> PTW, and each link
    // is verified server-side. The form filters its dropdowns, but a direct API
    // call would otherwise attach a draft method statement or an unapproved
    // hazard analysis and undo the whole chain.
    if (!body.jhaId) {
      return NextResponse.json(
        { error: "Select the approved Job Hazard Analysis this permit is issued against." },
        { status: 400 },
      );
    }
    const [jhaDoc] = await db
      .select()
      .from(jhaDocuments)
      .where(eq(jhaDocuments.id, body.jhaId))
      .limit(1);
    if (!jhaDoc) {
      return NextResponse.json({ error: "The selected Job Hazard Analysis was not found." }, { status: 400 });
    }
    if (jhaDoc.status !== "APPROVED") {
      return NextResponse.json(
        {
          error:
            `${jhaDoc.jhaNumber} is ${String(jhaDoc.status).toLowerCase().replace(/_/g, " ")}. ` +
            `A permit is issued against an approved hazard analysis, not one still being reviewed.`,
        },
        { status: 409 },
      );
    }

    // The method statement and work order come from the analysis rather than
    // being re-picked, so the four documents can never point at different jobs.
    const wmsId = jhaDoc.wmsId ?? null;
    if (wmsId) {
      const [wms] = await db.select().from(wmsDocuments).where(eq(wmsDocuments.id, wmsId)).limit(1);
      if (wms && wms.status !== "APPROVED") {
        return NextResponse.json(
          {
            error:
              `WMS ${wms.wmsNumber} is ${String(wms.status).toLowerCase().replace(/_/g, " ")}. ` +
              `It has been revised since the hazard analysis was approved, so the analysis must be revised too.`,
          },
          { status: 409 },
        );
      }
    }

    // ── The permit face ───────────────────────────────────────────────────
    const typeCheck = validateWorkTypes(body.workTypes);
    if (!typeCheck.ok) {
      return NextResponse.json({ error: typeCheck.error }, { status: 400 });
    }

    const marks = (raw: unknown): ChecklistMarks => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
      return Object.fromEntries(
        Object.entries(raw as Record<string, unknown>).filter(
          ([, v]) => v === "YES" || v === "NO" || v === "NA",
        ),
      ) as ChecklistMarks;
    };
    const documentMarks = marks(body.documentMarks);
    const precautionMarks = marks(body.precautionMarks);
    const ppeMarks = marks(body.ppeMarks);

    // Every line on the paper form is ticked or crossed before it is signed. A
    // blank line is nobody having considered the control, and a permit issued
    // with blanks is a permit whose checklist was never actually run.
    const blanks = [
      ...unmarkedItems(REQUIRED_DOCUMENTS, documentMarks),
      ...unmarkedItems(WORK_AREA_PRECAUTIONS, precautionMarks),
      ...unmarkedItems(PPE_REQUIREMENTS, ppeMarks),
    ];
    if (blanks.length > 0) {
      return NextResponse.json(
        {
          error:
            `${blanks.length} line(s) on the permit have been left blank. ` +
            `Mark every line yes, no or not applicable: ${blanks.slice(0, 4).join(", ")}` +
            `${blanks.length > 4 ? ` and ${blanks.length - 4} more` : ""}.`,
          blanks,
        },
        { status: 400 },
      );
    }

    // Hot work without a fire watch is the permit failing at the one thing it
    // exists to do, so the controls the work type demands are refused at issue
    // rather than noticed afterwards.
    const missing = missingMandatoryPrecautions(typeCheck.workTypes, precautionMarks);
    if (missing.length > 0) {
      return NextResponse.json(
        {
          error:
            `The type of work selected requires these controls to be in place: ${missing.join(", ")}. ` +
            `Tick them, or change the type of work.`,
          missing,
        },
        { status: 400 },
      );
    }

    const startDate = String(body.startDate ?? new Date().toISOString().slice(0, 10)).slice(0, 10);
    const validityDays = normaliseValidityDays(body.validityDays ?? DEFAULT_PERMIT_VALIDITY_DAYS);

    const permitNumber = await nextDocNumber("PTW");

    const newPermit = {
      id: nanoid(),
      permitNumber,
      taskNo: body.taskNo ? String(body.taskNo).slice(0, 20) : null,
      // Inherited from the hazard analysis so the chain cannot fork.
      workOrderId: jhaDoc.workOrderId ?? body.workOrderId ?? null,
      equipmentId: body.equipmentId,
      workDescription: body.workDescription,
      hazardsIdentified: body.hazardsIdentified || "",
      controlMeasures: body.controlMeasures || "",
      wmsId,
      jhaId: jhaDoc.id,
      lotoApplied: body.lotoApplied || false,
      ppeRequired: jhaDoc.ppeRequired ?? "[]",
      areaBarricaded: body.areaBarricaded || false,

      workTypes: JSON.stringify(typeCheck.workTypes),
      facility: body.facility || null,
      workArea: body.workArea || jhaDoc.workArea || null,
      zoneClassification: body.zoneClassification || null,
      startDate,
      startTime: body.startTime || null,
      durationHours: Number.isFinite(Number(body.durationHours)) ? Number(body.durationHours) : null,
      workerCount: Number.isFinite(Number(body.workerCount)) ? Math.trunc(Number(body.workerCount)) : null,
      permitDepartment: body.permitDepartment || "HSE",
      validityDays,
      documentMarks: JSON.stringify(documentMarks),
      precautionMarks: JSON.stringify(precautionMarks),
      ppeMarks: JSON.stringify(ppeMarks),
      additionalRequirements: body.additionalRequirements || null,
      renewalDays: null,

      issuedById: gate.actor?.id ?? null,
      permitHolderId: holder.id,
      permitHolderName: holder.name,
      contractorId: body.contractorId || null,
      issuedDate: new Date().toISOString(),
      expiryDate: expiryDateOf(startDate, validityDays),
      supersedesPermitId: body.supersedesPermitId || null,
      // Raised unapproved, work may not begin until the chain is fully signed.
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
            "LOTO is marked as applied, list the isolation points (energy source, isolating device and lock/tag) " +
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

    await ensureSignoffChain("PERMIT", newPermit.id, newPermit.permitNumber, {
      PERMIT_HOLDER: { id: holder.id, name: holder.name },
    });

    return NextResponse.json(newPermit, { status: 201 });
  } catch (error: any) {
    console.error("Failed to create Permit-to-Work:", error);
    return NextResponse.json({ error: "Failed to create Permit-to-Work" }, { status: 500 });
  }
}
