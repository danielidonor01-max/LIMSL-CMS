# LIMSL CMS — Consolidated Audit & Phase Plan
*August 2026. Four independent reviews: product/UX (registry, admin, asset creation), visual design system, ISO 9001/45001 + maintenance-engineering flow, and UX interaction/accessibility. Findings de-duplicated and sequenced below.*

---

## Verdict

**Architecture: strong. Enforcement: unfinished. Presentation: two generations old in ~30 of 41 screens.**

The compliance *spine* is better than most commercial CMMS at this scale — a generic data-driven sign-off engine, permit-gated work start, server-computed downtime, single-writer equipment status, atomic document numbering, and a KPI layer that honestly returns `null` for costs rather than inventing them.

The failures are **asymmetries**: a control implemented on one path and left open on the adjacent one.
- Corrective close-out demands 5 signatures + root cause + downtime window. **NC close-out demands nothing.**
- The permit gate is enforced on work start — but **no rule says when a permit is required.**
- Document numbers use atomic counters everywhere **except** the NC auto-detect route.
- Equipment status has one careful writer; **availability has two contradictory definitions.**

Would it pass an ISO 9001 surveillance audit today? **No.** After Phases 0–2 below: comfortably yes.

### What an auditor would write up today
- **Major (9001 10.2)** — corrective-action process not effective: NCs close with no root cause, action or verification.
- **Major (9001 7.1.5.2)** — no measurement traceability; calibration history overwritten on each roll-forward.
- **Major (45001 8.1.2)** — no criteria for when a permit is required; isolation is one boolean; lapsed permits leave de-isolation permanently unsigned.
- **Minor (9001 8.5.1)** — one generic PM checklist for all 33 assets, every item pre-ticked OK.
- **Minor (9001 7.5.3.2)** — audit trail capped at 100 rows, unfilterable; no per-asset history report; superseded signatures deleted.
- **Minor (9001 9.1.1)** — two definitions of Availability; MTTR excludes records with blank windows; backlog derived from a 2-hour assumption.

### Where the three audits independently converged
Findings reached by more than one reviewer, so highest confidence: the illegible dark-theme badges; the 4 invalid Tailwind shades; the missing `PageHeader`; invisible focus rings; 12 of 13 tables with no mobile fallback; jargon leaking into the UI.

---

## Scorecard

| Area | Score | One-line |
|---|---|---|
| Compliance architecture | 8/10 | Genuinely good bones; enforcement gaps, not design gaps |
| Admin (users + roles) | 8/10 | Best surface in the app; needs a permission matrix |
| Troubleshooting/AI | 8/10 | Strong, but unreachable from the registry |
| Equipment registry | 4–6.5/10 | Visible defects + no mobile + no PE/SYS split |
| Add equipment | 5/10 | **Cannot create SYS assets safely** |
| Corrective detail | 3/10 | Lowest craft + a real data-loss trap |
| Technician journeys | 3 fail / 2 borderline / 3 pass | Every failure belongs to the technician |
| Visual system | 5.5/10 | 7 broken classes; 200+ hand-rolled variants |

---

# THE PHASE PLAN

Sequenced so that **things that are actively wrong** are fixed before things that are merely inconsistent, and **shared foundations** land before the work that depends on them. Every phase is independently shippable.

---

## PHASE 0 — Stop the bleeding *(≈1 day)*
*Defects that are actively wrong right now: silent data loss, unreadable safety signals, dead styles, a broken compliance gate.*

