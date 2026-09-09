# LIMSL CMS — UI Standards (locked-in style)

The single reference for how the UI looks and composes. **Use these tokens and
components; don't invent per-page variants.** Light theme only (dark is a later
phase). Read alongside `AGENTS.md` (hard rules) — notably: no native `alert()`/
`confirm()`, use `sonner` toasts + the `Modal` component.

## Palette

Colour is named by **role**, never by pigment. Write `bg-brand-600`, never
`bg-emerald-600`. The ramps are defined once in `src/app/globals.css` and a
reskin is an edit to that one file.

| Role | Token | Use |
|---|---|---|
| Accent / primary | `brand-600` (hover `brand-500`), text `brand-700` | Primary buttons, active nav, links, focus |
| Neutral surface | `surface` on `canvas` page bg | Cards, panels |
| Text | `ink-900` (primary), `ink-500` (secondary), `ink-400` (muted) | — |
| Borders | `line`, or `ink-200` where a shade is needed | Cards, inputs, dividers |
| Danger | `danger-600` / `danger-500` | Destructive, breakdowns |
| Warning | `warn-500/600` | Pending, due-soon |
| Info | `info-500/600` | Scheduled, neutral emphasis |

Every role carries a full `50…950` ramp. Status tints follow the
`bg-<role>-500/10 text-<role>-600 border-<role>-500/20` pill formula.
**Brand buttons always use `text-white`** (never dark text).

Four tests in `src/lib/__tests__/design-tokens.test.ts` enforce this: naming a
retired palette fails the build, and so does referencing a token that was never
declared. That second one matters because such a utility emits no CSS rule at
all, so the element loses its colour while the build and the typecheck both
pass.

`violet`, `teal` and `orange` remain raw. They are categorical identity colours
for roles rather than system states; see `docs/DESIGN-BRIEF.md`.

## Type scale

Fixed steps — don't use sizes outside this set:

| Class | Use |
|---|---|
| `text-xl` (20) | Page title (`h2`) |
| `text-lg` (18) | Section / header title (`h1` in per-page headers) |
| `text-sm` (14) | Card headings, table/body emphasis |
| `text-xs` (12) | Body, table cells, form inputs, buttons |
| `text-[11px]` / `text-[10px]` | Labels, captions, meta, badges |

Weights: headings `font-bold` (700), labels/emphasis `font-semibold` (600), body
`font-medium`/normal. Uppercase mono (`font-mono uppercase tracking-wider`) for
small section labels.

## Icon sizes (locked)

Lucide icons, one family, stroke default. **Only two sizes for UI glyphs:**

- `w-4 h-4` — inline (in buttons, table cells, list items, meta rows).
- `w-5 h-5` — prominent (page-header icon chip, top-bar actions).
- `w-3.5 h-3.5` — allowed for tiny inline affordances (sort arrows, chips).
- `w-8 h-8` — the emerald **icon chip** container (holds a `w-5 h-5` white icon).

Do **not** use `w-4.5` or other off-scale sizes (normalised out).

## Spacing & composition

- 4/8px rhythm: `gap-2` (8), `gap-3` (12), `gap-4` (16); section spacing `space-y-6`.
- Page container: `max-w-7xl w-full mx-auto p-6 space-y-6` (list/detail);
  `max-w-2xl`–`max-w-4xl` for forms.
- Cards: `bg-white border border-slate-200 rounded-xl p-5` (or `p-6`).
- Radius: `rounded-lg` for controls, `rounded-xl` for cards, `rounded-full` for pills.

## Components (use these, don't reinvent)

| Need | Component | Notes |
|---|---|---|
| Any button | `@/components/Button` | `variant` (primary/secondary/danger/ghost/subtle), `size` (sm/md/lg), `icon`/`iconRight`, `loading`, `href` → renders a Link. Consistent icon spacing by construction. |
| Dialog / form modal | `@/components/Modal` | Centered, scrim, close button. Never a native dialog. |
| Any dropdown/picker in a form or filter bar | `@/components/Select` | **Native `<select>` is banned.** Select renders a styled field trigger + popover (no browser-drawn menu) and accepts the same `<option>` children; `onChange` gets the plain value. |
| Compact inline picker (tables, badges) | `@/components/Dropdown` | Trigger styled by the call site; popover menu. |
| Boolean setting (enable/disable) | `@/components/Toggle` | Switch, not a checkbox. Real checkboxes remain **only** for genuine tick-marks: checklist steps and signed attestations. |
| Page title row | `@/components/PageHeader` | Icon chip + title + subtitle + actions. |
| Status pill | `@/components/Badge` | The `bg/text/border` tint formula. |
| Notifications | `sonner` `toast.*` | Success/error feedback. |

**Native controls:** no native `<select>` anywhere — use `Select` (forms/filters)
or `Dropdown` (inline). Date/time still use native `type="date|time|datetime-local"`
inputs (styled) — the OS picker is deliberate. Checkboxes only as tick-marks (see
above), styled `accent-emerald-600`.

**AI chat (DiagnosisChat):** buttons and interactive controls use the standard
emerald primary like the rest of the app; violet is reserved for *AI identity
accents only* (assistant label, hypothesis, evidence chips). The composer's
Enter behaviour follows the per-user preference `chatEnterToSend` (default off:
Enter = new line, Ctrl/Cmd+Enter sends) — never hardcode Enter-to-send.

## Navigation

- Left sidebar is grouped into labelled sections (Assets, Maintenance, Safety &
  Compliance, Performance & Resources, Administration) — see `Sidebar.tsx`. Add new
  modules to the right section, not a flat list.
- Active item: `bg-emerald-50 text-emerald-700 border-emerald-200`.
- Top bar: search + ⚡ Quick Actions + 🔔 notifications. Quick Actions holds the
  common *create* actions (role-gated), not nav duplicates.
- Every role-dependent render uses the `mounted` guard (see `AGENTS.md` §7).

## Accessibility baseline

- Text contrast ≥ 4.5:1 (slate-900/600 on white is fine; avoid slate-400 for body).
- Icon-only buttons need a `title`/`aria-label`.
- Keep focus operable; don't remove focus outlines without a replacement.
