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
| `text-3xl` (30) | Page title (`PageHeader`) |
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

## No native browser controls

Every control is drawn by the app. The browser's own widgets look different on
every operating system and cannot be made to match anything, so none are used:

| Instead of | Use |
|---|---|
| `<select>` | `Select` (or `Dropdown` for menus) |
| `<input type="date">` | `DateField` |
| `<input type="time">` | `TimeField` |
| `<input type="datetime-local">` | `DateTimeField` |

The risk in replacing a native control is that the custom one is worse. Custom
date pickers routinely lose typing, lose the keyboard, and become unusable on a
phone. These do not, and that is a requirement rather than a nicety:

- **The field is a text input first.** Type `15/09/2026`, `2026-09-15`, `15.9.26`
  or `5/9/26` and it resolves on blur. Times take `730`, `7:30`, `8pm`, `0805`.
  The calendar is an affordance, never the only way in.
- Full keyboard support in the calendar: arrows for a day, PageUp/PageDown for a
  month, Home/End for the week, Enter to pick, Escape to close.
- Day cells are 40px, controls meet the 44px touch floor, and text is 14px so
  iOS does not zoom the page and refuse to zoom back.
- The grid is always six rows, so the buttons under it do not move as you page
  through months.
- Pass `name` and `defaultValue` for a form read through `FormData`; the field
  holds its own value and renders a hidden input, so the submit contract is
  unchanged.

Dates are stored and displayed as `YYYY-MM-DD`. It is unambiguous, it sorts, and
what a person reads on screen is what an auditor reads in the export. Typed
input is read day-first, because that is the local convention and the ambiguity
has to break one way.

The grammar is in `lib/date-field.ts` under test. That is where date fields
usually go wrong.

### Scrollbars

The scrollbar is UI too, and it was the last piece of the operating system left
showing: on Windows a light grey slab with arrow buttons, sitting directly on
the near-black sidebar. It is drawn by the app now, once, in `globals.css` — a
4px thumb inside a 10px track, transparent track, no buttons. `.scroll-nav`
switches the thumb to the nav ramp for the dark column.

It is styled, not hidden. `scrollbar-width: none` is banned and a test enforces
it: the bar is the only thing on screen saying there is more nav below the fold,
and the sidebar carries twenty-odd destinations.

**Do not lift `scrollbar-width` or `scrollbar-color` out of the
`@supports not selector(::-webkit-scrollbar)` block.** Chrome ignores every
`::-webkit-scrollbar` rule on an element that also carries either property, and
falls back to the OS bar. Applying both sets to everything therefore styles
Firefox and silently un-styles Chrome and Edge. That was shipped once and caught
in a screenshot, not in review.

Anything scrollable on the dark navigation needs `scroll-nav`. The icon rail
also needs `scrollbar-gutter: stable both-edges`, or the bar eats 10px from the
right of a 64px column and every icon lands 5px left of the control beneath it.

## Density

`main` is `p-6 lg:p-8` with `space-y-8` between sections. Cards are `p-5`/`p-6`,
list rows and card headers `px-6 py-4`, table cells `py-3.5 px-5`.

Prefer more air than feels necessary. The **compact** list-density preference in
account settings exists for anyone who wants the dense view back, so the default
does not have to serve both.

## Icon sizes (locked)

Lucide icons, one family, stroke default. **Only two sizes for UI glyphs:**

- `w-4 h-4` — inline (in buttons, table cells, list items, meta rows).
- `w-5 h-5` — prominent (top-bar actions, empty states).
- `w-3.5 h-3.5` — allowed for tiny inline affordances (sort arrows, chips).
- There is no page-header icon chip. See the section on chrome below.

Do **not** use `w-4.5` or other off-scale sizes (normalised out).

## Spacing & composition

See **Density** above for the current values; this section previously carried
an older set and the two disagreed.

- Radius: `rounded-lg` for controls, `rounded-2xl` for cards, `rounded-full` for pills.

## Components (use these, don't reinvent)

| Need | Component | Notes |
|---|---|---|
| Any button | `@/components/Button` | `variant` (primary/secondary/danger/ghost/subtle), `size` (sm/md/lg), `icon`/`iconRight`, `loading`, `href` → renders a Link. Consistent icon spacing by construction. |
| Dialog / form modal | `@/components/Modal` | Centered, scrim, close button. Never a native dialog. |
| Any dropdown/picker in a form or filter bar | `@/components/Select` | **Native `<select>` is banned.** Select renders a styled field trigger + popover (no browser-drawn menu) and accepts the same `<option>` children; `onChange` gets the plain value. |
| Compact inline picker (tables, badges) | `@/components/Dropdown` | Trigger styled by the call site; popover menu. |
| Boolean setting (enable/disable) | `@/components/Toggle` | Switch, not a checkbox. Real checkboxes remain **only** for genuine tick-marks: checklist steps and signed attestations. |
| Page title row | `@/components/PageHeader` | Title + subtitle + optional code + actions. No icon chip; see the section on chrome. |
| Status pill | `@/components/Badge` | The `bg/text/border` tint formula. |
| Notifications | `sonner` `toast.*` | Success/error feedback. |

**Native controls:** none. Use `Select` (forms and filters) or `Dropdown`
(inline) rather than `<select>`, and `DateField` / `TimeField` / `DateTimeField`
rather than the native date inputs — the section above says why, and the OS
picker is no longer deliberate anywhere. Checkboxes remain only as tick-marks
(see above).

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

## Capitals, monospace and chrome

Three habits made the app read as generated, and all three are now rules.

**Field labels are sentence case.** Tracked-out capitals on every label is what
makes a form read as a government document. Capitals are kept for one thing: the
small label above a metric figure, where they are a data-label convention and
where the reference product does the same. `LABEL_CLASS` carries this.

**Monospace is for codes, not for dates.** `LEE/PE/1904` and `CMRF-2026-0031`
are read character by character and a fixed pitch helps. A date is not a code;
what a column of dates needs is figures of equal width, which is `tabular-nums`,
and it aligns them without changing the typeface.

**Page headers have no icon chip.** Fifteen modules opening with a tinted square
holding a different glyph is decoration pretending to be information, and it is
the single thing that made every header look like the same template. A page is
identified by a large heading and a real sentence saying what it is for. Put the
effort into the sentence.
