// src/app/api/asset-categories/[code]/route.ts
// Detailed dossier for an asset category:
// - Category metadata (code, label, frequency, annual start date)
// - Machine stats: working (operational) vs faulty (broken down, under maintenance, awaiting parts)
// - Next due PM date and countdown
// - Pending PMs count and listing
// - Recent activities (PM batches, completed PM work orders)
// - Associated compliance and safety documents (WMS, JHA, PTW, WO)
// - Complete machine roster for this category
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  equipment,
  assetCategories,
  maintenanceSchedule,
  pmBatches,
  workOrders,
  permits,
  wmsDocuments,
  jhaDocuments,
} from "@/lib/db/schema";
import { eq, inArray, desc, asc, and, gte } from "drizzle-orm";
import { auth } from "@/auth";
import { getCategory } from "@/lib/maintenance/asset-categories";
import { DEFAULT_CATEGORY_START_DATES } from "@/lib/constants";
import { plannedDatesFor } from "@/lib/maintenance/plan-generation";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> | { code: string } },
) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const resolvedParams = await params;
    const categoryCode = decodeURIComponent(resolvedParams.code);

    const cat = await getCategory(categoryCode);
    if (!cat) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }

    // 1. Machines in this category
    let machinesList: any[] = [];
    try {
      machinesList = await db
        .select({
          id: equipment.id,
          assetId: equipment.assetId,
          name: equipment.name,
          category: equipment.category,
          status: equipment.status,
          location: equipment.location,
          criticality: equipment.criticality,
          maintenanceFrequency: equipment.maintenanceFrequency,
          lastMaintenanceDate: equipment.lastMaintenanceDate,
          commissioningDate: equipment.commissioningDate,
        })
        .from(equipment)
        .where(eq(equipment.category, categoryCode))
        .orderBy(asc(equipment.assetId));
    } catch (e) {
      console.warn("Error fetching machines for category:", e);
    }

    const machineIds = machinesList.map((m) => m.id);

    // 2. Stats: working vs faulty
    const totalMachines = machinesList.length;
    const workingCount = machinesList.filter((m) => m.status === "OPERATIONAL").length;
    const faultyCount = machinesList.filter((m) =>
      ["UNDER_MAINTENANCE", "BROKEN_DOWN", "AWAITING_PARTS"].includes(m.status),
    ).length;
    const decommissionedCount = machinesList.filter((m) => m.status === "DECOMMISSIONED").length;

    // 3. Maintenance schedule, pending PMs & next due date
    const today = new Date().toISOString().slice(0, 10);
    const thisYear = new Date().getFullYear();

    let scheduleItems: any[] = [];
    if (machineIds.length > 0) {
      try {
        scheduleItems = await db
          .select({
            id: maintenanceSchedule.id,
            equipmentId: maintenanceSchedule.equipmentId,
            plannedDate: maintenanceSchedule.plannedDate,
            activityType: maintenanceSchedule.activityType,
            taskDescription: maintenanceSchedule.taskDescription,
            status: maintenanceSchedule.status,
            completedDate: maintenanceSchedule.completedDate,
            responsiblePersonName: maintenanceSchedule.responsiblePersonName,
            workOrderId: maintenanceSchedule.workOrderId,
            batchId: maintenanceSchedule.batchId,
          })
          .from(maintenanceSchedule)
          .where(inArray(maintenanceSchedule.equipmentId, machineIds))
          .orderBy(asc(maintenanceSchedule.plannedDate));
      } catch (e) {
        console.warn("Error querying maintenanceSchedule:", e);
      }
    }

    // Machine lookup map for quick joining
    const machineMap = new Map(machinesList.map((m) => [m.id, m]));

    // Pending PMs (SCHEDULED or OVERDUE)
    const pendingPMsList = scheduleItems
      .filter((s) => s.status === "SCHEDULED" || s.status === "OVERDUE" || s.status === "RESCHEDULED")
      .map((s) => ({
        id: s.id,
        plannedDate: s.plannedDate,
        activityType: s.activityType,
        status: s.status,
        equipmentName: machineMap.get(s.equipmentId)?.name ?? "Equipment",
        assetId: machineMap.get(s.equipmentId)?.assetId ?? "",
        workOrderId: s.workOrderId,
        batchId: s.batchId,
        responsiblePersonName: s.responsiblePersonName,
      }));

    // Find next due PM date
    const upcomingScheduled = scheduleItems
      .filter((s) => s.plannedDate >= today && (s.status === "SCHEDULED" || s.status === "OVERDUE"))
      .map((s) => s.plannedDate);

    let nextDueDate: string | null = upcomingScheduled[0] ?? null;

    // If no future items exist in DB schedule table, calculate next occurrence from category start date & frequency
    if (!nextDueDate) {
      const anchor = cat.defaultStartDate || DEFAULT_CATEGORY_START_DATES[categoryCode] || `${thisYear}-01-01`;
      const plannedDates = plannedDatesFor({
        frequency: cat.maintenanceFrequency,
        anchorDate: anchor,
        year: thisYear,
        notBefore: today,
      });
      if (plannedDates.length > 0) {
        nextDueDate = plannedDates[0].plannedDate;
      } else {
        // Look into next year
        const nextYearPlanned = plannedDatesFor({
          frequency: cat.maintenanceFrequency,
          anchorDate: anchor,
          year: thisYear + 1,
        });
        if (nextYearPlanned.length > 0) {
          nextDueDate = nextYearPlanned[0].plannedDate;
        }
      }
    }

    let daysUntilNextDue: number | null = null;
    if (nextDueDate) {
      const msDiff = new Date(nextDueDate + "T00:00:00").getTime() - new Date(today + "T00:00:00").getTime();
      daysUntilNextDue = Math.ceil(msDiff / (1000 * 60 * 60 * 24));
    }

    // 4. Recent Activities (PM batches & recent completed work orders / maintenance items)
    let categoryBatches: any[] = [];
    try {
      categoryBatches = await db
        .select({
          id: pmBatches.id,
          batchNumber: pmBatches.batchNumber,
          title: pmBatches.title,
          category: pmBatches.category,
          plannedDate: pmBatches.plannedDate,
          status: pmBatches.status,
          assignedToName: pmBatches.assignedToName,
          completedDate: pmBatches.completedDate,
          createdAt: pmBatches.createdAt,
        })
        .from(pmBatches)
        .where(eq(pmBatches.category, categoryCode))
        .orderBy(desc(pmBatches.plannedDate))
        .limit(6);
    } catch (e) {
      console.warn("Error querying pmBatches:", e);
    }

    const completedSchedules = scheduleItems
      .filter((s) => s.status === "COMPLETED" && s.completedDate)
      .sort((a, b) => (b.completedDate || "").localeCompare(a.completedDate || ""))
      .slice(0, 5)
      .map((s) => ({
        id: s.id,
        type: "PM_SCHEDULE",
        refNumber: s.workOrderId ? `WO: ${s.workOrderId}` : s.id.slice(0, 8),
        title: s.taskDescription || "Completed Preventive Maintenance",
        date: s.completedDate,
        status: "COMPLETED",
        equipmentName: machineMap.get(s.equipmentId)?.name,
        assetId: machineMap.get(s.equipmentId)?.assetId,
        responsiblePersonName: s.responsiblePersonName,
      }));

    // 5. Related safety and compliance documents
    // WMS: standing Work Method Statements for this category
    let wmsList: any[] = [];
    try {
      wmsList = await db
        .select({
          id: wmsDocuments.id,
          wmsNumber: wmsDocuments.wmsNumber,
          title: wmsDocuments.title,
          revision: wmsDocuments.revision,
          status: wmsDocuments.status,
          category: wmsDocuments.category,
          effectiveDate: wmsDocuments.effectiveDate,
          approvedByName: wmsDocuments.approvedByName,
          preparedByName: wmsDocuments.preparedByName,
          createdAt: wmsDocuments.createdAt,
        })
        .from(wmsDocuments)
        .where(eq(wmsDocuments.category, categoryCode))
        .orderBy(desc(wmsDocuments.revision), desc(wmsDocuments.createdAt))
        .limit(5);
    } catch (e) {
      console.warn("Error querying wmsDocuments:", e);
    }

    // JHA: Job Hazard Analysis for this category
    let jhaList: any[] = [];
    try {
      jhaList = await db
        .select({
          id: jhaDocuments.id,
          jhaNumber: jhaDocuments.jhaNumber,
          title: jhaDocuments.title,
          revision: jhaDocuments.revision,
          status: jhaDocuments.status,
          category: jhaDocuments.category,
          wmsRevision: jhaDocuments.wmsRevision,
          preparedByName: jhaDocuments.preparedByName,
          approvedAt: jhaDocuments.approvedAt,
          createdAt: jhaDocuments.createdAt,
        })
        .from(jhaDocuments)
        .where(eq(jhaDocuments.category, categoryCode))
        .orderBy(desc(jhaDocuments.revision), desc(jhaDocuments.createdAt))
        .limit(5);
    } catch (e) {
      console.warn("Error querying jhaDocuments:", e);
    }

    // PTWs: recent permits for equipment in this category or batch
    let ptwList: any[] = [];
    if (machineIds.length > 0) {
      try {
        ptwList = await db
          .select({
            id: permits.id,
            permitNumber: permits.permitNumber,
            workDescription: permits.workDescription,
            status: permits.status,
            startDate: permits.startDate,
            expiryDate: permits.expiryDate,
            equipmentId: permits.equipmentId,
            batchId: permits.batchId,
            createdAt: permits.createdAt,
          })
          .from(permits)
          .where(inArray(permits.equipmentId, machineIds))
          .orderBy(desc(permits.createdAt))
          .limit(5);
      } catch (e) {
        console.warn("Error querying permits:", e);
      }
    }

    // Work Orders: recent work orders for equipment in this category
    let woList: any[] = [];
    if (machineIds.length > 0) {
      try {
        woList = await db
          .select({
            id: workOrders.id,
            workOrderNumber: workOrders.workOrderNumber,
            title: workOrders.title,
            type: workOrders.type,
            status: workOrders.status,
            priority: workOrders.priority,
            plannedDate: workOrders.plannedDate,
            equipmentId: workOrders.equipmentId,
            batchId: workOrders.batchId,
            technicianName: workOrders.technicianName,
            createdAt: workOrders.createdAt,
          })
          .from(workOrders)
          .where(inArray(workOrders.equipmentId, machineIds))
          .orderBy(desc(workOrders.createdAt))
          .limit(6);
      } catch (e) {
        console.warn("Error querying workOrders:", e);
      }
    }

    return NextResponse.json({
      category: {
        code: cat.code,
        label: cat.label,
        maintenanceFrequency: cat.maintenanceFrequency,
        defaultStartDate: cat.defaultStartDate,
      },
      stats: {
        totalMachines,
        workingCount,
        faultyCount,
        decommissionedCount,
        workingPercentage: totalMachines > 0 ? Math.round((workingCount / totalMachines) * 100) : 100,
      },
      nextDue: {
        date: nextDueDate,
        daysAway: daysUntilNextDue,
        isOverdue: daysUntilNextDue !== null && daysUntilNextDue < 0,
      },
      pendingPMs: {
        count: pendingPMsList.length,
        items: pendingPMsList.slice(0, 15),
      },
      recentActivities: {
        batches: categoryBatches,
        completedPMs: completedSchedules,
      },
      documents: {
        wms: wmsList,
        jha: jhaList,
        ptw: ptwList.map((p) => ({
          ...p,
          equipmentName: machineMap.get(p.equipmentId)?.name,
          assetId: machineMap.get(p.equipmentId)?.assetId,
        })),
        wo: woList.map((w) => ({
          ...w,
          equipmentName: machineMap.get(w.equipmentId)?.name,
          assetId: machineMap.get(w.equipmentId)?.assetId,
        })),
      },
      machines: machinesList,
    });
  } catch (error) {
    console.error("Failed to load category dossier:", error);
    return NextResponse.json({ error: "Failed to load category details" }, { status: 500 });
  }
}
