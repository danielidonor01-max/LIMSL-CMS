<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# LIMSL CMS — Engineering Rulebook

Shared contract for every agent (Claude, Gemini) and human working this repo.
**Read this before writing code. If you deviate, say so explicitly and why.**

For *what is already built and what to do next*, read `docs/HANDOFF.md`.

## 1. What this project is

Computerized Maintenance Management System for **LEE International Machinery and
Services Limited (LIMSL)** — a fabrication workshop with ~33 machines.
The system revolves around three departments only: **Maintenance, QA/QC, HSE**,
with an approval chain up through Foreman → Maintenance Manager → Factory Manager
→ COO, plus a Super Admin who administers user accounts.

It is a **compliance system first** (ISO 9001 / 45001). Every state change that a
regulator or auditor would care about must be traceable: who did it, when, under
which signed-off procedure revision. When in doubt, favour the auditable option.

Asset IDs follow the format `LEE/PE/XXXX`. They are auto-generated on create
(`/api/equipment/next-id`) and remain editable in the asset register.

## 2. Stack (do not swap these out)

| Concern | Choice |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| DB | **Postgres (Supabase)** via Drizzle ORM + postgres.js — see docs/DEPLOY.md |
| Auth | NextAuth v5, credentials provider, JWT session carrying `role` + `id` |
| Hashing | **scrypt** (`src/lib/password.ts`) — *not* bcrypt |
| Styling | Tailwind v4, **light theme is the default** (dark theme is a later phase) |
| Toasts | `sonner` |
| Icons | `lucide-react` |
| Signatures | `signature_pad` via `src/components/SignaturePad.tsx` |

### Next.js 16 gotchas that will bite you
- Route `params` is a **Promise** — `const { id } = await params;`
- `serverExternalPackages` (top-level), **not** `experimental.serverExternalPackages`
- `middleware.ts` is deprecated in favour of `proxy.ts` (currently a warning only)
- Route handlers live at `src/app/api/**/route.ts`

## 3. Hard rules

1. **NO NATIVE UI.** Never `alert()`, `confirm()`, or `prompt()`. Use `sonner`
   toasts (`toast.success` / `toast.error`) and `src/components/Modal.tsx`.
   (`window.print()` is allowed — printing is a real requirement.)
2. **Never commit secrets.** `AUTH_SECRET`, `ANTHROPIC_API_KEY` live only in
   gitignored `.env.local`.
3. **The schematic-ingestion engine stays DISABLED.** All scaffolding exists and
   is deliberately switched off behind `src/lib/config.ts` — there is no Claude
   subscription. Do not enable it. See `docs/SCHEMATIC-ENGINE.md`.
4. **Gate every mutating API route.** See §5. A route that writes without a role
   gate is a bug.
5. **Never broadly kill node processes** — multiple agents/servers run
   concurrently. Kill only a specific PID found by port.
6. **Test locally before pushing.** Run the app and drive the actual flow; a
   typecheck is not verification.

## 4. Roles & permissions — single source of truth

**`src/lib/roles.ts` is canonical. Never hardcode a role list anywhere else.**

Roles: `SUPER_ADMIN`, `COO`, `FACTORY_MANAGER`, `MAINTENANCE_MANAGER`, `FOREMAN`,
`QA_QC`, `HSE`, `TECHNICIAN`, `VIEWER`.

Exported permission sets — import these, don't re-derive them:
- `MAINTENANCE_WRITE_ROLES` — may create/modify work orders, equipment, PM
  checklists, corrective records. (QA/QC and HSE participate via **sign-off**, not
  direct maintenance writes.)
- `PERMIT_WRITE_ROLES` — may issue/close a Permit-to-Work. Includes **HSE**.
- `TRAINING_WRITE_ROLES` — may manage competency & training. Includes **QA/QC**.
- `WORK_ASSIGN_ROLES` — may put somebody **else's** name against a job (the
  schedule's Assign, and creating a planned activity). Foreman and above.
  Deliberately narrower than `MAINTENANCE_WRITE_ROLES`, which includes
  TECHNICIAN so a technician can raise a work order, reschedule and defer
  against their own name. Deciding who carries a job is supervisory.
  Applied on the schedule, on a PM batch and on a corrective record; gate any
  new place work can be assigned the same way.
