# LIMSL CMS — Handoff / Sync

**Last updated:** 2026-07-13 · by Claude (branch `phase-2`)

Read `AGENTS.md` first (the engineering rulebook — hard rules, roles, conventions).
This document is the *state of the world*: what exists, what's half-done, what's next.

---

## 1. Branch state

**RECONCILED as of 2026-07-13.** `phase-2` was merged into `main` (`ade7366`).
`main` is now the single source of truth and contains everything.

| Branch | Owner | State |
|---|---|---|
| `main` | Gemini | ✅ Everything. Start here. |
| `phase-2` | Claude | Same content; Claude's working branch. |

The merge had 5 conflicts, all from Gemini's alert→toast commit (`3e00b56`)
landing on files Claude had also re-themed. All were resolved by taking the
`phase-2` side, which was a strict superset:

| File | Why phase-2 won |
|---|---|
| `layout.tsx` | main was still **dark theme** and had no `Providers`/`AppShell` — would break auth, sidebar, every new module |
| `equipment/[assetId]/troubleshoot/page.tsx` | main's was a **stub** (fake success counter); phase-2 has the real diagnostic engine |
| `wms/[id]/page.tsx` | phase-2 adds `SignoffChain` + the crash-safe JSON rendering |
| `corrective/[id]/page.tsx` | phase-2 adds `SignoffChain` |
| `audit/non-conformity/page.tsx` | toast wording only |

Nothing of Gemini's was lost — his toast conversion already existed in `phase-2`
in equivalent form.

**Going forward:** merge before you diverge. If both agents touch the same files
again this will recur.

---

## 2. What is built (all on `phase-2`)

### Core
- **Equipment / asset register** — auto-generated `LEE/PE/XXXX` IDs (editable),
  QR pages, per-asset history, documents.
- **Preventive Maintenance** — schedule → work orders → PM checklist with drawn
  signatures. Completing a checklist closes the WO, closes the schedule activity,
  and rolls the equipment's last/next maintenance dates forward.
- **Corrective Maintenance / RCA** — CMRF numbering, fault classification, RCA,
  corrective actions.
- **Work Method Statements (WMS)** — authored, revisioned, signed.
- **KPI dashboard, Reports, Audit log, Non-conformities, Risk register.**

### Compliance backbone
- **Roles & access control** — `src/lib/roles.ts` is canonical. `canAccessPath`
  drives sidebar + page guard together. `requireRoles()` (`src/lib/authz.ts`)
  gates every mutating API.
- **Multi-level sign-off** — one generic `signoffs` table + declarative chains
  (`src/lib/signoff/chains.ts`): PM, CM, WMS, Procedure. Enforces role match
  **and** sequence.
- **Equipment Maintenance Procedure** (`/procedure`) — controlled document, word-
  for-word as the original, full revision history, printable. QA/QC proposes a
  revision → sign-off chain (Maintenance Manager → Factory Manager → COO) →
  auto-approves and supersedes the prior revision.
- **Super Admin user management** (`/settings/users`).

### Newest work (the last 4 commits — verify these first if something looks off)
- **Permits / PTW** (`/permits`) — issue, close out, cancel. Deep-linked from a
  work order ("Raise PTW" prefills equipment + WO). HSE can issue permits but
  *cannot* write work orders — that split is intentional.
- **OEM & Warranty** (`/oem`) — register vendor, log/close interventions;
  warranty expiry mirrors onto the equipment record.
- **Calibration** (`/calibration`) — "Record Calibration" auto-computes the next
  due date and status (CURRENT / DUE_SOON / OVERDUE).
- **Training & Competency** (`/training`) — `competency_matrix` table; skills
  matrix (person × skill area, level 0–4) with gaps ringed where
  `level < requiredLevel`, and recertification flags.
- **Unified shell** — `AppShell` + `Sidebar` + `PageHeader`; per-page `<header>`
  bars removed across 12 pages.

### Deliberately disabled
**Schematic ingestion engine.** All scaffolding is in place
(`src/lib/diagnostics/ingestion/*`, `docs/SCHEMATIC-ENGINE.md`) and switched off
via `src/lib/config.ts`. There is no Claude subscription. **Do not enable it.**
The *rule-based* diagnostic engine (`src/lib/diagnostics/engine.ts`) is live and
works: it ranks causes from guides + history + RCA, and learns from outcomes.

---

## 3. Verification status

