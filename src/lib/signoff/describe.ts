// src/lib/signoff/describe.ts
// What a signed document is called, and where it is read.
//
// The sign-off engine knows a chain by (entityType, entityId) and nothing else.
// Every screen that lists chains — the queue of things waiting on you, the
// tracker of every flow in progress — has to turn that pair into a title, a
// reference number and a link. That lives here, once, so the two cannot drift:
// a document added to one and forgotten in the other would read as "Record not
// found", which is exactly what category changes did until this existed.
import { db } from "@/lib/db";
import {
  workOrders,
  correctiveMaintenance,
  wmsDocuments,
  jhaDocuments,
  permits,
  nonConformities,
  procedureRevisions,
  pmChecklists,
  assetCategoryChanges,
} from "@/lib/db/schema";
import { inArray } from "drizzle-orm";
import { entityHref } from "./inbox";

export type Description = { title: string; code: string | null; href: string };

const FREQ: Record<string, string> = {
  MONTHLY: "monthly",
  BI_MONTHLY: "every 2 months",
  QUARTERLY: "quarterly",
  SEMI_ANNUAL: "every 6 months",
  ANNUAL: "annually",
};

type Describer = { title: string; code: string | null; href?: string };

export async function describeEntities(
  items: { entityType: string; entityId: string }[],
): Promise<Map<string, Description>> {
  const out = new Map<string, Description>();
  const need = (t: string) => [...new Set(items.filter((m) => m.entityType === t).map((m) => m.entityId))];
  const put = (type: string, id: string, d: Describer) =>
    out.set(`${type}:${id}`, { title: d.title, code: d.code, href: d.href ?? entityHref(type, id) });

  const load = async <T extends { id: string }>(type: string, table: any, describe: (r: T) => Describer) => {
    const ids = need(type);
    if (!ids.length) return;
    const found = (await db.select().from(table).where(inArray(table.id, ids))) as T[];
    for (const r of found) put(type, r.id, describe(r));
  };

  await Promise.all([
    load("WORK_ORDER", workOrders, (r: any) => ({ title: r.title, code: r.workOrderNumber })),
    load("CORRECTIVE", correctiveMaintenance, (r: any) => ({
      title: r.faultDescription || r.equipmentName || "Corrective record",
      code: r.cmrfNumber,
    })),
    load("WMS", wmsDocuments, (r: any) => ({ title: r.title, code: r.wmsNumber })),
    load("JHA", jhaDocuments, (r: any) => ({ title: r.title, code: r.jhaNumber })),
    load("PERMIT", permits, (r: any) => ({ title: r.workDescription, code: r.permitNumber })),
    load("PERMIT_CLOSEOUT", permits, (r: any) => ({ title: r.workDescription, code: r.permitNumber })),
    load("NON_CONFORMITY", nonConformities, (r: any) => ({ title: r.description, code: r.ncNumber })),
    load("PROCEDURE", procedureRevisions, (r: any) => ({
      title: r.title || "Maintenance procedure",
      code: r.revision ? `Rev ${r.revision}` : null,
    })),
    // The checklist's own id is not a route. It is filled in against the work
    // order that raised it, so that is where the signature is given.
    load("PM_CHECKLIST", pmChecklists, (r: any) => ({
      title: "PM checklist",
      code: r.date ?? null,
      href: `/work-orders/${r.workOrderId}/pm-checklist`,
    })),
    // Says what the change actually does, so it can be judged from the list,
    // and opens straight onto that change rather than the whole page.
    load("ASSET_CATEGORY", assetCategoryChanges, (r: any) => ({
      title:
        r.kind === "CREATE"
          ? `New category: ${r.proposedLabel}, serviced ${FREQ[r.proposedFrequency] ?? r.proposedFrequency}`
          : r.previousFrequency !== r.proposedFrequency
            ? `${r.previousLabel}: ${FREQ[r.previousFrequency] ?? r.previousFrequency} to ${FREQ[r.proposedFrequency] ?? r.proposedFrequency}`
            : `${r.previousLabel} renamed to ${r.proposedLabel}`,
      code: r.changeNumber,
      href: `/settings/categories?change=${r.id}`,
    })),
  ]);

  return out;
}