- `REPAIR_AUTHORISE_ROLES` — may decide a reported breakdown will be repaired,
  which is the act that hands it to the Foreman to resource. Factory Manager
  only (plus Super Admin). Narrower than `WORK_ASSIGN_ROLES` on purpose: a
  Foreman resources the repair, he does not authorise it to himself.
- `ROLE_ALLOWED_PATHS` + `canAccessPath(role, pathname)` — drives **both** the
  sidebar nav and the page guard, so they can never disagree.
- `canSignStep(userRole, stepRole)` — exact match, or a strictly more senior role,
  or Super Admin.

Department scoping already encoded: **HSE** sees work orders, non-conformities,
WMS, permits. **QA/QC** sees policy, audit log, maintenance procedure, KPI.

## 5. How to gate an API route (copy this exactly)

```ts
import { requireRoles } from "@/lib/authz";
import { MAINTENANCE_WRITE_ROLES } from "@/lib/roles";

export async function POST(request: Request) {
  const gate = await requireRoles(MAINTENANCE_WRITE_ROLES);
  if (gate.res) return gate.res;          // 401 unauthenticated / 403 wrong role
  // gate.actor is { id, name, role }
}
```

GET routes are generally open to any authenticated user (the proxy already
requires a session). **Every POST/PATCH/DELETE must be gated.**

## 6. Sign-off engine

Multi-level sign-off is **generic and data-driven** — do not build a bespoke
approval flow per module.

- Chains are declared in `src/lib/signoff/chains.ts` (`PM_CHAIN`, `CM_CHAIN`,
  `WMS_CHAIN`, `PROCEDURE_CHAIN`).
- One generic `signoffs` table backs all of them.
- Service: `ensureSignoffChain()` / `getSignoffChain()` in `src/lib/signoff/service.ts`.
- UI: `<SignoffChain />`.
- Enforcement is two-fold: **role match** (or senior/super-admin) **AND sequence**
  (all earlier required steps must be signed first).

To add approvals to a new module: add a chain to `chains.ts` and render
`<SignoffChain />`. That's it.

### What a signature IS here

Typed and attributed, not drawn. `<SignatureBlock />` renders the signer's
name, the role they signed as, and the moment — the Adobe convention — and that
is exactly what the row stores. A mark scrawled with a fingertip on a tablet
cannot be verified against anything and was never the evidence; the record
around it always was.

Drawn signatures already in the database still render, above the attribution.
A record signed in August must look the same in five years as it did on the
day, so nothing migrates them.

**The signing PIN is OPTIONAL and per person**, set in Account settings. Both
halves ask `hasSigningPin()` about the stored hash — the dialog to decide
whether to show the field, the route to decide whether to check it — so they
cannot disagree. Where a signer has one it is ENFORCED: opting in is a
decision, and a request may not skip it by omitting the field. `authMethod`
records which it was, `SESSION` or `SESSION+PIN`, because those are not the
same claim.

## 6a. The safety-chain order (do not "fix" this back)

```
WMS  →  JHA  →  approved WORK ORDER  →  PTW  →  work starts
```

The method statement and the hazard analysis are written **before** the job is
authorised. Neither requires a work order, and the WMS `work_order_id` column is
nullable on purpose.

It was built the other way round first, requiring an approved work order before
a WMS could be drafted. That reads correct and is wrong in practice: it deadlocks
every new job, because the safety documents cannot be prepared until the work is
authorised and nobody can sensibly authorise work without seeing how it will be
done. LIMSL confirmed the September 2026 user-journey review was right about
their process.

