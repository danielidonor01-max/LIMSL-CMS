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

## Phase A — Finish data integrity (small, high value)

Close the remaining trust gaps from the audit. No new infrastructure needed.

1. **WMS approval → sign-off chain.** WMS approval is currently written by a
   PATCH body (now role-gated, but still not signature-backed). Migrate it to the
   existing `WMS_CHAIN` via `<SignoffChain />`, exactly like permits and procedure,
   so a WMS cannot be marked APPROVED without real signatures. *(This is the last
   module where approval is a field rather than a chain.)*
2. **QR labels** (`equipment/qr/[assetId]`) — replace the hardcoded 7-machine
   `nameMap` with a fetch of the real equipment name; every asset outside the map
   currently prints a generic label.
3. **Equipment "Safety & OEM" tab** (`equipment/[assetId]`) — remove the hardcoded
   safety text, warranty, and fabricated spec fallbacks (`eq.oem || "STAKO"`, etc.);
   bind to real fields and show "—" when empty.
4. **Client attribution cleanup** — new-WO and new-WMS forms still *send*
   `"Daniel Idonor"`; the server now ignores it (stamps the session user), so this
   is cosmetic, but remove the dead hardcodes to avoid confusion.
5. **Housekeeping** — add the built-but-orphaned `/audit/risks` page to the sidebar
   nav; delete the dead `AppHeader.tsx` component.

## Phase B — Documents & evidence (needs a storage decision)

The Documents module's "Open" links point at placeholder `#/docs/...` URLs — no
file ever opens. This blocks real schematics, manuals, calibration certificates,
training certificates and signed permit PDFs.

- **Decision required:** where do uploaded files live? For a single-site workshop,
  simplest is local disk served under a protected route; cloud (S3 / Supabase
  Storage) if off-site access is wanted. *Ask Daniel.*
- Then: real upload endpoint + viewer, wired into equipment documents, WMS
  attachments, calibration certificates, training certificates.
- Printable/exportable permit and PM records (PDF) for the audit file.

## Phase C — Notifications (needs provider credentials)

The infrastructure exists (`src/lib/notifications/`) but is a stub and unwired —
`triggerBreakdownNotification` / `triggerWmsApprovalNotification` are never called,
and the WhatsApp sender just `console.log`s success.

- Wire triggers into the flows: **PTW awaiting sign-off**, **WMS awaiting approval**,
  **breakdown raised**, **PM/calibration overdue**, **competency recert due**.
- Email via SMTP (nodemailer) — needs credentials. WhatsApp via a real provider
  (Twilio / WhatsApp Business API) or defer WhatsApp and ship email first.

## Phase D — Role-aware experience (small–medium)

Make the app fit each role's day.

- **Role-aware dashboard** — every role sees identical tiles today. HSE → permits &
  incidents; QA/QC → audit log, procedure, NCs; Maintenance → their work orders &
  overdue PM; management → KPI rollup.
- **"My sign-offs" queue** — one place showing everything awaiting *my* signature
  across permits, WMS, PM, corrective and procedure. High daily value; the sign-off
  engine already has the data.

## Phase E — Reporting & audit-readiness (medium)

Turn the data into ISO evidence packs.

- Printable, branded compliance reports: PM completion, PTW register, calibration
  status, competency matrix, non-conformity log. `src/lib/export.ts` exists as a
  starting point.
- PDF / Excel export.

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
