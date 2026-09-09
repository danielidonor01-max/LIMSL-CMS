# Response to the UI/UX audit of 9 September 2026

Triage and implementation plan for `LIMSL_CMS_UI_AUDIT.md` (Gemini, captured
live from `limslcms.vercel.app`).

## The audit was run against the wrong branch

`limslcms.vercel.app` serves `main`, which is at `82d43c9`. Every commit of the
overhaul is on `phase-2`. The audit is an accurate description of production and
a stale description of the work.

The screenshots were taken between 14:45 and 15:18 local. The dark sidebar
landed at 11:50 and the dashboard hero at 12:23, both on `phase-2`, neither on
`main`. Checked directly rather than inferred:

```
git show origin/main:src/components/Sidebar.tsx  ->  bg-white ... bg-emerald-50 active
git show origin/main:src/app/page.tsx            ->  `Welcome, ${firstName}`
```

That is not a criticism of the audit, which says what it saw. It does mean
roughly a third of Part 1, and **both P1 priorities**, are already done. Acting
on them again would be rework.

**Nothing here is verified against a running authenticated app.** The local
database is unreachable, so no human has yet looked at the overhaul. Some of
what follows may already be right, or wrong in ways no audit of `main` could
show.

## Already addressed on phase-2

| Audit finding | Where |
|---|---|
| F1 Sidebar has no identity | `31c24da` dark nav, ghost section labels at 4.82:1 |
| F2 Dashboard hero is passive | `d4d2958` headline carries the state |
| F3 Top bar is a decoration | `31c24da` surface + border, centred search |
| F5 Stat cards interchangeable (dashboard) | `d4d2958` MetricPanel |
| Equipment table is 12px throughout | `95ace7e` type floor raised, 11px minimum |
| P1 Dark sidebar | done |
| P1 Editorial greeting | done |

## Accepted and fixed now

**Markdown tables (P0).** Real, and the audit is right that it is the worst
thing on the list: a controlled document showing raw pipes tells an auditor
nobody has read the page. Fixed, but not the way the audit prescribes. It
suggests adding `react-markdown` + `remark-gfm`; the renderer is deliberately
hand-written so it cannot inject raw HTML, and that property is worth more than
the convenience. Table support is 90 lines in `lib/markdown-table.ts` with 13
tests, including the exact malformed revision table from the screenshot.

**Zero-state colour (P0).** The best finding in the audit, because it is about
meaning rather than taste. Status colour now describes the value, not the field:
a count of nothing is never coloured. The rule lives in `lib/status-tone.ts`
with tests, and inside `MetricPanel` so no page has to remember it. The tinted
card backgrounds went too, for the same reason the audit gives: they stayed red
at zero.

## Accepted, queued

| Finding | Note |
|---|---|
| F6 list rows are data dumps | Reference number should recede, title should lead. Real. |
| Recent Activity shows raw DB events | "Performance indexes applied: 62 ok" is a developer log in a manager's dashboard. The strongest page-level finding. |
| Notification bodies are walls of text | Also "handed to the mail server", which is our plumbing narrated at the user. |
| F7 empty state copy | Ours are paragraphs. That is my writing and the criticism lands. |
| Date formats disagree | ISO in corrective, US locale in permits. Pick ISO. |
| Emoji warning glyph in permits | Should be Lucide, like everything else. |
| Criticality badge reads MEDIUM everywhere | A badge with one value carries no information. |
| Per-page titles | See correction below. |

## Corrections to the audit

**"The `<title>` tag is empty — confirmed bug."** It is not empty. Every page
inherits the root title, so all 40-odd pages are called *LIMSL CMS |
Computerized Maintenance Management System*. That is a real problem for tabs,
history and bookmarks, and it needs a different fix: these are client
components, which cannot export `metadata`, so per-page titles need a route
layout or a small client-side setter. Worth doing, but it is not the one-line
fix the priority matrix implies.

## Rejected, with reasons

The audit is strongest where it argues from meaning and weakest where it argues
from taste. These are the places where following it would make the product
worse.

**F4, tinting page headers by module (rose for corrective, sky for safety).**
This contradicts F10 in the same document. F10 asks for a strict four-colour
status system where rose means broken; F4 spends rose as a decorative module
tint. You cannot have both, and the status language is worth more than the
navigational cue. A user who learns that a red header means "this page is about
breakdowns" has been taught to ignore red.

**F2, "move alert banners below the fold, don't lead with alarms."** Wrong for
this product. A supervisor opens this system to find out what is broken.
Ranking calm above that optimises the first two seconds against the job.
The hero already resolves the real complaint, which was that the alarm and the
greeting were two separate things competing: the alarm is now the headline.

**F8, replacing the native date input with a styled one.** Custom date pickers
are one of the most reliable ways to break mobile and keyboard input, and
technicians use phones. The native control is inconsistent across platforms
because each platform made it good on that platform.

**F8, a left sidebar of section navigation inside the form.** That is Notion's
answer to a fifty-field document. The work order form has seven fields.

**Login, "rename Sign in to Enter the portal."** Worse. "Sign in" is the
clearest label available, and personality bought with clarity is a bad trade on
the one screen where a user may be locked out and frustrated.

**Login, "replace the circles with an isometric diagram."** The circles should
go, agreed. An isometric SaaS illustration is the same cliché one generation
later, and the audit's own taxonomy would flag it.

**F5, "stop using all-caps labels."** Partly. All-caps plus monospace plus no
size hierarchy is bad; all-caps as a small tracked label is what the reference
product the audit admires does on its own metric cards. Keep the form, fix the
hierarchy.

## Order of work

1. **Promote `phase-2` to `main`.** Nothing else is worth doing until the audit
   and the product describe the same thing, and it retires both P1 items.
2. **Get eyes on it.** Then re-audit. Several remaining findings may be resolved
   or altered by work already shipped.
3. Recent Activity, notification bodies, empty-state copy. Editorial, cheap,
   and the audit is right about all three.
4. List row hierarchy, criticality badge, date format, the emoji.
5. Per-page titles.
6. Input guidance on description fields. Note that a minimum length would not
   have stopped `"Bad Tyer."` A placeholder and a hint might; validation theatre
   would only have produced a longer typo.