**The authorisation gate did not go away, it moved to the permit**
(`src/app/api/permits/route.ts`). A permit is what actually lets somebody pick up
a spanner, so that is where an unapproved work order must be refused. Only
`PENDING_APPROVAL` and `CANCELLED` may block: an emergency work order is already
`OPEN` with its signatures still being collected, and blocking it would leave a
breakdown crew unable to raise the permit their own isolation depends on.

`src/lib/__tests__/safety-chain.test.ts` guards all four properties.

## 6a-1. The PM and CM flows (what makes the documents move)

§6a says what order the documents go in. This says what makes anybody create
the next one, which was the piece that did not exist: every document was
present and correctly gated, and nothing joined them up, so permits, method
statements and hazard analyses sat around dormant and unconnected to the work
they were meant to authorise.

`src/lib/maintenance/flow.ts` holds both flows as data. It is pure — it takes
facts and returns which step a job is on, who may take it and why it exists —
so the API gate and the screens cannot drift apart about what comes next.
`src/components/FlowRail.tsx` renders it, and puts the call to action on the
current step and nowhere else.

### PM: the plan schedules a CATEGORY, not a machine

```
PM batch → assignment → work orders → WMS → JHA → PTW → work
```

The annual plan says "CNC light duty, 4 October". On the day that resolves to
whichever machines of that category are due — say five. **They are one job.**
One person is assigned and that assigns all five, one method statement covers
all five, one hazard analysis covers it, and one permit authorises it.

`pm_batches` is that job. Raising a batch from the schedule fans out **one work
order per machine** underneath it, because equipment history, PM checklists and
parts consumption are all per machine. The batch is what the WMS, JHA and PTW
hang off; the work orders are what the technician ticks off.

A batch permit names one machine in `permits.equipment_id` because the column
requires one. **`batch_id` is what says it covers all of them.** Do not read
`equipment_id` as the scope of a batch permit.

### CM: a breakdown is one machine

```
report → Factory Manager authorises → Foreman assigns → assignee raises the WO
       → WMS (that machine) → JHA → PTW → repair
```

Each of those is a named act with its own gate and its own audit line, taken at
`POST /api/corrective/[id]/flow`, not a field on a form. Specifically:

- **Only the Factory Manager authorises** (`REPAIR_AUTHORISE_ROLES`). A Foreman
  resources the repair; he does not authorise it to himself.
- **Nothing is assigned before it is authorised** — the route returns 409.
- **The assigned person raises the work order.** A manager may do it on their
  behalf; another technician may not.

### The WMS is a standing document, not a form (do not make it per-job again)

How you service a CNC light-duty machine does not change because it is
October rather than March. So a method statement is written ONCE for a
CATEGORY, approved, and then it stands — every PM of those machines runs
under it until somebody revises it. It is a controlled document, which is why
QA/QC now sit in `WMS_CHAIN` as they do on the maintenance procedure.

`wms_documents.category` is what makes it standing. A WMS with no category is
a one-off: a breakdown repair on a single machine.

The hazard analysis hangs off it and pins ONE number, `jha_documents.wms_revision`:
the revision its hazards were assessed against. When a machine joins the
category the method is revised, the old revision and its analysis both become
SUPERSEDED, and `permitReadiness()` refuses the next permit until HSE has
revised the analysis. **Permits already live are deliberately untouched** —
stopping work that is already authorised and under way is a decision for a
person, not a side effect of somebody editing a document.

Permits are the exception to all of this and are raised fresh each PM cycle,
because a permit has a start, a validity, an expiry and a hand-back. It
authorises work in a window; it cannot span months the way a method can.

**A standing JHA cannot tell a permit which cycle it is for.** The crane JHA
approved in March is the crane JHA in October, so its `batchId` and
`workOrderId` name March. A permit therefore takes its batch from the caller
(`/permits/new?jhaId=…&batchId=…`) and its work order from THAT batch — never
from the JHA. Inheriting them issued an October permit that claimed to
authorise a March work order. Batches find their WMS/JHA by CATEGORY
(`standingPairFor`), never by `batchId`.

