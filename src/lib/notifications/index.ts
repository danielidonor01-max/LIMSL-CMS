// src/lib/notifications/index.ts
// Notification dispatch. Every notifiable event is recorded (the `notifications`
// table is both an in-app inbox and a delivery outbox) and then, best-effort,
// delivered over WhatsApp when a provider is configured. Delivery NEVER blocks or
// fails the originating write — a WhatsApp outage must not stop a permit or work
// order from being saved.
//
// Email is a later phase; an EMAIL channel row is recorded as QUEUED but not sent.
import { db } from "@/lib/db";
import { notifications, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { whatsappReady, emailReady } from "@/lib/config";
import { parsePrefs } from "@/lib/user-prefs";
import { sendWhatsApp } from "./whatsapp";
import { sendEmail } from "./email";

export type NotifyEvent =
  | "PTW_SIGN_REQUEST"
  | "WMS_SIGN_REQUEST"
  | "PROCEDURE_SIGN_REQUEST"
  | "PM_SIGN_REQUEST"
  | "CORRECTIVE_SIGN_REQUEST"
  | "BREAKDOWN"
  | "ESCALATION"
  | "GENERAL";

type NotifyInput = {
  event: NotifyEvent;
  title: string;
  body: string;
  linkPath?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  // Recipients — resolved to active users. Provide roles and/or explicit user ids.
  roles?: string[];
  userIds?: string[];
};

// Resolve the set of recipient users from roles + explicit ids (active only).
async function resolveRecipients(roles?: string[], userIds?: string[]) {
  const all = await db.select().from(users);
  const active = all.filter((u) => u.isActive !== false);
  const byRole = roles?.length ? active.filter((u) => roles.includes(u.role)) : [];
  const byId = userIds?.length ? active.filter((u) => userIds.includes(u.id)) : [];
  // De-duplicate.
  const map = new Map<string, (typeof active)[number]>();
  for (const u of [...byRole, ...byId]) map.set(u.id, u);
  return [...map.values()];
}

// Record + best-effort-deliver a notification to each resolved recipient.
// Returns the created notification rows. Safe to await from any handler — it
// swallows delivery errors and only records their status.
export async function notify(input: NotifyInput) {
  let recipients;
  try {
    recipients = await resolveRecipients(input.roles, input.userIds);
  } catch (err) {
    console.warn("notify: failed to resolve recipients", err);
    return [];
  }
  if (recipients.length === 0) return [];

  const emailOn = emailReady().ready;
  const waOn = whatsappReady().ready;
  type Pending = { id: string; userId: string; channel: "EMAIL" | "WHATSAPP" | "INAPP"; to: string | null };
  const created: Pending[] = [];

  for (const u of recipients) {
    const id = nanoid();
    // Prefer email when configured (reliable + auditable); fall back to WhatsApp.
    // Either way the row is the in-app inbox entry, so nothing is ever lost.
    let channel: Pending["channel"] = "INAPP";
    let to: string | null = null;
    // Honour the recipient's email opt-out; the in-app inbox row is still recorded.
    const prefs = parsePrefs(u.preferences);
    if (emailOn && u.email && prefs.notifyEmail) {
      channel = "EMAIL";
      to = u.email;
    } else if (waOn && u.whatsapp?.trim()) {
      channel = "WHATSAPP";
      to = u.whatsapp.trim();
    }
    await db.insert(notifications).values({
      id,
      userId: u.id,
      event: input.event,
      title: input.title,
      body: input.body,
      linkPath: input.linkPath ?? null,
      relatedEntityType: input.relatedEntityType ?? null,
      relatedEntityId: input.relatedEntityId ?? null,
      channel,
      recipientContact: to,
      // Honest status: QUEUED when we'll try to send, SKIPPED when there's no
      // configured channel/contact (still visible in the in-app inbox).
      deliveryStatus: to ? "QUEUED" : "SKIPPED",
    });
    created.push({ id, userId: u.id, channel, to });
  }

  // Deliver each queued notification over its chosen channel. Never throws.
  await Promise.all(
    created
      .filter((c) => c.to)
      .map(async (c) => {
        try {
          const res =
            c.channel === "EMAIL"
              ? await sendEmail(c.to!, input.title, input.body, input.linkPath)
              : await sendWhatsApp(c.to!, `*LIMSL CMS*\n${input.title}\n\n${input.body}`);
          await db
            .update(notifications)
            .set({
              deliveryStatus: res.ok ? "SENT" : "FAILED",
              providerMessageId: res.messageId ?? null,
              deliveryError: res.ok ? null : res.error ?? "unknown",
              sentAt: res.ok ? new Date().toISOString() : null,
            })
            .where(eq(notifications.id, c.id));
        } catch (err) {
          await db
            .update(notifications)
            .set({ deliveryStatus: "FAILED", deliveryError: String(err) })
            .where(eq(notifications.id, c.id));
        }
      }),
  );

  return created;
}

// Friendly label for the entity type a sign-off chain belongs to.
const ENTITY_LABEL: Record<string, string> = {
  PERMIT: "Permit-to-Work",
  PERMIT_CLOSEOUT: "Permit close-out",
  WMS: "Work Method Statement",
  PROCEDURE: "Maintenance Procedure",
  PM_CHECKLIST: "PM checklist",
  CORRECTIVE: "Corrective record",
};
const ENTITY_EVENT: Record<string, NotifyEvent> = {
  PERMIT: "PTW_SIGN_REQUEST",
  PERMIT_CLOSEOUT: "PTW_SIGN_REQUEST",
  WMS: "WMS_SIGN_REQUEST",
  PROCEDURE: "PROCEDURE_SIGN_REQUEST",
  PM_CHECKLIST: "PM_SIGN_REQUEST",
  CORRECTIVE: "CORRECTIVE_SIGN_REQUEST",
};
const ENTITY_LINK: Record<string, (id: string) => string> = {
  PERMIT: (id) => `/permits/${id}`,
  PERMIT_CLOSEOUT: (id) => `/permits/${id}`,
  WMS: (id) => `/wms/${id}`,
  PROCEDURE: (id) => `/procedure/${id}`,
  CORRECTIVE: (id) => `/corrective/${id}`,
};

// Notify whoever must sign the next pending step of a sign-off chain. Called when
// a chain is created and after each successful signature. Generic across every
// module that uses the sign-off engine.
export async function notifyNextSigner(
  entityType: string,
  entityId: string,
  chain: { stepOrder: number; role: string; roleLabel: string; required: boolean | null; status: string }[],
  reference?: string,
) {
  // Find the earliest still-pending required step whose predecessors are all signed.
  const pending = chain
    .filter((s) => s.required && s.status !== "SIGNED" && s.status !== "REJECTED")
    .sort((a, b) => a.stepOrder - b.stepOrder)[0];
  if (!pending) return;
  const earlierUnsigned = chain.some(
    (s) => s.required && s.stepOrder < pending.stepOrder && s.status !== "SIGNED",
  );
  if (earlierUnsigned) return;

  const label = ENTITY_LABEL[entityType] ?? entityType;
  const ref = reference ? ` ${reference}` : "";
  await notify({
    event: ENTITY_EVENT[entityType] ?? "GENERAL",
    title: `${label}${ref} awaits your sign-off`,
    body: `You are the "${pending.roleLabel}" for ${label}${ref}. Please review and sign.`,
    linkPath: ENTITY_LINK[entityType]?.(entityId),
    relatedEntityType: entityType,
    relatedEntityId: entityId,
    roles: [pending.role],
  });
}
