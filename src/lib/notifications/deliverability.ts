// src/lib/notifications/deliverability.ts
// Why a message that the app reported as "sent" never arrived.
//
// SMTP acceptance is not delivery. When the relay answers 250 it has taken
// responsibility for the message and nothing more; the receiving side may still
// quarantine it, and any bounce goes to the authenticated mailbox rather than
// back to this application. That gap is exactly where "the CMS says it sent it
// but I never got it" lives, and no amount of checking the send code closes it.
//
// What we CAN do is look at where the recipient's domain actually receives mail
// and compare it with who we are authenticating as, because the common failure
// has a predictable shape: an automated message from a free consumer mailbox
// (gmail.com, yahoo.com, outlook.com) addressed into a corporate tenant. Google
// Workspace and Microsoft 365 both treat that as suspicious, and Microsoft in
// particular quarantines rather than bounces, the message is not in Junk, it is
// in a portal the recipient has probably never opened.

import { resolveMx } from "node:dns/promises";

export type MailHost =
  | "MICROSOFT_365"
  | "GOOGLE_WORKSPACE"
  | "ZOHO"
  | "PROOFPOINT"
  | "MIMECAST"
  | "OTHER"
  | "NONE";

const CONSUMER_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "aol.com",
  "icloud.com",
  "protonmail.com",
  "yandex.com",
]);

export const domainOf = (address: string): string =>
  (address.split("@")[1] ?? "").trim().toLowerCase();

export const isConsumerDomain = (address: string): boolean =>
  CONSUMER_DOMAINS.has(domainOf(address));

export function classifyMailHost(mxHosts: string[]): MailHost {
  const all = mxHosts.join(" ").toLowerCase();
  if (!mxHosts.length) return "NONE";
  if (all.includes("protection.outlook.com") || all.includes("mail.protection")) return "MICROSOFT_365";
  if (all.includes("google.com") || all.includes("googlemail.com")) return "GOOGLE_WORKSPACE";
  if (all.includes("zoho")) return "ZOHO";
  if (all.includes("pphosted") || all.includes("proofpoint")) return "PROOFPOINT";
  if (all.includes("mimecast")) return "MIMECAST";
  return "OTHER";
}

export const MAIL_HOST_LABELS: Record<MailHost, string> = {
  MICROSOFT_365: "Microsoft 365 / Exchange Online",
  GOOGLE_WORKSPACE: "Google Workspace",
  ZOHO: "Zoho Mail",
  PROOFPOINT: "Proofpoint",
  MIMECAST: "Mimecast",
  OTHER: "a self-hosted or other mail provider",
  NONE: "no mail server",
};

export type Deliverability = {
  recipient: string;
  domain: string;
  mxHosts: string[];
  host: MailHost;
  hostLabel: string;
  senderDomain: string;
  senderIsConsumer: boolean;
  severity: "ok" | "warn" | "fail";
  headline: string;
  // Ordered, specific, and each one something the admin can actually go and do.
  actions: string[];
};

// Diagnose one recipient against the mailbox we authenticate as.
export async function diagnoseRecipient(
  recipient: string,
  senderAddress: string,
): Promise<Deliverability> {
  const domain = domainOf(recipient);
  const senderDomain = domainOf(senderAddress);
  const senderIsConsumer = isConsumerDomain(senderAddress);

  let mxHosts: string[] = [];
  let lookupFailed = false;
  try {
    const records = await resolveMx(domain);
    mxHosts = records.sort((a, b) => a.priority - b.priority).map((r) => r.exchange);
  } catch {
    lookupFailed = true;
  }

  const host = classifyMailHost(mxHosts);
  const hostLabel = MAIL_HOST_LABELS[host];
  const base = { recipient, domain, mxHosts, host, hostLabel, senderDomain, senderIsConsumer };

  // No MX at all: nothing this app does will ever deliver here.
  if (lookupFailed || host === "NONE") {
    return {
      ...base,
      severity: "fail",
      headline: `${domain} publishes no mail server (no MX record), so no mail can be delivered to it.`,
      actions: [
        `Confirm the address is spelt correctly, ${recipient}`,
        `If the domain is new, its DNS may not have propagated yet.`,
        `Until ${domain} has an MX record, use an address on a domain that does.`,
      ],
    };
  }

  // Same domain both ends: internal mail, and about as reliable as it gets.
  if (senderDomain && senderDomain === domain) {
    return {
      ...base,
      severity: "ok",
      headline: `${domain} receives mail via ${hostLabel}, and the CMS authenticates as an address on that same domain, this is internal mail and should arrive reliably.`,
      actions: [],
    };
  }

  // The common, silent failure.
  if (senderIsConsumer && (host === "MICROSOFT_365" || host === "GOOGLE_WORKSPACE" || host === "PROOFPOINT" || host === "MIMECAST")) {
    const quarantines = host === "MICROSOFT_365" || host === "PROOFPOINT" || host === "MIMECAST";
    return {
      ...base,
      severity: "warn",
      headline:
        `${domain} receives mail via ${hostLabel}, but the CMS sends as a ${senderDomain} address. ` +
        `Automated mail from a consumer mailbox into a corporate tenant is filtered hard` +
        (quarantines
          ? ", and Microsoft-style filtering QUARANTINES rather than bounces, so the message is neither in the inbox nor in Junk, and nobody is told."
          : " and usually lands in Junk."),
      actions: [
        quarantines
          ? `Ask the ${domain} administrator to check the quarantine (Microsoft 365: security.microsoft.com → Review → Quarantine) and release the message. That confirms the diagnosis in under a minute.`
          : `Check the recipient's Junk/Spam folder first, that confirms the diagnosis in under a minute.`,
        `The real fix: authenticate as a ${domain} mailbox instead. Set SMTP_HOST=smtp.office365.com, SMTP_PORT=587, SMTP_SECURE=false, and SMTP_USER/SMTP_PASS to a ${domain} account. Mail then travels inside the tenant and is effectively never filtered.`,
        `Alternative: use a transactional relay (Resend, SendGrid, Postmark) with SPF, DKIM and DMARC published for ${domain}. This is the right answer if the CMS must mail several external domains.`,
        `Interim: have the ${domain} administrator allow-list ${senderAddress} as a trusted sender.`,
      ],
    };
  }

  // Cross-domain but sending from a real domain, workable, but only if that
  // domain's authentication records are actually published.
  return {
    ...base,
    severity: "warn",
    headline: `${domain} receives mail via ${hostLabel}. The CMS sends as ${senderDomain}, so delivery depends on ${senderDomain}'s SPF, DKIM and DMARC records being correct.`,
    actions: [
      `Check the recipient's Junk/Spam folder.`,
      `Verify SPF, DKIM and DMARC are published for ${senderDomain}, without them a corporate receiver will distrust the message.`,
      `If ${domain} is your own organisation, authenticating as a ${domain} mailbox removes the problem entirely.`,
    ],
  };
}