| # | Fix | Where | Why now |
|---|---|---|---|
| 0.1 | **RCA data-loss trap** — `handleCloseOut` omits `rcaTool`/`rcaAnalysis`/`correctiveActions`; a user who fills the 5 Whys then closes out loses all of it unless they hit a separate Save first | `corrective/[id]/page.tsx` | Destroys compliance evidence the user believes they entered |
| 0.2 | **Silent write failures** — `corrective/new`, `handleSaveRca`, `handleCloseOut` do nothing on a failed POST | corrective pages | On workshop wifi, a lost fault report looks identical to success |
| 0.3 | **`useApi` error flag consumed by nobody** — a failed fetch renders "nothing here" | all list pages + `api-cache.ts` | Technician concludes there's no work when the network died |
| 0.4 | **Segregation of duties** — one Factory Manager can sign an entire 5-step CM chain alone, including the HSE step | `signoffs/[id]/route.ts` | Two lines; protects the system's core compliance claim |
| 0.5 | **3 illegible badges** — incl. "PRODUCTION STOP" at ~1.9:1 contrast | `corrective/page.tsx:104`, `equipment/page.tsx:222-224` | The highest-urgency signal in the app is unreadable |
| 0.6 | **4 invalid Tailwind shades** (`emerald-450`, `slate-250`, `rose-350`, `emerald-350`) render no colour at all | twin, corrective detail, wms/new | Verified broken |
| 0.7 | **No confirm on "Cancel WO"**; no confirm on password reset | `work-orders/[id]`, `settings/users` | One mis-tap, irreversible |
| 0.8 | **Delete 7 `shadow-xl`** slabs | 7 list pages | One-word deletions; moves the app a visual generation |

---

## PHASE 1 — Close the ISO majors *(≈1 week)*
*Everything an auditor would raise as a major. Small, surgical, uses machinery you already own.*

**1.1 NC / CAPA close-out gate.** Add `NC_CHAIN` to the existing chain engine; require root cause + ≥1 corrective action with owner and deadline + a dated effectiveness verification before `CLOSED`. Route `SAFETY_INCIDENT` through an HSE-led investigation chain. *Closes the 10.2 major.*

**1.2 Calibration integrity + traceability.** Split into instrument master + **immutable calibration events** (stop overwriting history). Add `traceableTo`, reference standard, lab name + accreditation number; as-found/as-left + pass/fail; require a stored certificate file (reuse the existing storage layer). On a FAIL, auto-raise an NC listing inspections since the last good calibration. *Closes the 7.1.5.2 major.*

**1.3 Permit & isolation discipline.** Define **when** a permit is required (rule keyed on work class/equipment category) and block `IN_PROGRESS` without it. Add an `isolation_points` child table (energy source, device, lock/tag number, applied-by, removed-by, verified-by). **Allow close-out on EXPIRED permits** (`CLOSED_LATE`) so de-isolation can always be signed. Require ≥1 JHA row with hazard + control. Validate WMS is `APPROVED` server-side. *Closes the 45001 major.*

**1.4 Competency gates — DEFERRED to Phase 1b.** The competency matrix is populated and consulted by nothing. Attach `requiredCompetency` to chain steps and WO types; block signing/assignment on missing or expired competency; snapshot the competency onto the signature row. *Deferred deliberately: it changes who can sign, and doing that in the same release as the new NC/permit gates risks locking people out of records mid-flight. Ship after the gates have been exercised on real data.*

**1.5 Evidence retrieval.** Date/entity/user filters + CSV export on the audit log (currently capped at 100 rows, unfilterable). Add `/reports/print/asset-history?assetId=&from=&to=` — the single most common auditor request, currently unanswerable. Soft-supersede signatures instead of deleting them.

---

### Phase 1 — status: SHIPPED (except 1.4)
Delivered: NC/CAPA close-out gate + safety-incident chain (1.1) · calibration
event history, traceability, as-found/as-left and the out-of-tolerance auto-NC
(1.2) · permit isolation register, lapsed-permit close-out as CLOSED_LATE,
mandatory JHA content and server-side WMS-approved check (1.3) · audit-trail
filtering/CSV and the per-asset maintenance dossier (1.5). 169 tests green.

**Follow-ups logged during Phase 1 (do not lose these):**
- Legacy-imported instruments have no calibration *events* until their next
  calibration — their history modal is empty and says so. Backfill one seed
  event per imported instrument from its master row.
- `src/lib/import/legacy.ts` writes the calibration master directly; it should
  emit an event like every other writer.
- CSV formula injection was fixed in the shared exporter (a cell opening with
  `= + - @` executes in Excel). Any NEW export path must go through
  `toCSV`/`escapeCell`, never hand-roll a join.
