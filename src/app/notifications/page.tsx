// src/app/notifications/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  CheckCheck,
  ShieldCheck,
  AlertTriangle,
  FileText,
  BookText,
  ClipboardCheck,
  MessageCircle,
  Mail,
} from "lucide-react";
import Button from "@/components/Button";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import TableSkeleton from "@/components/TableSkeleton";
import {
  classify,
  sortNotifications,
  CATEGORY_LABEL,
  CATEGORY_TONE,
  CATEGORY_FILTERS,
} from "@/lib/notifications/categories";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";

type Notif = {
  id: string;
  event: string;
  relatedEntityType?: string | null;
  title: string;
  body: string;
  linkPath: string | null;
  readAt: string | null;
  channel: string;
  deliveryStatus: string;
  deliveryError: string | null;
  createdAt: string;
};

// The row used to say "WhatsApp" whatever the channel actually was, so every
// email notification reported itself as a WhatsApp message.
const CHANNEL_LABELS: Record<string, string> = {
  EMAIL: "Email",
  WHATSAPP: "WhatsApp",
  IN_APP: "In-app only",
};

const DELIVERY_LABELS: Record<string, string> = {
  // "Sent" would overstate it, since SMTP acceptance is not delivery, but that
  // distinction only matters to us. It is no longer shown for a message that
  // went out, so only the two states a person can act on need wording.
  SENT: "sent",
  QUEUED: "queued",
  SKIPPED: "not sent, no contact details on file",
  FAILED: "could not be sent",
};

// The two delivery states that change what somebody does: add a phone number or
// an email, or find out why the server refused it.
const NEEDS_ATTENTION = new Set(["SKIPPED", "FAILED"]);

const EVENT_ICON: Record<string, React.ElementType> = {
  PTW_SIGN_REQUEST: ShieldCheck,
  WMS_SIGN_REQUEST: FileText,
  PROCEDURE_SIGN_REQUEST: BookText,
  PM_SIGN_REQUEST: ClipboardCheck,
  CORRECTIVE_SIGN_REQUEST: AlertTriangle,
  BREAKDOWN: AlertTriangle,
  GENERAL: Bell,
};

const DELIVERY_BADGE: Record<string, string> = {
  SENT: "bg-brand-500/10 text-brand-600 border-brand-500/20",
  QUEUED: "bg-warn-500/10 text-warn-700 border-warn-500/20",
  SKIPPED: "bg-ink-200 text-ink-500 border-ink-300",
  FAILED: "bg-danger-500/10 text-danger-600 border-danger-500/20",
};

