# Notifications — In-app, Email & WhatsApp

**Status:** In-app inbox is live now. **Email (SMTP) and WhatsApp are both built**
and turn on when credentials are set. Until a channel is configured, every alert
is still recorded and shown in-app (marked `QUEUED`), never lost, never faked as
sent.

**Channel choice:** when email is configured, alerts go by **email** (reliable +
auditable); if only WhatsApp is configured, they go by WhatsApp; the in-app inbox
always has the copy either way.

## Email (SMTP) — recommended, works today

Delivery is nodemailer over SMTP, so it works with whatever mailbox
`leemachinery.net` already uses. Set these in `.env.local` and restart:

```bash
EMAIL_ENABLED=true
EMAIL_FROM="LIMSL CMS <no-reply@leemachinery.net>"
APP_URL=https://<your-host>          # makes the "Open in LIMSL CMS" links absolute
SMTP_HOST=smtp.example.net
SMTP_PORT=587                        # 587 = STARTTLS (SMTP_SECURE=false), 465 = SSL (SMTP_SECURE=true)
SMTP_SECURE=false
SMTP_USER=no-reply@leemachinery.net
SMTP_PASS=********
```

Common hosts for `SMTP_HOST` / port:
- **Google Workspace** — `smtp.gmail.com`, 587, and an **App Password** (needs
  2-Step Verification on the sending account) as `SMTP_PASS`.
- **Microsoft 365** — `smtp.office365.com`, 587 (SMTP AUTH must be enabled for the
  mailbox in the M365 admin centre).
- **cPanel / webmail** — `mail.leemachinery.net`, 465 (`SMTP_SECURE=true`) or 587,
  using the full mailbox address + its password.
- **Resend / SendGrid (transactional)** — their SMTP host + an API key as the
  password; verify the `leemachinery.net` domain for best deliverability.

**Verify it:** *App Settings → Email Delivery → "Send test email"* (Super Admin).
It sends a real message to the address you type (or your own account's email) and
reports success/failure — no need to trigger a real alert to test.

Recipients are resolved from **roles → the user's `email`** (set in the user admin
screen or via Data Import), so no addresses are hardcoded.

## How it works

Every notifiable event writes one `notifications` row per recipient. That row is
**both** the in-app inbox entry (the bell in the top bar → `/notifications`) **and**
the WhatsApp delivery record. Recipients are resolved from **roles → the user's
`whatsapp` number** (set in the user admin screen) — no hardcoded numbers.

Delivery is **best-effort and never blocks a write**: a WhatsApp outage can never
stop a permit, work order, or breakdown from being saved.

`deliveryStatus` is honest:
| Status | Meaning |
|---|---|
| `SENT` | delivered by the provider |
| `QUEUED` | recorded, but WhatsApp isn't configured yet (or was skipped) |
| `SKIPPED` | recipient has no WhatsApp number on file |
| `FAILED` | provider rejected it (see `deliveryError`) |

## What triggers an alert

- **Sign-off requests** — whoever must sign the *next* step of any sign-off chain is
  notified when the chain is created and after each signature. This one hook covers
  **PTW, WMS, Maintenance Procedure, PM checklists, and corrective records** — every
  module that uses the sign-off engine.
- **Breakdown logged** — a new corrective record alerts the Maintenance Manager,
  Foreman, and HSE.

To add a trigger: `import { notify } from "@/lib/notifications"` and call it with an
`event`, `title`, `body`, optional `linkPath`, and the recipient `roles` / `userIds`.
It resolves recipients, records rows, and delivers — all best-effort.

## Turning on WhatsApp delivery (Meta WhatsApp Cloud API)

Set these in **`.env.local`** (gitignored — never commit them):

```
WHATSAPP_ENABLED=true
WHATSAPP_PROVIDER=META
WHATSAPP_TOKEN=<permanent access token from Meta>
WHATSAPP_PHONE_NUMBER_ID=<your WhatsApp phone number id>
WHATSAPP_TEMPLATE=limsl_alert          # your approved template name
WHATSAPP_TEMPLATE_LANG=en
WHATSAPP_API_VERSION=v21.0
```

