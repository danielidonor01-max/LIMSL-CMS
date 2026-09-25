// src/app/api/asset-categories/changes/route.ts
// Proposing a change to an asset category, and the list of changes made.
//
// A category's interval is the maintenance regime for every machine in it, so a
// change is never applied on the spot. It is proposed here with a reason, then
// signed by the Maintenance Manager and the QA/QC Supervisor, and applied only
// when both have — at which point every machine in the category moves to the
// new interval and its future plan is rebuilt. Until then the register and the
// schedule are exactly as they were.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assetCategoryChanges, auditLog } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { auth } from "@/auth";
import { requireRoles } from "@/lib/authz";
import { ASSET_CATEGORY_ROLES } from "@/lib/roles";
import { nextDocNumber } from "@/lib/doc-number";
import { ensureSignoffChain, getSignoffChain } from "@/lib/signoff/service";
import { chainSummary } from "@/lib/signoff/chains";
import {
  FREQUENCIES,
  categoryCodeFrom,
  getCategory,
  pendingChangeFor,
  applyCategoryChange,
} from "@/lib/maintenance/asset-categories";

// A change's state is read off its signatures, the same way the WMS and the
// permit derive theirs, so the list can never say "pending" about a change two
// people have already signed — or rejected.
async function reconcile(change: typeof assetCategoryChanges.$inferSelect) {
  const chain = await getSignoffChain("ASSET_CATEGORY", change.id);
  const summary = chainSummary(chain);
  if (change.status === "PENDING_APPROVAL") {
    if (chain.some((s) => s.required && s.status === "REJECTED")) {
      await db
        .update(assetCategoryChanges)
        .set({ status: "REJECTED" })
        .where(eq(assetCategoryChanges.id, change.id));
      return { ...change, status: "REJECTED", chain, approval: summary };
    }
    if (summary.complete) {
      await applyCategoryChange(change.id);
      const [fresh] = await db
        .select()
        .from(assetCategoryChanges)
        .where(eq(assetCategoryChanges.id, change.id))
        .limit(1);
      return { ...(fresh ?? change), chain, approval: summary };
    }
  }
  return { ...change, chain, approval: summary };
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const rows = await db
      .select()
      .from(assetCategoryChanges)
      .orderBy(desc(assetCategoryChanges.createdAt))
      .limit(100);

    const changes = [];
    for (const r of rows) changes.push(await reconcile(r));
    return NextResponse.json({ changes });
  } catch (error) {
    console.error("Failed to fetch category changes:", error);
    return NextResponse.json({ error: "Failed to fetch category changes" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const gate = await requireRoles(ASSET_CATEGORY_ROLES);
    if (gate.res) return gate.res;

    const body = await request.json();
    const kind = String(body.kind ?? "UPDATE").toUpperCase() === "CREATE" ? "CREATE" : "UPDATE";
    const label = String(body.label ?? "").trim();
    const frequency = String(body.frequency ?? "").toUpperCase();
    const reason = String(body.reason ?? "").trim();

    if (!label) return NextResponse.json({ error: "Give the category a name." }, { status: 400 });
    if (!FREQUENCIES.includes(frequency)) {
      return NextResponse.json({ error: "Choose how often machines in this category are serviced." }, { status: 400 });
    }
    if (reason.length < 10) {
      return NextResponse.json(
        {
          error:
            "Say why. This changes the maintenance regime of every machine in the category, and the " +
            "people signing it need to know what prompted it.",
        },
        { status: 400 },
      );
    }

    const code = kind === "CREATE" ? categoryCodeFrom(label) : String(body.categoryCode ?? "");
    if (!code) return NextResponse.json({ error: "Which category is this for?" }, { status: 400 });

    const existing = await getCategory(code);
    if (kind === "CREATE" && existing) {
      return NextResponse.json(
        { error: `${existing.label} already exists. Propose a change to it instead.` },
        { status: 409 },
      );
    }
    if (kind === "UPDATE" && !existing) {
      return NextResponse.json({ error: "That category is not on the register." }, { status: 404 });
    }
    if (existing && existing.label === label && existing.maintenanceFrequency === frequency) {
      return NextResponse.json({ error: "That is what the category already says." }, { status: 400 });
    }

    // One change at a time per category. Two proposals racing each other through
    // the same two signers would leave the category holding whichever was signed
    // last, which is not a decision anybody made.
    const waiting = await pendingChangeFor(code);
    if (waiting) {
      return NextResponse.json(
        { error: `${waiting.changeNumber} is already waiting for signatures on this category.` },
        { status: 409 },
      );
    }

    const id = nanoid();
    const changeNumber = await nextDocNumber("ACC");
    await db.insert(assetCategoryChanges).values({
      id,
      changeNumber,
      kind,
      categoryCode: code,
      proposedLabel: label,
      proposedFrequency: frequency,
      previousLabel: existing?.label ?? null,
      previousFrequency: existing?.maintenanceFrequency ?? null,
      reason: reason.slice(0, 1000),
      proposedById: gate.actor?.id ?? null,
      proposedByName: gate.actor?.name ?? null,
    });

    await ensureSignoffChain("ASSET_CATEGORY", id, changeNumber);

    await db.insert(auditLog).values({
      id: nanoid(),
      userId: gate.actor?.id ?? null,
      userName: gate.actor?.name || "System",
      action: "CREATE",
      entityType: "asset_category",
      entityId: code,
      entityDescription:
        `${changeNumber} proposed: ` +
        (kind === "CREATE"
          ? `new category ${label}, serviced ${frequency.toLowerCase().replace(/_/g, " ")}`
          : `${existing?.label} -> ${label}, ${String(existing?.maintenanceFrequency).toLowerCase().replace(/_/g, " ")} -> ${frequency.toLowerCase().replace(/_/g, " ")}`) +
        `. Waiting for the Maintenance Manager and QA/QC Supervisor. Reason: ${reason.slice(0, 200)}`,
    });

    return NextResponse.json({ id, changeNumber }, { status: 201 });
  } catch (error) {
    console.error("Failed to propose category change:", error);
    return NextResponse.json({ error: "Failed to propose the change" }, { status: 500 });
  }
}