The rules are pure in `src/lib/hse/standing-documents.ts` so the permit route
and the screens cannot disagree about them.

### Delegation, and signing in somebody's place

Two different things, and the difference is the point.

- **Delegation** (`POST /api/signoffs/[id]/delegate`) moves a PENDING step to
  somebody who is actually here. It signs nothing; it changes who may sign,
  and that person then signs under their own name. Allowed as often as people
  are away, each with a reason, each in the audit log.
- **Signing in somebody's place** is the `isOverride` path, and it is allowed
  **once per document**. One is a person being covered for. Several is a
  document that has stopped recording who agreed to the work — a chain of five
  signatures from one account is one person's opinion wearing five hats.

Delegating sets `signerUserId` to the delegate, which is why their signature
is their own rather than an override: they are exactly who the step now names.

### The category owns the interval

A machine's maintenance frequency is its CATEGORY's, from `asset_categories`.
It is not an editable field of the machine: the edit modal shows it read-only,
the equipment routes derive it from the category, and moving a machine to
another category moves it onto that category's interval (and replans it).

Changing a category — its name, its interval, or adding a new one — is a
PROPOSAL (`asset_category_changes`, `ACC-…`) signed by the Maintenance Manager
then the QA/QC Supervisor (`ASSET_CATEGORY_CHAIN`). Nothing moves until the
second signature; then `applyCategoryChange()` runs once, from the sign route,
and every machine in the category takes the new interval. One pending change
per category.

`/settings/categories` is the one page under /settings that is not Super Admin
only — `ASSET_CATEGORY_ROLES` can open it, because the two approvers have to be
able to read the change they are asked to sign.

**Replanning** (`replanMachine`, rule in `isReplannable`) removes only future
rows nobody has touched — SCHEDULED, no work order, not batched, not deferred —
then adds the new interval's dates. Overdue, rescheduled, deferred and started
rows are decisions and stay.

### The register drives the plan

A machine on the register that is not on the plan is a machine nobody will
service. Adding one — or changing its interval — seeds the schedule from
`maintenanceFrequency` via `syncPlanForEquipment()`, including for a category
nothing has used before. It only ever ADDS missing dates: rows somebody
rescheduled, deferred or completed are decisions, and overwriting them would
erase those decisions silently.

Counting runs from the machine's own anchor (commissioning, or last service),
not the calendar quarter, because two machines bought six months apart really
are due at different times.

### Assignment is a supervisory act, everywhere

`MAINTENANCE_WRITE_ROLES` includes `TECHNICIAN`, so anything that lets a
technician record their own work will also let them put a job on somebody else
unless it is gated separately. `WORK_ASSIGN_ROLES` is that gate, and it is
applied on the schedule, on the batch and on the corrective record. If you add
a third place work can be assigned, gate it there too.

### Parts consumed

Booking a part against a work order is what moves the stock, via
`WorkOrderParts` and `PATCH /api/spares/[id]`. It is mounted on the work order,
the PM checklist and the breakdown record. There is one write path for this on
purpose — do not add a second, or the register and the ledger will disagree.

## 6a-2. Safety information is not gated (do not "tighten" this back)

Two deliberate widenings of access. Both look like holes in a review and are not.

**The scan passport is public.** `/equipment/scan/[assetId]` and its API answer
without a session. A welder standing at a machine with a phone in a glove has to
be able to find out whether the thing is safe to touch, and a login form there
defeats the sticker glued to the machine. Anyone who can read the sticker is
already standing in the workshop.

The cost is that asset IDs run in sequence, so one sticker is a key to the whole
register. That is why the split matters: the public half is the safety answer
(status, lockout, live permits, PPE, emergency contacts) and the signed-in half
is the commercial record (OEM, model, serial, criticality, service history).
Widening the public half is a one-line change nothing else would notice, so
`src/lib/__tests__/public-scan.test.ts` fails if a withheld field crosses over.

