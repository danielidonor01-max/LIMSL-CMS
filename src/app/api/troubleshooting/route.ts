// src/app/api/troubleshooting/route.ts
// The Troubleshooting module (27 Nov 2026): every session, the breakdowns
// still waiting for a diagnosis, and the causes the engine has learned.
//   GET                      → the module page
//   GET ?correctiveId=<id>   → the sessions on one breakdown (its trail panel)
// Read-only, open to every signed-in role: the history is the record.
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { diagnosisSessions, correctiveMaintenance, equipment, diagnosticGuides } from "@/lib/db/schema";
import { desc, eq, ne } from "drizzle-orm";
import { diagnosisState, troubleshootingSummary } from "@/lib/maintenance/troubleshooting";

const assetKey = (assetId: string | null) => (assetId ?? "").replaceAll("/", "-");

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const correctiveId = new URL(request.url).searchParams.get("correctiveId");

    const sessionRows = await db
      .select({
        id: diagnosisSessions.id,
        symptom: diagnosisSessions.symptom,
        status: diagnosisSessions.status,
        outcome: diagnosisSessions.outcome,
        resolvedCause: diagnosisSessions.resolvedCause,
        resolutionNote: diagnosisSessions.resolutionNote,
        correctiveId: diagnosisSessions.correctiveId,
        startedByName: diagnosisSessions.startedByName,
        closedByName: diagnosisSessions.closedByName,
        createdAt: diagnosisSessions.createdAt,
        updatedAt: diagnosisSessions.updatedAt,
        closedAt: diagnosisSessions.closedAt,
        equipmentId: diagnosisSessions.equipmentId,
        assetId: equipment.assetId,
        machineName: equipment.name,
        cmrfNumber: correctiveMaintenance.cmrfNumber,
        cmStatus: correctiveMaintenance.status,
        reportedAt: correctiveMaintenance.createdAt,
      })
      .from(diagnosisSessions)
      .leftJoin(equipment, eq(diagnosisSessions.equipmentId, equipment.id))
      .leftJoin(correctiveMaintenance, eq(diagnosisSessions.correctiveId, correctiveMaintenance.id))
      .where(correctiveId ? eq(diagnosisSessions.correctiveId, correctiveId) : undefined)
      .orderBy(desc(diagnosisSessions.createdAt))
      .limit(300);

    const sessions = sessionRows.map((s) => ({
      ...s,
      href: `/equipment/${assetKey(s.assetId)}/troubleshoot?session=${s.id}`,
    }));
    if (correctiveId) return NextResponse.json({ sessions });

    const open = await db
      .select({
        id: correctiveMaintenance.id,
        cmrfNumber: correctiveMaintenance.cmrfNumber,
        status: correctiveMaintenance.status,
        urgency: correctiveMaintenance.urgency,
        faultDescription: correctiveMaintenance.faultDescription,
        verifiedRootCause: correctiveMaintenance.verifiedRootCause,
        reportedDate: correctiveMaintenance.reportedDate,
        reportedByName: correctiveMaintenance.reportedByName,
        equipmentId: correctiveMaintenance.equipmentId,
        assetId: equipment.assetId,
        machineName: equipment.name,
      })
      .from(correctiveMaintenance)
      .leftJoin(equipment, eq(correctiveMaintenance.equipmentId, equipment.id))
      .where(ne(correctiveMaintenance.status, "CLOSED"))
      .orderBy(desc(correctiveMaintenance.reportedDate));

    const openBreakdowns = open.map((b) => {
      const state = diagnosisState(b, sessions);
      return {
        ...b,
        diagnosis: state,
        sessionInProgress: state === "IN_PROGRESS",
        awaitingDiagnosis: state === "WAITING",
        startHref: `/equipment/${assetKey(b.assetId)}/troubleshoot?cm=${b.id}`,
      };
    });

    const knownCauses = await db
      .select({
        id: diagnosticGuides.id,
        symptom: diagnosticGuides.symptom,
        errorCode: diagnosticGuides.errorCode,
        probableCause: diagnosticGuides.probableCause,
        resolutionAction: diagnosticGuides.resolutionAction,
        successCount: diagnosticGuides.successCount,
        assetId: equipment.assetId,
        machineName: equipment.name,
      })
      .from(diagnosticGuides)
      .leftJoin(equipment, eq(diagnosticGuides.equipmentId, equipment.id))
      .orderBy(desc(diagnosticGuides.successCount));

    return NextResponse.json({
      summary: troubleshootingSummary(sessions, open),
      sessions,
      openBreakdowns,
      knownCauses,
    });
  } catch (error) {
    console.error("Failed to load troubleshooting:", error);
    return NextResponse.json({ error: "Failed to load troubleshooting" }, { status: 500 });
  }
}
