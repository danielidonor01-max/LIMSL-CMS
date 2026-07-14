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

## 2. What is built

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
- **Permits / PTW** (`/permits`) — signature-controlled, see §5. Raised against a
  named permit holder; four signatures required before work may begin; close-out
  needs two more. Deep-linked from a work order ("Raise PTW" prefills equipment +
  WO). HSE can issue permits but *cannot* write work orders — that split is
  intentional.
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

## 4. Password lifecycle & policy — DONE

Enforcement lives in the **proxy** (`auth.config.ts` → `authorized`), so it covers
API routes as well as pages: a flagged user cannot call `/api/*` to work around the
lock. Only `/change-password` and `/api/users/change-password` are reachable.

- **Policy is one source of truth:** `src/lib/password-policy.ts`
  (min 8 chars + letter + number + symbol). The API and the form both call
  `validatePassword()` — never re-implement the rule anywhere else. It is kept
  separate from `password.ts` because that module imports `node:crypto` and cannot
  be pulled into a client bundle.
- **Every seeded account is flagged `mustChangePassword`.** The bootstrap password
  (`limsl2026`) is committed to this repo, so it is a secret in name only — each
  real user must set their own on first login. Admin-created users are flagged too,
  and an admin-supplied password must itself satisfy the policy.
- **Dev tip:** to skip the forced-change screen while testing, clear the flag for
  one account rather than weakening the seed:
  `UPDATE users SET must_change_password = 0 WHERE email = '<you>@limsl.com';`

Known minor behaviour: the guard reads the JWT, and the JWT only learns the flag was
cleared when the client calls `update()` (the change-password page does this). If
that call is missed, the user stays on `/change-password` until they sign out and
back in. It fails *closed*, never open.

## 5. Permit-to-Work — signature-controlled

A PTW is a controlled safety document, not a status field. **Its status is driven
by signatures, never by a button.**

- **Permit holder is mandatory.** A permit names an accountable person
  (`permitHolderId` → `users`). The API refuses to raise a permit without one —
  "Maintenance Team" is not accountable to an auditor, a person is.
- **Authorisation chain** (`PTW_CHAIN`), all four required:
  Foreman → Maintenance Manager → HSE → Factory Manager.
- **Work cannot begin until approved.** A permit is raised `PENDING_APPROVAL` and
  only becomes `ACTIVE` when the chain is fully signed. Starting a work order that
  has a permit attached is **refused with 409** unless that permit is `ACTIVE`.
  (Work orders with no permit are unaffected — not every job needs one.)
- **Close-out chain** (`PTW_CLOSEOUT_CHAIN`), opened automatically on approval:
  Foreman (work complete, area clear) → HSE (isolation removed, safe to
  re-energise). A permit only reaches `CLOSED` when both are signed.
- `PATCH /api/permits/[id]` accepts **cancellation only**. Approval and closure
  cannot be forced through the API.

Status flow: `PENDING_APPROVAL → ACTIVE → CLOSED`, or `CANCELLED` / `EXPIRED`.
Promotion happens in `reconcilePermits()` (same reconcile-on-read pattern as the
Procedure module). To change who signs, edit `chains.ts` — nothing else.

## 6. Next tasks

1. **Role-aware dashboard** — every role currently sees identical tiles.
2. Dark theme (light is default and was an explicit requirement; dark is later).
3. Minor: `/permits/new` has no PPE "other" free-text field.

---

## 7. Traps that already caused bugs — don't re-introduce them

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
6. **drizzle-kit generates a broken table-rebuild when you add a column AND change
   a column default in the same migration.** SQLite can't `ALTER` a default, so it
   rebuilds the table — but the generated `INSERT … SELECT` copies the *new* columns
   from the *old* table, which doesn't have them, and the migration dies with
   `no such column`. Fix: hand-edit the generated `.sql` and select `NULL` for the
   new columns. Hit this adding `permit_holder_id` + changing the `permits.status`
   default. **Always read the generated SQL before applying it.**

---

## 8. Running it

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