- The dossier's availability figure is an upper bound where breakdowns lack a
  downtime window; it prints how many are missing. Tightens once R31 lands.

---

## PHASE 2 — Design foundations *(≈1 week)*
*Build once, then everything else gets cheaper. Do not start Phase 3–5 UI work before this.*

**2.1 Design tokens in `globals.css`** — radius, shadow, type scale, focus ring. Today only two tokens exist, which is *why* drift is unpreventable.

**2.2 The four missing shared components:**
- **`PageHeader`** — mandated by UI-STANDARDS, **does not exist**; 40 pages hand-roll it (2 header systems, 4 chip variants, 2 back-link patterns).
- **`Field`/`FormRow`** — replaces **17 duplicated `const field` declarations** that have quietly diverged into 3 focus behaviours and 2 field greys.
- **`ResponsiveTable`** — extract the users-table pattern (**the only one of 13 tables with a mobile fallback**).
- **`EmptyState` / `TableSkeleton`** — replaces 22 one-off empty states and 67 spinner variants.

**2.3 Accessibility baseline:** one `:focus-visible` rule (**78 `focus:outline-none`, zero `focus-visible` today**); `Modal` gets `role="dialog"`, Escape, focus trap + restore, scroll lock; `KebabMenu` gets Escape + menu semantics; tabs get `role="tablist"`.

**2.4 Contrast + touch + zoom:** move status pills to the `-700` text step (current formula measures **2.95–4.26:1** — below AA); `@media (pointer: coarse) { input, textarea, select { font-size: 16px } }` to stop **iOS zooming on every field**; `min-h-11` on Button md/lg.

