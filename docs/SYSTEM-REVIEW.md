# LIMSL CMS — System Review (2026-07)

Full-system audit: flows & business logic, security & robustness, notifications,
AI. Produced by two independent read-only review passes plus a targeted audit of
the AI/notification layers; every finding was verified against the code at
review time. This document is the working backlog for the fix sprints — tick
items as they land.

## Verdict

Architecture is sound: canonical roles module, generic data-driven sign-off
engine, server-computed KPIs, honest notification outbox, guardrailed AI. The
core weakness found: **the compliance spine was only half-enforced** — permits /
WMS / procedure derive status from sign-off chains, but corrective close-out and
PM completion did not, and several attribution fields trusted the client.

## Strengths (preserve these patterns)

- PTW enforced as a real server-side gate (work can't start, PMs can't submit
  without an ACTIVE permit).
- Downtime/KPI inputs computed server-side from production hours; client never
  trusted.
- Permit/WMS/procedure status derived from chains — approval can't be forced.
- All 58 API routes correctly role-gated before side effects; no mass
  assignment; no self-role-escalation; scrypt + timingSafeEqual; path traversal
  blocked; API keys AES-GCM encrypted with masked hints only.
- Month-end recurrence clamping; occurrence dedup; escalation digests with
  per-day dedup; delivery never blocks the originating write.

## Sprint 1 — Compliance integrity ✅ (this commit series)

- [x] Corrective close-out gated on the full CM chain (409 until complete),
      requires verified root cause + valid downtime window server-side.
- [x] Closed-record names derived from authenticated chain signatures (never
      client text); PM technician stamped from session.
- [x] PM sign-off chain started at checklist submission; step 1 auto-signed by
      the authenticated submitter; Foreman notified. (WO completion still
      records the physical work — the chain governs the record's approval.)
- [x] Equipment returns OPERATIONAL only when no other corrective is open
      (both corrective close-out and PM completion paths).
- [x] Reschedule loophole closed: RESCHEDULED rows reconcile to OVERDUE;
      past-dated reschedules rejected (server + client min).
- [x] Attribution & audit trail: NC create/update/close, risk updates,
      competency and calibration changes all write audit-log rows; NC
      `detectedBy` defaults to the authenticated raiser.
- [x] Rejection path: rejecting a step notifies the preparing role;
      `resetSignoffChain()` service added; a rejected procedure revision
      reconciles to REJECTED (unblocks new revisions — was a permanent
      deadlock); WMS content edits after any signature bump the revision,
      clear approval attribution, and reset the chain for re-approval.
- [x] Input guards: NC description required; competency level 0–5 finite;
      calibration interval positive finite.

Note on rejected steps in PM/CM chains: a rejected step remains directly
re-signable by the authorised role — correct for physical-work chains (fix the
issue, signer re-signs). Document modules (WMS/procedure) instead reset their
chains on rework, so signatures always attest to current content.

## Sprint 2 — Integrity & hygiene (next)

- [ ] Unique index `signoffs(entity_type, entity_id, step_order)` + upsert in
      `ensureSignoffChain` (duplicate-chain race).
- [ ] Document numbers from per-series counters, not `count()+1` (collision +
      reuse race). Applies to WO / permit / NC / WMS / CMRF numbers.
- [ ] Wrap PM completion + corrective creation multi-write flows in
      `db.transaction`.
- [ ] Move reconcile-on-read (permits, WMS, procedure, schedule) to a guarded
      job; keep GETs side-effect-free.
- [ ] Stop returning `details: error.message` to clients (~20 routes).
- [ ] Restrict staff directory PII (email/phone/WhatsApp) to admin roles.
- [ ] Rate-limit text-timestamp comparison edge (`.sssZ` vs `Z` formats).

## Sprint 3 — Operations & notifications

- [ ] Notify technician on WO assignment/reassignment.
- [ ] Calibration + training expiry digests in `runEscalations`.
- [ ] Wire the `notifyInApp` preference into NotificationBell.
- [ ] Completion path for non-PM work orders (corrective/emergency/calibration
      WOs currently strand IN_PROGRESS).
- [ ] Cancelling a WO clears `maintenanceSchedule.workOrderId` so the
      occurrence can be re-raised.
- [ ] Fix supervisor dropdowns filtering on non-existent roles
      (`SUPERVISOR`/`MANAGEMENT`).
- [ ] Confirm email delivery once SMTP env vars land in Vercel.

## Sprint 4 — AI & scale

- [ ] Chat diagnosis resolution feeds the diagnostic-guide learning loop (the
      one-shot path already does).
- [ ] Persist chat photo evidence (equipment documents/storage), not just a count.
- [ ] "Past diagnoses" list on the troubleshoot page.
- [ ] Index `signoffs(entity_type, entity_id)` and `notifications(user_id)`.
- [ ] Global search: SQL-side filtering + LIMIT (mirror the document-chunks FTS).
- [ ] Adopt `useApi` cache across remaining list pages.
- [ ] Scope the AI evidence pack's history query before fleet growth.
- [ ] Governance: move proprietary OEM docs off the free Gemini tier (paid tier
      with data-use opt-out) before scaling ingestion.

## Strategic

- Regression test suite for the sign-off engine + close-out rules (the
  compliance logic deserves tests beyond throwaway scripts).
- Offline-tolerant PWA for the shop floor; dark theme (deferred by design).
- Known-accepted: permit validity is 24 clock-hours; recurrence anchors to
  planned (not completion) date — documented decisions, revisit if operations
  disagree.