- `npx tsc --noEmit` — clean
- `npx next build` — clean (51/51 pages)
- Driven end-to-end against a running server: auth, permit issue (201),
  competency upsert (200).
- **Access control proven by test, not assumption** — logged in as HSE:
  `POST /api/work-orders` → **403**, `POST /api/permits` → **201**,
  `POST /api/competency` → **403**.

---

## 4. Next tasks (agreed with Daniel, in order)

1. **Password lifecycle** — explicitly deferred to last by Daniel, so this is next
   up. Needs: enforce `mustChangePassword` at login, plus a self-service
   change-password page. The `users` table already has the column.
2. Dark theme (light is default and was an explicit requirement; dark is later).

### Known rough edges, not yet addressed
- The dashboard is not yet role-aware (every role sees the same tiles).
- Permits have no sign-off chain — they're issue/close only. If PTW needs
  HSE→Factory Manager authorisation like WMS, add a chain to `chains.ts`.
- `/permits/new` has no PPE "other" free-text field.

---

## 5. Traps that already caused bugs — don't re-introduce them

1. **Hydration mismatch.** The session resolves client-side only. Anything
   role-dependent rendered during SSR mismatches. Use the `mounted` guard
   (`AGENTS.md` §7). This already broke the sidebar once.
2. **Objects rendered as React children.** JSON columns hold objects (e.g. WMS
   `workProcedureSteps` are `{step, description}`, not strings). Rendering them
   raw crashes the page. Normalize first — see `asText()` in `wms/[id]/page.tsx`.
3. **`node_modules` cannot be a junction/symlink** — Turbopack rejects it
   ("Symlink points out of filesystem root"). Run a real `npm install`.
4. **Don't run a blanket codemod across the repo.** One did, and it clobbered
   intentional `text-white` on solid buttons in 8 files.
5. **`drizzle/` is gitignored** — migration SQL is not committed. After pulling a
   `schema.ts` change, regenerate and apply it yourself.

---

## 6. Running it

### First-run bootstrap (do this or auth returns 500)

Two files the repo **cannot** give you — both gitignored, so a fresh worktree has
neither. This is the #1 onboarding trap:

1. **`.env.local`** — without it NextAuth throws `MissingSecret` and every login
   500s, which cascades into every route 307-redirecting to `/login`. It needs at
   minimum `AUTH_SECRET` and `AUTH_TRUST_HOST`. Copy it from a worktree that has
   one, or generate: `npx auth secret`.

2. **`limsl-cms.db`** — the SQLite file is gitignored *and so is `drizzle/`*.
   That means `migrate-only.ts` alone is **not enough**: your migration folder can
   be stale and it will happily print "✅ Pending migrations applied" while
   creating nothing. Always regenerate from `schema.ts` first:

```bash
npm install
npx drizzle-kit generate             # regenerate migrations from schema.ts
npx tsx src/lib/db/migrate-only.ts   # apply them (additive)

# then seed (idempotent, order matters):
npx tsx src/lib/db/seed-roles-signoff.ts   # role model + QA/QC, HSE, Foreman users
npx tsx src/lib/db/seed-auth.ts            # passwords -> limsl2026
npx tsx src/lib/db/seed-procedure.ts       # Equipment Maintenance Procedure Rev 3
npx tsx src/lib/db/seed-training.ts        # competency matrix + training records

npm run dev                          # or: npx next dev -p <port>
```

**Verify, don't assume** — confirm the tables actually landed:

```bash
node -e "const D=require('better-sqlite3');const db=new D('limsl-cms.db');
console.log(db.prepare(\"SELECT name FROM sqlite_master WHERE type='table'\").all().map(r=>r.name).join(' '));"
```

You should see `competency_matrix`, `signoffs`, `procedure_revisions`, `permits`,
`training_records`. If any are missing, your `drizzle/` folder was stale — rerun
`drizzle-kit generate`.

Ports 3000–3002 are often already taken by the other agent's servers — pick a
free port rather than killing processes.

Seeded logins (password `limsl2026` for all):

| Email | Role |
|---|---|
| `daniel.idonor@limsl.com` | Super Admin |
| `osaghale.ikpea@limsl.com` | COO |
| `kenneth.aloziem@limsl.com` | Factory Manager |
| `kingsley.iworah@limsl.com` | Maintenance Manager |
| `sunday.okoro@limsl.com` | Foreman |
| `marcel.imadojiemu@limsl.com` | Technician |
| `blessing.ade@limsl.com` | QA/QC |
| `tunde.bello@limsl.com` | HSE |