Steps:
1. Create a Meta Business app with the **WhatsApp** product; get a phone number id
   and a **permanent** access token (a system-user token, not the 24h test one).
2. **Approve a message template** — this is the part people miss. Meta does **not**
   allow proactive free-text messages; a business-initiated message must use a
   pre-approved template. Create one (category *Utility*) whose body is a single
   parameter, e.g.:
   > `*LIMSL CMS*: {{1}}`

   Name it `limsl_alert` (or set `WHATSAPP_TEMPLATE` to whatever you named it). We
   send the alert text as that one `{{1}}` parameter.
3. Put each staff member's real WhatsApp number (E.164, e.g. `+2348030000001`) in
   the user admin screen. The seed ships **placeholder** `+23480300000xx` numbers so
   the demo works — replace them.
4. Set the env vars above and restart. `whatsappReady()` gates delivery; if anything
   is missing, alerts stay `QUEUED` and in-app still works.

### Alternative: Twilio

```
WHATSAPP_ENABLED=true
WHATSAPP_PROVIDER=TWILIO
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886   # your Twilio WhatsApp sender
```

Twilio's sandbox lets you send free-form text while testing (recipients must join
the sandbox first). Production still routes through Meta's template rules.

## Overdue escalations

A scheduled scan that actively chases overdue work instead of waiting for someone
to open a page. `runEscalations()` (`src/lib/escalations.ts`):

1. reconciles the schedule + permits to today,
2. **due-soon reminders** — activities due within `REMINDER_LEAD_DAYS` (default 3)
   are sent to the responsible person as a heads-up *before* they go overdue,
3. groups **overdue maintenance activities** by responsible person and sends each
   one a single digest ("you have N overdue activities: …"),
4. sends the maintenance leadership one plant-wide overdue summary,
5. sends the permit-issuing authority (HSE) a digest of **lapsed permits**
   (`EXPIRED` — never closed out).

Digests, not one-per-item, so a backlog of 70 doesn't send 70 messages. A per-day
dedup guard (checks the `notifications` table for a matching `ESCALATION` row in
the last 20h) makes the scan safe to run repeatedly.

**Triggering** — `POST /api/escalations/run`, two ways in:

- **Super Admin button** — *App Settings → Overdue Escalations → "Run escalation
  now"*. Works today, no setup.
- **Scheduler** — present `Authorization: Bearer $CRON_SECRET`. Set `CRON_SECRET`
  in `.env.local`, then point any daily scheduler at the endpoint, e.g.:

  ```bash
  curl -X POST https://<host>/api/escalations/run \
    -H "Authorization: Bearer $CRON_SECRET"
  ```

  On Windows, a daily **Task Scheduler** job running that curl works; on a Linux
  host, a `cron` entry or the platform's cron (e.g. Vercel Cron) does.

Without `CRON_SECRET` the endpoint still works for a signed-in Super Admin; the
token only exists so an unattended scheduler can call it.

## Files

- `src/lib/notifications/index.ts` — dispatcher, recipient resolution, `notifyNextSigner`.
- `src/lib/escalations.ts` — `runEscalations()` overdue/lapsed digest scan.
- `src/app/api/escalations/run/route.ts` — trigger (CRON_SECRET token or Super Admin).
- `src/lib/notifications/whatsapp.ts` — Meta + Twilio send adapters.
- `src/lib/config.ts` — `whatsappReady()` and env config.
- `src/app/api/notifications/route.ts` — in-app inbox (GET) + mark-read (PATCH).
- `src/app/notifications/page.tsx`, `src/components/NotificationBell.tsx` — UI.
- Hooks: `src/lib/signoff/service.ts`, `src/app/api/signoffs/[id]/route.ts`,
  `src/app/api/corrective/route.ts`.