**VIEWER can reach `/emergency`.** The least-privileged role holds read access to
emergency contacts and procedures. Emergency preparedness has to be communicated
to everybody who works on site (ISO 45001 §8.2); a contractor or visitor account
that cannot find the fire service number is the failure that matters, not the one
that reads it without needing to.

Stickers outlive code. `src/lib/scan-redirect.ts` sends every equipment URL an
unauthenticated visitor hits to that asset's passport, because three generations
of label are on machines in the workshop right now and only the newest one
encodes the public path.

## 6b. UI standard

The locked-in visual system — palette, type scale, **icon sizes (w-4 inline / w-5
prominent, no off-scale)**, spacing, and the shared components to use (`Button`,
`Modal`, `Dropdown`, `PageHeader`, `Badge`) — is in **`docs/UI-STANDARDS.md`**. Build
to it; don't invent per-page button/dropdown variants. The left sidebar is grouped
into labelled sections — add new modules to the right section.

## 7. Coding style

- **Client-component pages + `fetch` in `useEffect`.** Pages are `"use client"`,
  they fetch from `/api/*`. Keep it — it's the established convention here.
- **Comments explain _why_, never _what_.** Never write a comment describing what
  the next line does or narrating a change ("added this", "now we also…").
- Handle the empty state and the loading state on every list page.
- Prefer editing an existing file over creating a parallel one.

### Session/role rendering — the hydration trap
The session resolves **client-side only**. If you render anything role-dependent
during SSR you get a hydration mismatch. Always defer it past mount:

```ts
const [mounted, setMounted] = useState(false);
useEffect(() => setMounted(true), []);
const canWrite = mounted && MAINTENANCE_WRITE_ROLES.includes(role ?? "");
```

This pattern is already in `Sidebar.tsx` and the OEM/Calibration/Training pages.
**Do not remove it** — it was a real bug.

### Rendering data from the DB
JSON columns can hold objects, not just strings. Rendering a raw object crashes
React (*"Objects are not valid as a React child"*). Normalize before rendering —
see the `asText()` / `safeParse()` helpers in `src/app/wms/[id]/page.tsx`.

## 8. Database workflow

**Postgres (Supabase)** via Drizzle + `postgres.js`. `DATABASE_URL` must be set
(Supabase Transaction pooler, port 6543) — there is no local SQLite file. Deploy
steps are in `docs/DEPLOY.md`.

`schema.ts` (pg-core) is the source of truth. **`drizzle/` is gitignored** —
migration SQL is *not* committed; each environment regenerates it.

```bash
export DATABASE_URL=postgresql://...:6543/postgres
npx drizzle-kit push                # create/sync tables from schema.ts (simplest)
# or: npx drizzle-kit generate && npx tsx src/lib/db/migrate-only.ts
```

Seeds are standalone and idempotent (`src/lib/db/seed-*.ts`), each runnable via
`npx tsx src/lib/db/seed-<name>.ts` (with `DATABASE_URL` set). Default password
for every seeded user is `limsl2026`.

Timestamp/date columns are stored as **text** (ISO strings) — keep it that way;
app code slices/compares them as strings. Never destructively reset the DB.

### Local development uses PGlite, and it is single-process

`DATABASE_URL=pglite` runs an embedded Postgres in `.pgdata`. **Only one process
may hold it.** A dev server and a `tsx` script at the same time will not error
cleanly — the second one crashes the Next worker with
`Jest worker encountered 2 child process exceptions`, and auth routes start
returning 500. Stop the server before running a script against the same
database. If a script hangs, it is still holding the lock: find its PID and kill
that PID specifically.

### Document numbering

`nextDocNumber()` draws from `doc_counters`, one row per series and year,
incremented atomically. Two things have bitten this and both are fixed:

- **The seeds write document numbers directly**, without advancing the counter,
  so on any seeded database the counter said 1 while the register already held
  `WO-2026-0011`. The next work order raised collided with the unique index and
  the whole create path failed. Run `src/lib/db/sync-doc-counters.ts` after
  seeding — it raises each counter to the highest number actually in use and
  never lowers one.
