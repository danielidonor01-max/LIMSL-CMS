# LIMSL CMS — Phase Roadmap

**Created:** 2026-07-14 · after a full project audit (see the audit summary at the
bottom). Read `AGENTS.md` for the rules and `docs/HANDOFF.md` for current state.

The system's **core is complete and verified**: equipment register, PM, corrective/
RCA, WMS, permits (now signature-controlled), procedure control, KPI, calibration,
OEM, training/competency, role-based access, multi-level sign-off, password
lifecycle. What remains is (1) finishing data-integrity gaps the audit surfaced,
and (2) the features that make it a daily shop-floor tool rather than a records
system.

Phases are ordered by value-per-effort. Each is independently shippable.

---

## Phase A — Finish data integrity ✅ DONE (2026-07-14)

All trust gaps from the audit are closed:

1. ✅ **WMS approval → sign-off chain.** WMS status is now DERIVED from the
   `WMS_CHAIN` (`reconcileWmsStatus`): DRAFT → UNDER_REVIEW → APPROVED/REJECTED. The
   fabricated review/approve panel (hardcoded "Kenneth Aloziem" / "Osaghale Ikpea")
   is gone; approval can no longer be forced via PATCH. Approver name comes from the
   real final signature. Verified: forcing `status=APPROVED` is ignored; signing the
   four steps flips it to APPROVED attributed to the real Factory Manager.
2. ✅ **QR labels** — now fetch the real equipment name for every asset.
3. ✅ **Equipment Safety/OEM tab** — safety guidance derives from real attributes
   (criticality, calibration); fabricated spec fallbacks replaced with "—"; warranty
   status computed from `warrantyExpiry`.
4. ✅ **Client attribution cleanup** — removed the hardcoded `"Daniel Idonor"` from
   the new-WO and new-WMS forms (server already stamps the session user).
5. ✅ **Housekeeping** — `/audit/risks` added to the sidebar (Risk Register); dead
   `AppHeader.tsx` deleted.

## Phase B — Documents & evidence ✅ DONE (2026-07-14)

Built a provider-agnostic storage layer with **both** options live behind one
interface (Daniel: keep local and cloud in mind): `LOCAL` (filesystem, default,
for a self-hosted site) and `SUPABASE` (cloud object storage, REST, no SDK). Files
are served only through the **auth-gated** `/api/files/<key>` route (local streamed,
cloud via a 5-min signed URL) — compliance docs are never public. Real upload +
viewer wired into the equipment Documents panel; path traversal blocked; type/size
validated. See `docs/STORAGE.md`.

Verified: byte-identical upload→serve round-trip, unauth blocked, `.exe` rejected
(415), traversal 404, document recorded with the real uploader.

Remaining (optional, later):
- Reuse the same storage for **calibration certificates** and **training
  certificates** (both have a `certificateUrl` field ready).
- Re-point or clear the old seed documents whose `fileUrl` is a `#/docs/...`
  placeholder (cosmetic — real uploads work).
- Printable/exportable permit & PM records — see Phase E.

## Phase C — Notifications ✅ WhatsApp built (delivery needs credentials)

**Done.** Replaced the old stub with a real outbox + in-app inbox. Every event is
recorded per-recipient (resolved from roles → the user's WhatsApp number) and shown
in-app immediately via the top-bar bell → `/notifications`. WhatsApp delivery is
built (Meta Cloud API + Twilio adapters) and gated by `whatsappReady()`: until
credentials are set, alerts stay `QUEUED` and in-app still works — never faked.
Triggers wired: **sign-off next-signer** (covers PTW/WMS/procedure/PM/corrective in
one hook) and **breakdown logged**. See `docs/NOTIFICATIONS.md`.

Remaining in this area:
- **Provision WhatsApp** — set the Meta env vars and, crucially, get a message
  **template approved** (Meta blocks proactive free-text). Steps in NOTIFICATIONS.md.
- **Email** — deferred (Daniel: WhatsApp first). Add an EMAIL channel adapter later.
- **Scheduled alerts** — PM/calibration overdue and competency recert-due are event-
  less; wire them into the audit auto-detect scan or a cron.

## Phase D — Role-aware experience ✅ DONE (2026-07-14)

- ✅ **"My sign-offs" queue** — the dashboard now leads with *"Awaiting your
  sign-off"*: everything that is the current user's step (by exact role) across
  permits, WMS, procedure, PM and corrective, each deep-linked. Backed by
  `GET /api/signoffs/mine`. The senior-override capability still lives on the entity
  page — the queue is a personal to-do list, so it shows only your own
  responsibilities, not every junior step you *could* cover. Verified: a permit
  awaiting the Foreman shows only for the Foreman; on signing it moves to the
  Maintenance Manager; the Technician sees the seeded PM steps; others are clear.
- ✅ **Role-aware dashboard** — a greeting with the user's role, and the quick-link
  grid filtered by `canAccessPath` so each role only sees modules it can open.

Later (optional): per-role KPI/summary tiles (e.g. HSE incident count, QA/QC open
NCs). The sign-off queue was the high-value piece and is done.

## Phase E — Reporting & audit-readiness ✅ DONE (2026-07-14)

Five branded, printable ISO evidence registers at `/reports/print/<type>` —
**Permit-to-Work register, PM completion, calibration status, competency matrix,
non-conformity log**. Each has a LEE International letterhead, a generated-by/date
stamp, the data table, and an auditor sign-off block (Prepared / Reviewed / Approved).
Print to paper or Save-as-PDF from the browser (app chrome is hidden on print); each
also exports to **CSV**. Surfaced from the Reports page ("ISO Evidence Reports"),
config-driven via `PrintableReport` + a per-type definition.

Verified: all five routes render; PM (150 rows) and competency (26 rows) populate
from live data; empty registers show cleanly.

Later (optional): true XLSX (currently CSV, which Excel opens natively); scheduled
email/WhatsApp of a monthly compliance pack.

## Phase F — Platform & later (ongoing)

- **Dark theme** (light is the default and was an explicit requirement; dark is
  "later" per Daniel).
- **Schematic ingestion engine** — fully scaffolded and deliberately OFF; needs a
  paid Claude API subscription. Parked until then. Do not enable. See
  `docs/SCHEMATIC-ENGINE.md`.
- **Offline queue** — `src/lib/offline/db.ts` (Dexie) exists; wire it for shop-floor
  tablets with flaky wifi if that becomes a need.

---

## Audit summary (2026-07-14)

A three-agent audit (security, runtime-crash, dead/stub) plus build/typecheck.

**Fixed in this pass** (committed):
- **Broken function-level authorization** — 11 mutating API routes were reachable
  by *any* authenticated user (incl. VIEWER), because the middleware checks
  authentication but not role. The worst let any user forge a WMS approval with a
  fake approver + signature. All now role-gated.
- **Runtime crash guards** — an unguarded `JSON.parse` rendered in JSX on the
  equipment page (the "objects are not valid as a React child" class); missing
  not-found guards on `wms/[id]` and `corrective/[id]`; a KPI null-deref.
- **Forgeable attribution** — corrective close-out hardcoded signer names; several
  routes took the actor name from the request body. Now stamped from the session
  server-side (verified: a spoofed name is ignored).

**Deferred to the phases above** — documents file storage (B), notifications (C),
QR/Safety-tab/dashboard data-binding (A/D), WMS approval-chain migration (A),
dead-code cleanup (A). None are correctness bugs in shipped flows; they are
completeness/feature gaps.
