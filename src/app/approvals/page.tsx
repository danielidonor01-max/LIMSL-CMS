// src/app/approvals/page.tsx
// One queue for everything waiting on your signature.
//
// Before this, a supervisor's morning was: open work orders and filter, open
// corrective and filter, open method statements, open hazard analyses, open
// permits, and hope nothing was missed in a module they did not think to check.
// The sign-off engine knew all of it the whole time; nothing asked it.
"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { ChevronRight, PenLine, UserCheck } from "lucide-react";
import { useApi } from "@/lib/api-cache";
import PageLead from "@/components/PageLead";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import TableSkeleton from "@/components/TableSkeleton";
import LoadError from "@/components/LoadError";
import { ROLE_LABELS } from "@/lib/roles";

type Item = {
  signoffId: string;
  entityType: string;
  entityId: string;
  roleLabel: string;
  personal: boolean;
  kind: string;
  href: string;
  title: string;
  code: string | null;
};

export default function ApprovalsPage() {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string })?.role;
  const { data: items, loading, error, refresh } = useApi<Item[]>("/api/approvals", []);

  const count = items?.length ?? 0;
  const personal = items?.filter((i) => i.personal).length ?? 0;

  return (
    <div className="min-h-screen bg-canvas text-ink-900 flex flex-col font-sans">
      <main className="flex-1 p-6 lg:p-8 max-w-5xl w-full mx-auto space-y-8">
        <PageHeader
          title="Awaiting your signature"
          subtitle="Every document across the system that cannot move until you sign it"
          backHref="/"
          backLabel="Dashboard"
        />

        {error ? (
          <LoadError onRetry={refresh} />
        ) : loading ? (
          <div className="bg-surface border border-line rounded-2xl shadow-card overflow-hidden">
            <TableSkeleton rows={4} cols={3} />
          </div>
        ) : (
          <>
            <PageLead
              headingId="approvals-lead"
              headline={
                count === 0
                  ? "Nothing is waiting on you."
                  : count === 1
                    ? "One document is waiting on your signature."
                    : `${count} documents are waiting on your signature.`
              }
              supporting={
                count === 0
                  ? "Every chain you can sign is either complete or waiting on somebody else."
                  : "Ordered by what holds up work. A permit keeps a crew standing at a machine; a procedure revision does not."
              }
              actions={count === 0 ? [{ href: "/schedule", label: "Open the schedule" }] : []}
              figure={{
                label: "Waiting on you",
                value: String(count),
                tone: count === 0 ? "good" : count > 5 ? "bad" : "warn",
              }}
              stats={[
                { label: "in your name", value: personal, tone: "warn" },
                { label: "by role", value: count - personal },
              ]}
              meta={<span>Signing as {ROLE_LABELS[role ?? ""] ?? "your role"}</span>}
            />

            {count === 0 ? (
              <EmptyState
                icon={UserCheck}
                title="Your queue is clear"
                message="When a document reaches a step you can sign, it appears here."
              />
            ) : (
              <div className="bg-surface border border-line rounded-2xl shadow-card overflow-hidden divide-y divide-line">
                {items!.map((i) => (
                  <Link
                    key={i.signoffId}
                    href={i.href}
                    className="flex items-start justify-between gap-4 px-6 py-4 hover:bg-ink-50 transition-colors group"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold tracking-[0.08em] text-ink-500">
                          {i.kind}
                        </span>
                        {i.code && (
                          <span className="text-xs text-ink-500">{i.code}</span>
                        )}
                        {/* A step addressed to one person is not something a
                            colleague can pick up, so it says so. */}
                        {i.personal && (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full border bg-warn-500/10 text-warn-700 border-warn-500/20">
                            In your name
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-medium text-ink-900 line-clamp-2">{i.title}</p>
                      <p className="text-xs text-ink-600 inline-flex items-center gap-1.5">
                        <PenLine className="w-3.5 h-3.5 shrink-0" />
                        {i.roleLabel}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-ink-300 group-hover:text-ink-900 shrink-0 mt-1" />
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