- **`db.execute()` returns different shapes per driver** — an array for
  `postgres.js`, `{ rows }` for PGlite. Reading only the array form made every
  lookup miss on PGlite and hand out `0001` forever. Anything reading a raw
  result must handle both.

### One-off scripts for this change

```bash
DATABASE_URL=...  npx tsx src/lib/db/apply-pm-flow.ts         # pm_batches + batch_id columns, idempotent
DATABASE_URL=...  npx tsx src/lib/db/sync-doc-counters.ts     # counters -> highest number in use
DATABASE_URL=...  npx tsx src/lib/db/reset-safety-documents.ts --dry-run
```

`apply-asset-categories.ts` creates the category tables, seeds a row per
category in use at its machines' MAJORITY interval, and moves the minority
onto it (with a replan). `--dry-run` lists exactly which machines move.

`erase-work-orders.ts` deletes every work order and what exists only for them
(PM checklists, time logs, their signatures and seals, PM batches), clears the
link on records that stand alone (spares movements — the stock figure depends
on them — breakdown records, the plan), never touches the audit log, and does
NOT reset document numbers: the log still names the erased numbers.

`reset-safety-documents.ts` clears every WMS, JHA and permit and sets the year's
PM plan back to overdue/scheduled. It keeps work orders, breakdown records,
equipment, spares **and the audit log** — the record that those documents
existed and were deleted is itself evidence, and it writes its own line saying
so. It finds the columns pointing at permits from `pg_constraint` rather than a
hand-list, and nulls them rather than deleting the rows that carry them.

## 9. Git / branch protocol

Two agents work this repo concurrently — **coordinate or you will clobber**.

```
  claude  (Claude)  ─┐
                     ├─►  preview  ──►  main
  gemini  (Gemini)  ─┘    integrate     production
                          and test
```

- **`main` is production.** Vercel deploys it. Nothing lands here that has not
  been through `preview` first. No agent pushes to `main` directly.
- **`preview` is where the two streams meet and get tested together.** Merge
  your branch here, run the suite, drive the flow, and only then does it go to
  `main`. A conflict is meant to surface here rather than in production.
- **`claude` is Claude's. `gemini` is Gemini's.** Work on your own branch,
  merge it into `preview` yourself, and say so.

Claude may read, audit and correct anything on `gemini`; corrections go through
`preview` like everything else, with a commit message saying what was changed
and why.

The branches were once `phase-2`, `combine`, `combined` and `gemini`. Two of
those differed by one letter and one was named after a phase nobody was in any
more, which is how real integration work ended up on `combine` while `combined`
sat level with `main` doing nothing. The names are people and destinations now.
`docs/BRANCHES.md` has the full account, including what moved where.

### Work in your own worktree

One checkout per agent, and the branch name matches the folder:

| Folder | Branch | Whose |
|---|---|---|
| `limsl-cms/` | `gemini` | Gemini's |
| `limsl-cms-claude/` | `claude` | Claude's |

`limsl-cms-phase2/` is retired. Editing files in someone else's working
directory is how work gets committed by the wrong agent under the wrong message
— which has happened twice. First a WhatsApp notifications feature was swept
into a commit about table columns because it was sitting uncommitted in the
other agent's tree. Then, during the September interface work, both agents were
writing into `limsl-cms-phase2/` at the same time: eleven modified files and
three new components appeared in it mid-session, and the only safe move was to
stop, say so, and work from a separate checkout.

If you find changes you did not make in your own working tree, **stop and say
so** rather than committing them.

### The rest

- Never force-push. Never push to a branch you do not own.
- If you stash, use a unique tag: `git stash push -u -m "<agent>-<purpose>"`
  (the stash stack is shared across worktrees).
- Commit incrementally with real messages. Verify (build + drive the flow) before
  pushing. `scripts/dev-db.sh up` gives you a local database with real data, and
  `scripts/shoot.mjs` signs in and screenshots the actual pages — there is no
  longer an excuse for shipping a screen nobody has looked at.
