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

## 2. Create the schema

From your machine, with the DB URL exported:

```bash
# use the 6543 pooler URL (or the 5432 direct URL) — either works for this step
export DATABASE_URL="postgresql://postgres.<ref>:<password>@<host>.pooler.supabase.com:6543/postgres"
npx drizzle-kit push          # creates every table from schema.ts
npx tsx src/lib/db/seed-auth.ts        # seed the login accounts (password: limsl2026)
# optional demo data:
npx tsx src/lib/db/migrate-and-seed.ts
```

> Real go-live data goes in through the app: **Administration → Data Import**
> (equipment, schedule, users). You don't have to seed demo data.

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
