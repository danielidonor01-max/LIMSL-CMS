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

### Surfaces

| Token | Value | Use |
|---|---|---|
| `canvas` | `#f4f6fb` | The page behind everything |
| `surface` | white | Cards, panels, the top bar |
| `nav` | `#10131c` | The sidebar, and the dark button variant |
| `nav-raised` / `nav-active` | | Sidebar hover and active item |
| `nav-text` / `nav-text-active` / `nav-label` | | Sidebar text, active text, section labels |

The navigation is the one dark surface in a light application. Its greys are a
separate ramp from `ink`, which is tuned for text on white and turns muddy when
inverted.

**Secondary text sitting directly on the canvas uses `ink-600`, not `ink-500`.**
`ink-500` measures 4.32:1 there, under the 4.5:1 floor. On a white card
`ink-500` is correct and measures 4.76:1. This is the one place the two differ,
and it is why the canvas is not as dark as the reference product's.

### Cards

`bg-surface border border-line rounded-2xl shadow-card`. The shadow is a
1px hairline lift, never a drop shadow: on a dense compliance screen a real
shadow under every card turns the page into gravel.

For a row of related figures use `<MetricPanel>` rather than separate cards.
One panel with hairline dividers reads as a single object, which is what a set
of related measures is.

### Buttons

`primary` (brand), `secondary`, `danger`, `ghost`, `subtle`, and `dark`. Use
`dark` for the one lead action on a page that already has brand-coloured
controls, where a second green button would compete with them rather than lead
them.

### Badges

`<Badge dot>` adds a leading status dot in the current text colour. Reserve it
for a status that is live right now rather than a classification. If everything
has a dot it stops meaning "currently true".

## Type scale

Fixed steps — don't use sizes outside this set:

| Class | Use |
|---|---|
| `text-3xl`/`text-4xl` | The dashboard hero only. One per screen. |
| `text-2xl` (24) | Page title (`PageHeader`) |
| `text-base` (16) | Card and section headings |
| `text-sm` (14) | Body, row titles, prose |
| `text-xs` (12) | Table cells, meta, badges, form inputs, buttons |
| `text-[11px]` | Small caps labels, the floor |

**`text-[11px]` is the floor.** Nothing smaller. The app used to run on 10px and
11px text inside 8px padding: 494 uses at 11px or under against 442 at 12px,
with `gap-2` the most common spacing anywhere. That, not the palette, is what
made it feel crowded. The steps were raised together so the hierarchy is
unchanged and only the floor moved.

Weights: page titles `font-bold`, card headings `font-semibold` at 16px (bold at
14px reads as shouting inside a small block), body normal or `font-medium`.

## Density

`main` is `p-6 lg:p-8` with `space-y-8` between sections. Cards are `p-5`/`p-6`,
list rows and card headers `px-6 py-4`, table cells `py-3.5 px-5`.

Prefer more air than feels necessary. The **compact** list-density preference in
account settings exists for anyone who wants the dense view back, so the default
does not have to serve both.

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