**2.5 Sweep:** retire the `/5` opacity tier (invisible on white — status tiles currently don't read as colour-coded), convert decorative `font-mono` to sans (~120 sites, keep it on IDs/timestamps), fix the sidebar's 8px logotype and 13px nav.

---

### Phase 2 — status: SHIPPED
Foundations: `:focus-visible` ring app-wide (78 elements had cleared the outline
with no replacement) · coarse-pointer 16px inputs (iOS zoomed on every field
tap) · `PageHeader`, `Field`, `EmptyState`, `TableSkeleton` built · `Modal` given
dialog semantics, Escape, focus trap + restore and scroll lock · `KebabMenu`
given menu semantics, Escape and 44px rows · badges 11px at the `-700` text tone
(the old formula measured 2.95–4.26:1, below AA) · `Button` md/lg at 44px.

Adoption across 26 module pages: headers migrated with plain-English subtitles
and document codes moved to their own slot, empty states that distinguish
"filtered out" from "nothing exists" (with Clear-filters wired), table
skeletons replacing full-page spinners, and the invisible `/5` tint tier
retired. 169 tests green.

**Residual drift (small, deliberate):** 7 hand-rolled emerald primaries and 2
local field-class declarations remain, in `permits/new` and `wms/new` — long
forms (JHA table, PPE grid, dynamic rows) where a half-migration is worse than
none. Migrate them when those forms are next touched for real work.

---

## PHASE 3 — The technician *(≈1 week)*
*All three failing journeys belong to this persona. Highest daily-life return in the product.*

**3.1 QR lands on an action screen, not the digital twin.** New `/equipment/[assetId]/do`: machine + status, then three thumb-sized cards — **Report a fault · Start today's PM · Why does it keep failing?** Collapses three journeys from 6–12 taps to **2**.

**3.2 "My work" home.** `/api/work-orders/mine` + an "Assigned to me" filter; show it as the dashboard's top block for maintenance roles. Today a technician's dashboard is an executive KPI board and their sign-off card is empty.

**3.3 Autosave + never lose a submission.** Debounced `localStorage` drafts on the PM checklist and RCA, restore-on-mount banner, `beforeunload` guard, keep form state on failure. **No draft persistence exists anywhere today.**

**3.4 Glove-operable checklist.** OK/NOT OK/NA buttons from ~22px to a `min-h-11` segmented control (the most-tapped control in the product, currently 22px tall and 4px apart); 16px remarks input; drop the redundant technician-name field (the session knows who you are).

**3.5 Offline honesty.** Online/offline banner; queue the PM/corrective POST rather than dropping it.

**3.6 Reachability.** Add **Troubleshoot** to the equipment kebab and quick actions — your most valuable feature is currently reachable only via a banner on the twin page.

---

## PHASE 4 — Maintenance capability *(≈2 weeks)*
*Converts the system from a compliant record-keeper into something that prevents failures.*

**4.1 PM job plans per equipment category** *(the big one)*. One generic 21-item checklist for a CNC lathe, a 5T crane, a compressor and an earthing system — **with every item pre-ticked OK** — is the finding an auditor reaches in five minutes. Build ~8 server-side job plans with acceptance criteria and measured values; require a deliberate status per item; reject empty checklists.

**4.2 PM schedule adherence.** Record `daysLate`; count compliant only within a ±N-day window. Generate the annual plan **forward from frequency**, not on completion — today a PM that is never completed never spawns its successor, so **neglecting a machine makes PM compliance rise**.

**4.3 Failure coding + `componentId`.** Two fields buy your entire reliability capability: a ~25-code failure-mode picklist and an FK from corrective records to the component registry you already populate. *Do not build a 5-level ISO 14224 hierarchy for 33 assets.*

**4.4 KPI honesty.** One definition of Availability (currently two on the same page); include planned downtime; MTTR denominator = all breakdowns (today, **leaving the downtime window blank removes a bad repair from MTTR**); exclude DECOMMISSIONED from denominators; treat AWAITING_PARTS as unavailable; replace the PTW-compliance metric that cannot go down; capture real labour hours so backlog stops being `openWOs × 2h`.

**4.5 Deferred-maintenance register.** A `DEFERRED` status requiring risk justification + Maintenance Manager approval + review date. Today deferral happens by silence.

**4.6 Criticality actually driving something** — PM frequency, WO priority, escalation lead time. Today it is a badge colour.

---

## PHASE 5 — Product polish *(≈1 week)*
**5.1 PE/SYS asset-type selector** — first control on the add-equipment form, driving prefix, category filter and helper text; `next-id` takes a `?prefix=`. **Today SYS assets can only be created by hand-typing an ID and hoping it's free.**
**5.2 Equipment registry** — mobile cards, PE/SYS segment, asset count + export, "needs attention" view, visible primary action.
**5.3 Role permission matrix** — roles × permissions grid; the artefact an ISO auditor actually asks for.
**5.4 Digital twin hierarchy** — one primary action (Report Fault), the rest demoted to ghost.
**5.5 Dashboard + KPI hero metric** — promote the worst-status figure instead of 4–15 equal-weight tiles.
**5.6 5 Whys as a causal chain** — numbered, connected, indented; highest single-screen aesthetic gain.
**5.7 De-jargon** — plain-English subtitles; use the label maps that already exist instead of raw enums.

---

## PHASE 6 — Strategic *(later, optional)*
Critical spares min/max for CRITICAL/HIGH machines (`AWAITING_PARTS` is currently invisible downtime); meter/runtime triggers for compressors and cranes; contractor induction + insurance expiry; emergency-equipment register + drill log; condition monitoring (thermography on panels, vibration on compressors). **Deliberately excluded as bloat at this scale:** full EAM purchasing, MES/OEE integration, RCM/FMEA suite, predictive analytics.

---

## Recommended sequencing

**Ship Phase 0 immediately** — a day's work that removes every actively-wrong behaviour.
**Then Phase 1** — it is the difference between passing and failing a surveillance audit, and it is mostly small work on machinery you already own.
**Then Phase 2 before any other UI work** — everything in Phases 3–5 is cheaper and more consistent once the four shared components exist.
**Phases 3 and 4 in parallel if capacity allows** — different files, different concerns.

If only three things ever get done: **Phase 0**, **1.1 (NC gate)**, **4.1 (PM job plans)**.
