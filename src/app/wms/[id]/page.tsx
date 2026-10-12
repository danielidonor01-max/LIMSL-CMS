// src/app/wms/[id]/page.tsx
"use client";

import DocumentSeal from "@/components/DocumentSeal";
import WmsDocumentHeader from "@/components/WmsDocumentHeader";
import type { RevisionEntry } from "@/components/WmsDocumentHeader";
import { pageMain } from "@/lib/page-shell";
import { useState, useEffect, use } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Loader2, ShieldCheck, Biohazard, Printer, History, FilePlus2 } from "lucide-react";
import Button from "@/components/Button";
import SignoffChain from "@/components/SignoffChain";
import PageHeader from "@/components/PageHeader";
import { Badge } from "@/components/Badge";
import { WMS_STATUS_BADGE, WMS_STATUS_LABELS } from "@/lib/constants";
import { WMS_WRITE_ROLES } from "@/lib/roles";

export default function WmsDetail({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const wmsId = resolvedParams.id;
  const { data: session } = useSession();
  const role = (session?.user as { role?: string })?.role;

  const [wms, setWms] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [chain, setChain] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    async function loadWms() {
      try {
        const res = await fetch(`/api/wms/${wmsId}`);
        if (res.ok) {
          const data = await res.json();
          setWms(data);
        }
      } catch (err) {
        console.error("Error loading WMS:", err);
      } finally {
        setLoading(false);
      }
    }
    loadWms();
  }, [wmsId]);

  // Fetch the sign-off chain to populate the revision history header with
  // real signer names once signatures are captured.
  useEffect(() => {
    fetch(`/api/signoffs?entityType=WMS&entityId=${wmsId}`)
      .then((r) => r.json())
      .then((d) => setChain(Array.isArray(d) ? d : []))
      .catch(() => setChain([]));
  }, [wmsId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center text-ink-500 text-sm gap-2">
        <Loader2 className="w-5 h-5 animate-spin text-brand-600" /> Loading the method statement…
      </div>
    );
  }

  if (!wms) {
    return (
      <div className="min-h-screen bg-canvas flex flex-col items-center justify-center gap-3 text-ink-500 text-sm">
        <p>This work method statement could not be found.</p>
        <Link href="/wms" className="text-brand-600 hover:underline">Back to the WMS library</Link>
      </div>
    );
  }

  // Parse arrays. Items may be plain strings or {step, description}/{name} objects
  // depending on how the WMS was created, normalise to text for rendering.
  const asText = (v: unknown): string =>
    typeof v === "string"
      ? v
      : (v as { description?: string; name?: string; step?: string })?.description ??
        (v as { name?: string })?.name ??
        (v as { step?: string })?.step ??
        (v == null ? "" : JSON.stringify(v));
  const safeParse = (s: string | null): unknown[] => {
    if (!s) return [];
    try {
      const p = JSON.parse(s);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  };
  const procedureSteps = safeParse(wms.workProcedureSteps);
  const tools = safeParse(wms.equipmentAndTools);
  const materials = safeParse(wms.materials);

  // Build revision history from the WMS data and the live sign-off chain.
  // The chain has 3 steps, one per column on the paper header: Originator
  // (Foreman) = Prepared, Factory Supervisor / Maintenance Manager = Reviewed,
  // Factory Coordinator = Approved.
  const stepByRole = (role: string) => chain.find((s) => s.role === role);
  const foreman = stepByRole("FOREMAN");
  const maintMgr = stepByRole("MAINTENANCE_MANAGER");
  const factoryMgr = stepByRole("FACTORY_MANAGER");

  const currentRevision: RevisionEntry = {
    rev: wms.revision ?? 0,
    date: (wms.preparedDate ?? "").slice(0, 10).split("-").reverse().join("-"),
    description: wms.changeSummary || "ISSUED FOR REVIEW AND APPROVAL",
    preparedBy: {
      name: foreman?.signedByName ?? wms.preparedByName ?? "—",
      title: foreman?.signedByName ? "Foreman" : (wms.preparedByName ? "Maintenance Tech." : "—"),
    },
    reviewedBy: {
      name: maintMgr?.signedByName ?? "—",
      title: maintMgr?.signedByName ? "Factory Supervisor / Maint. Mgr" : "Factory Supervisor",
    },
    approvedBy: {
      name: factoryMgr?.signedByName ?? "—",
      title: "Factory Coord.",
    },
  };

  const revisions: RevisionEntry[] =
    Array.isArray(wms.revisions) && wms.revisions.length > 0
      ? wms.revisions.map((r: any) => {
          const isCurrent = r.id === wms.id;
          return {
            rev: r.revision ?? 0,
            date: (r.effectiveDate ?? r.preparedDate ?? r.createdAt ?? "").slice(0, 10).split("-").reverse().join("."),
            description: r.changeSummary || (r.revision === 0 ? "ISSUED FOR REVIEW AND APPROVAL" : "REVISED WORK PROCEDURE"),
            preparedBy: {
              name: isCurrent ? (foreman?.signedByName ?? r.preparedByName ?? "—") : (r.preparedByName ?? "—"),
              title: isCurrent && foreman?.signedByName ? "Foreman" : (r.preparedByName ? "Maintenance Tech." : "—"),
            },
            reviewedBy: {
              name: isCurrent ? (maintMgr?.signedByName ?? r.reviewedByName ?? "—") : (r.reviewedByName ?? "—"),
              title: isCurrent && maintMgr?.signedByName ? "Factory Supervisor / Maint. Mgr" : "Factory Supervisor",
            },
            approvedBy: {
              name: isCurrent ? (factoryMgr?.signedByName ?? r.approvedByName ?? "—") : (r.approvedByName ?? "—"),
              title: "Factory Coord.",
            },
          };
        })
      : [currentRevision];

  const canRevise = mounted && !loading && (WMS_WRITE_ROLES.includes(role ?? "") || role === "SUPER_ADMIN");

  return (
    <div className="min-h-screen bg-canvas text-ink-900 flex flex-col font-sans">
      <main className={pageMain("detail", "grid grid-cols-1 lg:grid-cols-3 gap-6 print:block print:space-y-6")}>
        <div className="lg:col-span-3 no-print">
          <PageHeader
            title="Work Method Statement"
            subtitle="How the job is to be done safely, with its quality plan and approvals"
            code={wms.wmsNumber}
            backHref="/wms"
            backLabel="Work Method Statements"
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" icon={History} onClick={() => setShowHistory((s) => !s)}>
                  History
                </Button>
                <Button variant="secondary" icon={Printer} onClick={() => window.print()}>
                  Print
                </Button>
                {canRevise && (
                  <Button variant="secondary" icon={FilePlus2} href={`/wms/new?reviseId=${wms.id}`}>
                    Revise
                  </Button>
                )}
                {wms.status === "APPROVED" ? (
                  <Button href={`/jha/new?wmsId=${wms.id}`} icon={Biohazard}>
                    Create JHA from this WMS
                  </Button>
                ) : (
                  <span className="text-xs text-ink-500 max-w-xs text-right leading-snug">
                    A hazard analysis is written against an approved method statement. This one is{" "}
                    {String(wms.status).toLowerCase().replace(/_/g, " ")}.
                  </span>
                )}
              </div>
            }
          />
        </div>

        {/* Revision history drawer */}
        {showHistory && (
          <div className="lg:col-span-3 no-print bg-surface border border-line rounded-xl shadow-card p-4">
            <h3 className="text-sm font-semibold text-ink-900 mb-3">Revision history and records</h3>
            <div className="space-y-1.5">
              {(wms.revisions ?? [wms]).map((r: any) => (
                <div key={r.id} className="flex items-center justify-between text-xs py-2 border-b border-ink-100 last:border-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-ink-900">Rev {r.revision}</span>
                    <Badge className={WMS_STATUS_BADGE[r.status] ?? "bg-ink-100 text-ink-500 border-ink-200"}>
                      {WMS_STATUS_LABELS[r.status] ?? r.status}
                    </Badge>
                    <span className="text-ink-500">{r.changeSummary || "Standing work method statement"}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-ink-400 tabular-nums">
                      {(r.effectiveDate ?? r.preparedDate ?? r.createdAt ?? "").slice(0, 10)}
                    </span>
                    {r.id !== wms.id ? (
                      <Link href={`/wms/${r.id}`} className="text-brand-600 hover:underline">
                        View
                      </Link>
                    ) : (
                      <span className="text-ink-400 font-semibold">Current</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── Corporate document header (matches the LIMSL paper format) ─── */}
        <div className="lg:col-span-3">
          <WmsDocumentHeader
            docNumber={wms.wmsNumber ?? "LIMSL-MAIN-WMS-XXX"}
            title={wms.title}
            revNo={wms.revision ?? 0}
            dateRevised={(wms.preparedDate ?? "").slice(0, 10).split("-").reverse().join(".")}
            procedureLabel="WORK METHOD STATEMENT"
            revisions={revisions}
          />
        </div>

        {/* Left Side: Document Sections */}
        <div className="lg:col-span-2 print:col-span-3 space-y-8">
          <article className="bg-surface border border-line rounded-xl shadow-card print:border-0">
            <header className="px-6 py-5 border-b border-line">
              <h2 className="text-xl font-semibold text-ink-900 leading-snug">{wms.title}</h2>
              <p className="text-sm text-ink-500 mt-1.5">
                Revision {wms.revision} · prepared by {wms.preparedByName ?? "—"}
              </p>
            </header>

            <div className="px-6 py-6 space-y-8">
              <Section n={1} heading="Purpose and scope">
                <Prose value={wms.purpose} />
                {wms.scope && <p>{wms.scope}</p>}
              </Section>

              {wms.mobilization && (
                <Section n={2} heading="Mobilisation and preparation">
                  <Prose value={wms.mobilization} />
                </Section>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <Section n={3} heading="Equipment and tools">
                  <ItemList items={tools} asText={asText} empty="No tools listed." />
                </Section>
                <Section n={4} heading="Materials required">
                  <ItemList items={materials} asText={asText} empty="No materials listed." />
                </Section>
              </div>

              <Section n={5} heading="Detailed work procedure">
                {procedureSteps.length === 0 ? (
                  <p className="text-ink-500">No procedure steps recorded.</p>
                ) : (
                  <ol className="space-y-3 mt-1">
                    {procedureSteps.map((step: unknown, i: number) => (
                      <li key={i} className="flex gap-3">
                        <span className="w-6 h-6 shrink-0 rounded-full bg-ink-100 border border-line text-ink-600 grid place-items-center text-xs font-semibold">
                          {(step as { step?: string })?.step ?? String.fromCharCode(65 + i)}
                        </span>
                        <p className="flex-1 text-sm text-ink-700 leading-relaxed">{asText(step)}</p>
                      </li>
                    ))}
                  </ol>
                )}
              </Section>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-2 border-t border-line">
                <Section n={6} heading="HSE controls">
                  <Prose value={wms.hseRequirements} />
                </Section>
                <Section n={7} heading="Quality assurance">
                  <Prose value={wms.qualityControlRequirements} />
                </Section>
              </div>
            </div>
          </article>
        </div>

        {/* Right side: what state the document is in, and why. */}
        <div className="space-y-6 no-print">
          <div className="bg-surface border border-line rounded-xl shadow-card overflow-hidden">
            <div className="px-6 py-4 border-b border-line flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-ink-900">Document status</h2>
              <Badge className={WMS_STATUS_BADGE[wms.status] ?? "bg-ink-500/10 text-ink-600 border-ink-500/20"}>
                {WMS_STATUS_LABELS[wms.status] ?? String(wms.status).toLowerCase().replace(/_/g, " ")}
              </Badge>
            </div>

            <div className="px-6 py-4 flex items-start gap-2.5 text-sm text-ink-600 leading-relaxed">
              <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-brand-600" />
              <p>
                The status is set by the authorisation chain below. It becomes{" "}
                <strong className="text-ink-900">approved</strong> only once every required signature is captured.
              </p>
            </div>
          </div>
        </div>

        {/* The chain runs the full width, under both columns. */}
        <div className="lg:col-span-3 space-y-6">
          <div className="no-print">
            <SignoffChain
              entityType="WMS"
              entityId={wmsId}
              title="Method statement authorisation"
            />
          </div>
          {/* Prints with the page, and only once the statement is approved. */}
          <DocumentSeal entityType="WMS" entityId={wmsId} />
        </div>
      </main>
    </div>
  );
}

// A numbered section of the statement. The number sits with the heading rather
// than in a coloured chip: it is an index into a controlled document, which is
// exactly the kind of thing a printed procedure sets in plain type.
function Section({ n, heading, children }: { n: number; heading: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-base font-semibold text-ink-900">
        <span className="text-ink-400 tabular-nums">{n}.</span>{" "}
        {heading}
      </h3>
      <div className="space-y-2 text-sm text-ink-700 leading-relaxed">{children}</div>
    </section>
  );
}

// An empty field says so. A heading with nothing under it reads as something
// that failed to render.
function Prose({ value }: { value?: string | null }) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return <p className="text-ink-500">Not recorded.</p>;
  return <p>{text}</p>;
}

function ItemList({
  items,
  asText,
  empty,
}: {
  items: unknown[];
  asText: (v: unknown) => string;
  empty: string;
}) {
  if (items.length === 0) return <p className="text-ink-500">{empty}</p>;
  return (
    <ul className="space-y-1.5">
      {items.map((it, i) => (
        <li key={i} className="flex gap-2.5">
          <span className="mt-2 w-1 h-1 rounded-full bg-ink-300 shrink-0" aria-hidden="true" />
          <span className="flex-1">{asText(it)}</span>
        </li>
      ))}
    </ul>
  );
}
