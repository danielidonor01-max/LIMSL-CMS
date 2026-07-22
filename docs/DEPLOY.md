# Deploying to Vercel + Supabase

The app runs on **Postgres (Supabase)** and deploys to **Vercel**. Files are
stored in **Supabase Storage** (Vercel's filesystem is ephemeral). SQLite is gone.

## 1. Create the Supabase project

1. Create a project at supabase.com. Pick a region near your users.
2. **Project Settings → Database → Connection string.** You'll use two forms:
   - **Transaction pooler** (host `...pooler.supabase.com`, port **6543**) — this
     is `DATABASE_URL` for the app (serverless-safe).
   - **Direct / Session** (port **5432**) — fine for running migrations/seeds from
     your machine.

## 2. Create the schema + accounts

Run from your machine using the **Session pooler** (port **5432**) — the direct
`db.<ref>.supabase.co` host is not reachable over IPv4, and 5432 is better for
DDL/seeds than the transaction pooler:

```bash
export DATABASE_URL="postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres"
npx tsx src/lib/db/migrate-and-seed.ts     # tables + users + demo data
npx tsx src/lib/db/seed-roles-signoff.ts   # full role accounts (COO, FM, MM, HSE, QA…)
npx tsx src/lib/db/seed-auth.ts            # sets password limsl2026 + force-change on first login
```

Login accounts after this: one per role, all password **`limsl2026`** (forced
change on first login). Super Admin is `daniel.idonor@limsl.com`.

> The **app** (locally and on Vercel) uses the **Transaction pooler**, port
> **6543**, in `DATABASE_URL`. Real go-live data goes in through the app:
> **Administration → Data Import** (equipment, schedule, users).

## 3. Create the storage bucket

Supabase → **Storage → New bucket** named `limsl-documents` (private). Grab the
**service role key** from Project Settings → API.

## 4. Vercel environment variables

Add these in Vercel → Project → Settings → Environment Variables (Production):

```bash
# Database (Transaction pooler, port 6543)
DATABASE_URL=postgresql://postgres.<ref>:<password>@<host>.pooler.supabase.com:6543/postgres

# Auth (generate: `openssl rand -base64 32`)
AUTH_SECRET=<random 32+ char secret>

# App URL (used for links in emails) — your Vercel domain
APP_URL=https://<your-app>.vercel.app

# File storage → Supabase
STORAGE_PROVIDER=SUPABASE
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SERVICE_KEY=<service role key>
SUPABASE_BUCKET=limsl-documents

# Email (see docs/NOTIFICATIONS.md — Gmail App Password shown here)
EMAIL_ENABLED=true
EMAIL_FROM=LIMSL CMS <danielidonor01@gmail.com>
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=danielidonor01@gmail.com
SMTP_PASS=<gmail app password>

# Overdue/due-soon escalation cron trigger (optional)
CRON_SECRET=<random secret>
```

Then **redeploy** (Vercel → Deployments → Redeploy, or push a commit).

## 5. Local development

Local dev now also uses Postgres — there is no SQLite file. Put the same vars in
`.env.local` (you can point `DATABASE_URL` at the same Supabase project, or a
second Supabase project for dev), then `npm run dev`.

## Notes

- `DATABASE_URL` must be the **6543 pooler** URL on Vercel; `prepare:false` is
  already set for pgBouncer transaction mode.
- Migrations are not committed (`drizzle/` is gitignored) — regenerate with
  `npx drizzle-kit generate` or just use `npx drizzle-kit push`.
- The Vercel build does **not** connect to the database; it only needs the env
  vars present at runtime.