export default function NotificationsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Notif[]>([]);
  const [filter, setFilter] = useState<(typeof CATEGORY_FILTERS)[number]>("ALL");
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const res = await fetch("/api/notifications");
      if (res.ok) {
        const d = await res.json();
        setRows(d.notifications ?? []);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // Urgent-unread first, then newest. Strictly by date is what buried a permit
  // expiry under three procedure revisions, and the permit is the one with a
  // crew waiting on it.
  const ordered = useMemo(() => sortNotifications(rows), [rows]);
  const visible = useMemo(
    () => (filter === "ALL" ? ordered : ordered.filter((n) => classify(n).category === filter)),
    [ordered, filter],
  );
  const countFor = (c: (typeof CATEGORY_FILTERS)[number]) =>
    c === "ALL" ? rows.length : rows.filter((n) => classify(n).category === c).length;

  async function markAll() {
    const res = await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
    if (res.ok) {
      toast.success("All notifications marked read.");
      load();
    }
  }

  async function open(n: Notif) {
    if (!n.readAt) {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: n.id }),
      });
    }
    if (n.linkPath) router.push(n.linkPath);
    else load();
  }

  const unread = rows.filter((r) => !r.readAt).length;

  return (
    <div className="min-h-screen bg-canvas text-ink-900 font-sans">
      <main className="flex-1 p-6 lg:p-8 max-w-3xl w-full mx-auto space-y-8">
        <PageHeader
          title="Notifications"
          subtitle={`${unread > 0 ? `${unread} unread` : "All caught up"} · alerts are also sent to WhatsApp when configured`}
          actions={
            unread > 0 ? (
              <Button variant="secondary" icon={CheckCheck} onClick={markAll}>
                Mark all read
              </Button>
            ) : undefined
          }
        />

        {/* Categories, so a breakdown and a procedure revision are not the
            same thing at the same weight. Empty ones are not offered. */}
        {!loading && rows.length > 0 && (
          <div className="flex flex-wrap gap-1 bg-ink-100 border border-ink-200 rounded-lg p-1 w-fit">
            {CATEGORY_FILTERS.filter((c) => countFor(c) > 0).map((c) => (
              <button
                key={c}
                onClick={() => setFilter(c)}
                className={`px-3 min-h-9 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
 filter === c ? "bg-white text-brand-600 shadow-card" : "text-ink-500 hover:text-ink-900"
 }`}
              >
                {c === "ALL" ? "All" : CATEGORY_LABEL[c]}{" "}
                <span className="tabular-nums font-normal">({countFor(c)})</span>
              </button>
            ))}
          </div>
        )}

        <div className="bg-surface border border-line rounded-xl shadow-card overflow-hidden">
          {loading ? (
            <TableSkeleton rows={5} cols={3} />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={Bell}
              title="Nothing to read"
              message="Sign-off requests, breakdown alerts and expiry reminders will appear here as they are raised."
              actionLabel="Go to Dashboard"
              actionHref="/"
            />
          ) : visible.length === 0 ? (
            <EmptyState
              icon={Bell}
              title="Nothing in this category"
              message="Try another category, or All."
            />
          ) : (
            <div className="divide-y divide-ink-200">
              {visible.map((n) => {
                const Icon = EVENT_ICON[n.event] ?? Bell;
                const { category, priority } = classify(n);
                return (
                  <button
                    key={n.id}
                    onClick={() => open(n)}
                    className={`w-full text-left p-4 flex items-start gap-3 hover:bg-ink-50 transition-colors ${
 n.readAt ? "" : "bg-brand-50/40"
 }`}
                  >
                    <div className={`mt-0.5 p-1.5 rounded-lg ${n.readAt ? "text-ink-400 bg-ink-100" : "text-brand-600 bg-brand-500/10"}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {!n.readAt && <span className="w-1.5 h-1.5 rounded-full bg-brand-500 shrink-0" />}
                        <p className={`text-sm ${n.readAt ? "font-medium text-ink-700" : "font-bold text-ink-900"}`}>{n.title}</p>
                        {/* Category on every row, colour on one. A fire alarm
                            and a memo used to look identical here. */}
                        <span
                          className={`text-xs font-semibold px-1.5 py-0.5 rounded-full border ${CATEGORY_TONE[category]}`}
                        >
                          {CATEGORY_LABEL[category]}
                        </span>
                        {priority === "URGENT" && !n.readAt && (
                          <span className="text-xs font-semibold text-danger-600">Needs attention</span>
                        )}
                      </div>
                      <p className="text-xs text-ink-500 mt-0.5">{n.body}</p>
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-ink-500 flex-wrap">
                        <span className="tabular-nums">{formatDate(n.createdAt)}</span>
                        {/* Only when it needs a decision. A message that went
                            out as expected is not news, and saying so on every
                            row buried the two states that are. */}
                        {NEEDS_ATTENTION.has(n.deliveryStatus) && (
                          <span className="inline-flex items-center gap-1">
                            {n.channel === "EMAIL" ? <Mail className="w-3 h-3" /> : <MessageCircle className="w-3 h-3" />}
                            <span
                              className={`px-1.5 py-0.5 rounded-full border ${DELIVERY_BADGE[n.deliveryStatus] ?? "bg-ink-100 text-ink-500 border-ink-200"}`}
                            >
                              {CHANNEL_LABELS[n.channel] ?? n.channel} ·{" "}
                              {DELIVERY_LABELS[n.deliveryStatus] ?? n.deliveryStatus.toLowerCase()}
                            </span>
                          </span>
                        )}
                      </div>
                      {/* The reason was recorded and shown to nobody. */}
                      {n.deliveryStatus === "FAILED" && n.deliveryError && (
                        <p className="mt-1.5 text-xs text-danger-700 bg-danger-50 border border-danger-200 rounded-lg px-2 py-1 leading-relaxed">
                          {n.deliveryError}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <p className="text-xs text-ink-400 text-center">
          WhatsApp delivery is best-effort, an alert always lands here in-app even if the message can&apos;t be delivered.
        </p>
      </main>
    </div>
  );
}
