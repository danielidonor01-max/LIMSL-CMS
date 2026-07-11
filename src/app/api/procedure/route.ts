// src/app/api/procedure/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { procedureRevisions, auditLog } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { auth } from "@/auth";
import { ensureSignoffChain, getSignoffChain } from "@/lib/signoff/service";
import { chainSummary } from "@/lib/signoff/chains";

// Promote any PENDING_APPROVAL revision whose sign-off chain is complete, and
// supersede the prior effective revision.
async function reconcile() {
  const revs = await db.select().from(procedureRevisions);
  for (const r of revs.filter((x) => x.status === "PENDING_APPROVAL")) {
    const chain = await getSignoffChain("PROCEDURE", r.id);
    if (chainSummary(chain).complete) {
      // supersede current approved
      for (const a of revs.filter((x) => x.status === "APPROVED")) {
        await db.update(procedureRevisions).set({ status: "SUPERSEDED" }).where(eq(procedureRevisions.id, a.id));
      }
      await db
        .update(procedureRevisions)
        .set({ status: "APPROVED", effectiveDate: new Date().toISOString().slice(0, 10), approvedAt: new Date().toISOString() })
        .where(eq(procedureRevisions.id, r.id));
    }
  }
}

// GET → current effective revision + full revision history.
export async function GET() {
  try {
    await reconcile();
    const revs = (await db.select().from(procedureRevisions)).sort((a, b) => b.revision - a.revision);
    const current = revs.find((r) => r.status === "APPROVED") ?? revs[0] ?? null;
    const pending = revs.find((r) => r.status === "PENDING_APPROVAL") ?? null;
    return NextResponse.json({
      current,
      pending: pending ? { id: pending.id, revision: pending.revision, title: pending.title } : null,
      revisions: revs.map((r) => ({
        id: r.id,
        code: r.code,
        title: r.title,
        revision: r.revision,
        status: r.status,
        changeSummary: r.changeSummary,
        preparedByName: r.preparedByName,
        effectiveDate: r.effectiveDate,
        createdAt: r.createdAt,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to load procedure:", error);
    return NextResponse.json({ error: "Failed to load procedure", details: message }, { status: 500 });
  }
}

// POST → propose a new revision (QA/QC authorises changes; Super Admin allowed).
export async function POST(request: Request) {
  try {
    const session = await auth();
    const user = session?.user as { id?: string; name?: string; role?: string } | undefined;
    if (!(user?.role === "QA_QC" || user?.role === "SUPER_ADMIN")) {
      return NextResponse.json(
        { error: "Only QA/QC (document control) or a Super Admin may propose a procedure revision." },
        { status: 403 },
      );
    }
    const body = await request.json();
    if (!body.contentMarkdown || String(body.contentMarkdown).trim().length < 20) {
      return NextResponse.json({ error: "Procedure content is required." }, { status: 400 });
    }

    const revs = await db.select().from(procedureRevisions);
    if (revs.some((r) => r.status === "PENDING_APPROVAL")) {
      return NextResponse.json({ error: "A revision is already pending approval. Complete or reject it first." }, { status: 409 });
    }
    const base = revs.sort((a, b) => b.revision - a.revision)[0];
    const nextRevision = (base?.revision ?? 0) + 1;

    const id = nanoid();
    await db.insert(procedureRevisions).values({
      id,
      code: base?.code ?? "LIMSL-MAIN-PROC-001",
      title: body.title || base?.title || "Equipment and System Maintenance Procedure",
      revision: nextRevision,
      contentMarkdown: body.contentMarkdown,
      changeSummary: body.changeSummary || "Revision proposed via QA/QC document control.",
      status: "PENDING_APPROVAL",
      preparedById: user.id ?? null,
      preparedByName: user.name ?? null,
    });

    await ensureSignoffChain("PROCEDURE", id);

    await db.insert(auditLog).values({
      id: nanoid(),
      userId: user.id ?? null,
      userName: user.name ?? "QA/QC",
      action: "CREATE",
      entityType: "procedure_revision",
      entityId: id,
      entityDescription: `Proposed procedure Rev ${nextRevision}`,
    });

    return NextResponse.json({ id, revision: nextRevision }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to propose revision:", error);
    return NextResponse.json({ error: "Failed to propose revision", details: message }, { status: 500 });
  }
}
