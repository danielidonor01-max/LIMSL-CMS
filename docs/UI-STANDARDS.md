# LIMSL CMS — UI Standards (locked-in style)

The single reference for how the UI looks and composes. **Use these tokens and
components; don't invent per-page variants.** Light theme only (dark is a later
phase). Read alongside `AGENTS.md` (hard rules) — notably: no native `alert()`/
`confirm()`, use `sonner` toasts + the `Modal` component.

## Palette

| Role | Token | Use |
|---|---|---|
| Accent / primary | `emerald-600` (hover `emerald-500`), text `emerald-700` | Primary buttons, active nav, links, focus |
| Neutral surface | `white` on `slate-50` page bg | Cards, panels |
| Text | `slate-900` (primary), `slate-500` (secondary), `slate-400` (muted) | — |
| Borders | `slate-200` | Cards, inputs, dividers |
| Danger | `rose-600` / `rose-500` | Destructive, breakdowns |
| Warning | `amber-500/600` | Pending, due-soon |
| Info | `sky-500/600` | Scheduled, neutral emphasis |

Status tints follow the `bg-<c>-500/10 text-<c>-600 border-<c>-500/20` pill formula.
**Green buttons always use `text-white`** (never dark text).

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
| Styled dropdown (non-native) | `@/components/Dropdown` | Button + popover, click-outside + Esc. Use in **tables** and anywhere a native `<select>` looks out of place. |
| Page title row | `@/components/PageHeader` | Icon chip + title + subtitle + actions. |
| Status pill | `@/components/Badge` | The `bg/text/border` tint formula. |
| Notifications | `sonner` `toast.*` | Success/error feedback. |

**Selects:** plain form `<select>`s are acceptable (they get a consistent custom
chevron via `globals.css`). For table-inline or badge-styled pickers, use
`Dropdown` instead — a native select there looks out of place.

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
