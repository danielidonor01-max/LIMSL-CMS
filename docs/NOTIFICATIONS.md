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

### Quick start: send from a Gmail account

Simplest option if you don't run your own mail server. Uses a Gmail **App
Password** (works for personal Gmail and Google Workspace):

1. On the sending account, turn on **2-Step Verification**
   (myaccount.google.com → Security).
2. Create an **App Password** (Security → App passwords → app "Mail") — a 16-char
   code. Use it as `SMTP_PASS` (not your normal Gmail password).
3. `.env.local`:
   ```bash
   EMAIL_ENABLED=true
   EMAIL_FROM="LIMSL CMS <danielidonor01@gmail.com>"   # must be the Gmail address
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=danielidonor01@gmail.com
   SMTP_PASS=<16-char app password>
   APP_URL=http://localhost:3005                       # or the real host
   ```

> The **From** must be the authenticated Gmail address — Gmail rewrites a
> mismatched From (e.g. `no-reply@leemachinery.net`) back to the account, which
> can hurt deliverability. Free Gmail sends to ~500 recipients/day, plenty for a
> workshop.

Common hosts for `SMTP_HOST` / port:
- **Google Workspace** — `smtp.gmail.com`, 587, and an **App Password** (needs
  2-Step Verification on the sending account) as `SMTP_PASS`.
- **Microsoft 365** — `smtp.office365.com`, 587 (SMTP AUTH must be enabled for the
  mailbox in the M365 admin centre).
- **cPanel / webmail** — `mail.leemachinery.net`, 465 (`SMTP_SECURE=true`) or 587,
  using the full mailbox address + its password.
- **Resend / SendGrid (transactional)** — their SMTP host + an API key as the
  password; verify the `leemachinery.net` domain for best deliverability.

### On Vercel (hosted deploy)

Set the same variables under **Vercel → Project → Settings → Environment
Variables** (all environments), then **redeploy** so they take effect — `.env.local`
is not used in the cloud. Never commit secrets; they live only in Vercel + the
gitignored `.env.local` for local runs.

**Verify it:** *App Settings → Notifications & Email → Email Delivery* (Super Admin):
1. The section shows a **Configured / Not configured** status pill. When not
   configured it lists the exact variables still missing.
2. **Verify connection** opens the SMTP connection and authenticates — proving the
   host/port/credentials are right — without sending anything.
3. **Send test** sends a real message to the address you type (or your own
   account's email) and reports success/failure.

No need to trigger a real alert to test.

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

## Turning on WhatsApp delivery

LIMSL CMS supports three WhatsApp delivery providers:
1. **OpenWA Gateway (Recommended)** — Self-hosted, 100% free, sends dynamic free-text messages to technicians and supervisors with zero per-message cost and no template pre-approvals.
2. **Meta Cloud API** — Official Meta WhatsApp Business Cloud API (requires pre-approved templates).
3. **Twilio** — Cloud messaging provider (useful for testing in sandbox).

### 1. OpenWA Gateway (Self-Hosted REST Gateway — Recommended)

OpenWA is a self-hosted REST API wrapper around WhatsApp Web. It connects to your corporate or workshop dispatch phone via a one-time QR scan and delivers instant notifications to technicians.

**Primary Workshop Dispatch Number:** `09167653581` (`+2349167653581`)

#### Configuration (`.env.local`):
```bash
WHATSAPP_ENABLED=true
WHATSAPP_PROVIDER=OPENWA
OPENWA_BASE_URL=http://localhost:3000
OPENWA_SESSION_ID=dispatch-main
OPENWA_API_KEY=your_secret_api_key          # optional, leave blank if no key required
OPENWA_PRIMARY_PHONE=2349167653581
```

#### How it sends:
LIMSL normalizes stored Nigerian phone numbers (e.g. `09167653581` or `+2349167653581`) to standard international digits and issues a `POST` request to:
```http
POST /api/sessions/dispatch-main/messages/send-text
Content-Type: application/json
X-API-Key: your_secret_api_key

{
  "chatId": "2349167653581@c.us",
  "text": "LIMSL CMS: Urgent PTW authorization requested for Hot Work on LEE/PE/1904. Review at ..."
}
```

#### Running OpenWA via Docker:
Run the OpenWA gateway container on your local workshop server or docker host:
```bash
docker run -d \
  --name openwa-gateway \
  -p 3000:3000 \
  -v openwa_data:/app/sessions \
  -e API_KEY=your_secret_api_key \
  rmyndharis/openwa:latest
```
Open `http://localhost:3000` in a browser, scan the pairing QR code with the dispatch phone (`09167653581`), and OpenWA persists the session automatically.

#### Operational Safety & Anti-Ban Rules:
1. **Staff Only**: LIMSL CMS only dispatches to registered employees, technicians, and supervisors.
2. **Save Contact**: Ensure every technician saves the dispatch number `09167653581` in their phone contacts as **"Lee Machinery Safety Desk"** or **"LIMSL Dispatch"**. When messages come from a saved contact, WhatsApp does not flag the account as spam.

---

### 2. Meta WhatsApp Cloud API (Alternative)

Set these in **`.env.local`**:

```bash
WHATSAPP_ENABLED=true
WHATSAPP_PROVIDER=META
WHATSAPP_TOKEN=<permanent access token from Meta>
WHATSAPP_PHONE_NUMBER_ID=<your WhatsApp phone number id>
WHATSAPP_TEMPLATE=limsl_alert          # your approved template name
WHATSAPP_TEMPLATE_LANG=en
WHATSAPP_API_VERSION=v21.0
```

1. Create a Meta Business app with the **WhatsApp** product; get a phone number id and a **permanent** access token.
2. **Approve a message template** with category *Utility* and one parameter `{{1}}`:
   > `*LIMSL CMS*: {{1}}`
3. Put each staff member's real WhatsApp number (E.164, e.g. `+2349167653581`) in the user admin screen.

---

### 3. Twilio (Alternative)

```bash
WHATSAPP_ENABLED=true
WHATSAPP_PROVIDER=TWILIO
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886   # your Twilio WhatsApp sender
```

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
