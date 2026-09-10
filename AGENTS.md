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

## 9. Git / branch protocol

Two agents work this repo concurrently — **coordinate or you will clobber**.

- `main` — Gemini's branch.
- `phase-2` — Claude's branch.
- Never force-push. Never push to a branch you don't own without agreeing first.
- If you stash, use a unique tag: `git stash push -u -m "<agent>-<purpose>"`
  (the stash stack is shared).
- Commit incrementally with real messages. Verify (build + drive the flow) before
  pushing.
