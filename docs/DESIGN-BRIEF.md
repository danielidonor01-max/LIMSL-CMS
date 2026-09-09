# LIMSL CMS — visual overhaul brief

Shared working document for the redesign. Claude works `phase-2`, Gemini works
`main` (see AGENTS.md §9).

Reference product: `https://test.giovchat.app/dashboard/auth/login`

## Why this document exists

The reference is a client-rendered single-page app. Fetching the URL returns a
loading shell containing a logo and nothing else: no stylesheet, no rendered
DOM, no computed styles. It cannot be read without a browser that executes
JavaScript and can sign in. Gemini has that; this document is where the findings
land so both agents build from one spec rather than two impressions.

**Nothing in the visual direction should be guessed.** Where this document has a
blank, the answer is unknown, not "use your judgement".

## What is already done (Claude, `phase-2`)

Colour is now a contract instead of a convention. It was previously named by
pigment in 3,746 places across 93 of 98 component files (`bg-slate-50`,
`text-emerald-600`). That convention was consistent, which is why it survived,
but nothing enforced it and nothing could change it: a new accent meant 210
edits and a reviewer's memory.

Colour is now named by **role**, defined once in `src/app/globals.css`:

| Role | Meaning | Currently resolves to |
|---|---|---|
| `ink-50…950` | Text, surfaces, lines. Two thirds of the app. | slate |
| `brand-50…950` | Primary action, and anything the eye should reach first. | emerald |
| `danger-50…950` | Overdue, breakdown, rejected, destructive. | rose |
| `warn-50…950` | Due soon, awaiting a signature, a legitimate exception. | amber |
| `info-50…950` | Scheduled, informational, nothing is wrong. | sky |
| `canvas` / `surface` / `line` | The page, a card, a border. | slate-50 / white / slate-200 |

The tokens alias the stock ramps, so adopting the contract changed no pixels:
2,465 insertions against 2,465 deletions, verified line-for-line.

**Applying the new direction is now an edit to one file.** Point the ramps at
the reference's values and the whole app follows.

Four guards in `src/lib/__tests__/design-tokens.test.ts` keep it that way: no
source file may name a retired palette, every ramp must be complete 50–950,
no token may be declared empty, and no utility may reference a token that does
not exist. The ramp checks exist because a utility pointing at an undeclared
token emits no CSS at all — the element renders with no colour while the build
succeeds and the typecheck passes.

`violet`, `teal` and `orange` are deliberately still raw. They are categorical
identity colours for roles (COO, Foreman, HSE) rather than system states, and
they need a decision (below) before they become tokens.

## What is needed from the reference

### 1. Colour
- [ ] Background of the page, and of a card sitting on it. Hex.
- [ ] Primary action colour, plus its hover and pressed states. Hex.
- [ ] Text colours: primary, secondary, disabled. Hex.
- [ ] Border/divider colour. Hex.
- [ ] Success, warning, danger, info. Hex for each, plus the tint used behind
      them in a badge or banner.
- [ ] Is it a light UI, a dark UI, or both? If both, which is the default?

### 2. Typography
- [ ] Typeface name(s), and where they come from (Google Fonts, self-hosted,
      system stack). We currently load Inter via `next/font`.
- [ ] The type scale actually in use: size and weight for page title, section
      heading, body, small/meta, and the smallest label.
- [ ] Line height for body text.
- [ ] Are labels set in caps? (Ours are, widely. Worth confirming rather than
      copying.)

### 3. Shape and depth
- [ ] Border radius for: buttons, inputs, cards, dialogs, badges/pills.
- [ ] Shadows: are cards flat with a border, or raised with a shadow? Give the
      shadow values if raised.
- [ ] Border width and whether borders are used at all.

### 4. Layout and density
- [ ] Sidebar: width, collapsed or expanded by default, icon-only or
      icon-plus-label, and how the active item is marked.
- [ ] Top bar: height, what sits in it, and whether it is sticky.
- [ ] Page padding and the gap between cards.
- [ ] Content max width.
- [ ] Table rows: height and padding. This drives how much a technician sees
      without scrolling, which matters more here than on a chat product.

### 5. Components worth copying
- [ ] Anything the reference does noticeably better than we do: empty states,
      loading, form layout, how errors appear, how a dialog opens.
- [ ] Screenshots are more useful than descriptions. Put them in
      `Information Document/Design Reference/`.

### 6. Decisions this project must make, which the reference cannot answer
- [ ] The reference is a chat product. This is a compliance system used on a
      workshop floor, sometimes in gloves, sometimes on a phone. Where the
      reference is airy and low-density, we may need to keep density. Flag any
      borrowing that would cost information per screen.
- [ ] Role badge colours (COO, Foreman, HSE and the rest) currently use six
      distinct hues. Do they stay categorical, or collapse into the neutral
      ramp with the role spelled out in text?
- [ ] Touch targets: ours are 44px minimum, deliberately. Do not reduce them to
      match a desktop chat UI.
- [ ] The printed documents (Permit to Work, reports) must keep matching the
      paper forms. They are excluded from the reskin.

## Constraints that hold regardless of direction

- Light theme is the default; dark is a later phase (AGENTS.md §2).
- Focus rings are a WCAG 2.4.7 requirement and are enforced with `!important`
  in `globals.css` after a previous fix silently failed on 47 of 64 elements.
  Do not weaken them for aesthetics.
- 44px minimum touch target on `md`/`lg` buttons.
- Body text at 16px on touch devices, or iOS zooms the field and does not
  zoom back.
- Print styles (`.print-only`, `.print-sheet`) are a separate visual system and
  are not part of this overhaul.

## Sequence

1. Gemini fills in the sections above from the live reference.
2. Claude points the ramps at the new values, one file, and reviews every
   screen for contrast and legibility at the new palette.
3. Typography, radius and shadow follow as their own token groups, the same way
   colour did.
4. Layout and density last, because it is the only part that changes what fits
   on a screen.
