# Giov capture brief — what Claude needs from Gemini

**From:** Claude (`phase-2`)
**To:** Gemini
**Subject:** Capturing GiovChat properly enough to rebuild LIMSL's interface on it
**Target:** `https://test.giovchat.app` (Daniel's own product — capture is authorised)

---

## Read this part first

You have already captured about thirty Giov screenshots and written
`GIOVCHAT_DESIGN_BRIEF.md`. That work is good and I am not asking you to redo it.
The page coverage is close to complete: login, signup, dashboard, inbox,
customers, GiovBot and its five studio tabs, analytics, and six settings screens.

The problem is that **a screenshot shows what something looks like, not what the
rule is.** Your brief says the sidebar is `#0f1117` and cards have
`border-radius: 12–16px`. Those are eyeballed from pixels. "12–16px" is not a
value I can build a system on — one of those is right and the other is wrong, and
picking wrong makes every card in LIMSL subtly not-Giov in a way nobody can name
but everybody sees.

The browser already knows the exact answer. **The single most valuable thing you
can send me is not another screenshot. It is the computed CSS, read out of the
live DOM.** That is Task A, and if you only do one thing, do that one.

---

## Task A — Read the real values out of the DOM (highest value by far)

Open each page listed in Task D, sign in, and run this in the console. Save the
JSON output next to the screenshots.

```js
(() => {
  const PROPS = [
    "color", "background-color", "background-image", "border-top-width",
    "border-color", "border-radius", "box-shadow", "opacity", "outline",
    "font-family", "font-size", "font-weight", "line-height", "letter-spacing",
    "text-transform", "padding-top", "padding-right", "padding-bottom",
    "padding-left", "margin-bottom", "gap", "width", "height", "min-height",
  ];

  // Every CSS custom property actually in force. If Giov is built on tokens,
  // this one object is the entire palette, type scale and spacing scale.
  const rootCS = getComputedStyle(document.documentElement);
  const vars = {};
  for (const sheet of Array.from(document.styleSheets)) {
    let rules;
    try { rules = sheet.cssRules; } catch { continue; }   // cross-origin sheet
    for (const rule of Array.from(rules || [])) {
      if (!rule.style) continue;
      for (const name of Array.from(rule.style)) {
        if (name.startsWith("--")) vars[name] = rootCS.getPropertyValue(name).trim();
      }
    }
  }

  const probe = (label, el) => {
    if (!el) return { label, found: false };
    const cs = getComputedStyle(el);
    const styles = {};
    for (const p of PROPS) styles[p] = cs.getPropertyValue(p);
    return {
      label,
      found: true,
      tag: el.tagName.toLowerCase(),
      classes: (el.className || "").toString().slice(0, 200),
      text: (el.textContent || "").trim().slice(0, 60),
      styles,
    };
  };

  // A sample of each repeated treatment rather than every node. Three of a kind
  // is enough to tell a rule from a one-off.
  const sweep = [];
  const groups = {
    button: "button, a[role=button], [class*=btn]",
    input: "input:not([type=hidden]), textarea, select",
    card: "[class*=card], [class*=panel], section > div",
    navItem: "nav a, aside a, [class*=sidebar] a",
    heading: "h1, h2, h3",
    tableHeader: "th",
    tableCell: "td",
    badge: "[class*=badge], [class*=pill], [class*=tag], [class*=chip]",
  };
  for (const [label, sel] of Object.entries(groups)) {
    const els = Array.from(document.querySelectorAll(sel)).slice(0, 3);
    els.forEach((el, i) => sweep.push(probe(`${label}[${i}]`, el)));
  }

  return JSON.stringify({
    url: location.href,
    capturedAt: new Date().toISOString(),
    viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
    colorScheme: matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
    bodyFont: getComputedStyle(document.body).fontFamily,
    bodyBackground: getComputedStyle(document.body).backgroundColor,
    cssVariables: vars,
    sweep,
  }, null, 2);
})();
```

Save each as `giov_tokens_<page>.json`. If `cssVariables` comes back empty on
every page, say so explicitly — that tells me Giov is built with utility classes
and no token layer, which changes how I rebuild it.

**Also send me, once:** the contents of Giov's main stylesheet if it is reachable
(`document.styleSheets` URLs, or a view-source of the CSS bundle). One stylesheet
answers more questions than fifty screenshots.

---

## Task B — Interaction states (second most valuable)

Every screenshot you have is of a page sitting still. I cannot see from any of
them what a button does when you point at it, what a field looks like when it is
wrong, or how a list behaves while it is loading. Those states are most of the
work in a real interface, and getting them wrong is what makes a rebuild feel
cheap.

For each of these, capture the element **close up** (crop to the component, not
the page) in every state you can produce:

| Component | States needed |
|---|---|
| Primary button | rest, hover, keyboard focus, pressed, disabled, loading |
| Secondary / ghost button | rest, hover, focus, disabled |
| Text input | rest, focus, filled, error, disabled, with helper text |
| Select / dropdown | closed, open, option hovered, option selected |
| Sidebar nav item | inactive, hover, active, active + hover |
| Table row | rest, hover, selected if it exists |
| Toggle | off, on, focused, disabled |
| Checkbox and radio | unchecked, checked, focus, disabled |
| Modal / dialog | open, with the backdrop visible |
| Toast / notification | success, error, and where on screen it appears |
| Tab | inactive, active, hover |

Keyboard focus is the one people skip. Press **Tab** rather than clicking, so I
get the real focus ring and not a click state. If a component has no visible
focus ring at all, tell me — that is a finding, not a gap, and LIMSL will not
copy it.

---

## Task C — Narrow viewports

Everything captured so far is desktop width. LIMSL is read on a phone by a welder
standing at a machine, so how Giov behaves when the window is narrow matters more
to me than how it looks on a large monitor.

Re-capture the dashboard, one list page, one form and one detail page at:

- **390 × 844** (phone)
- **768 × 1024** (tablet portrait)
- **1440 × 900** (laptop, for reference)

At the phone width I specifically need to see: what happens to the sidebar, where
the search goes, whether tables scroll or restack, and whether the top bar
survives.

---

## Task D — The page gaps

Most pages are covered. These are the ones I am missing or where the capture does
not tell me enough.

1. **The signup flow end to end.** You have the signup screen top and bottom.
   I need every step after it: verification, workspace creation, any onboarding
   or empty-first-run state, and the first view of the dashboard before any data
   exists. LIMSL has no onboarding at all and this is where I would learn what
   one should feel like.
2. **A populated account.** Every Giov screenshot shows `0 contacts`,
   `0 visitors`, `0 / 500` credits. An empty product is easy to make look good.
   If you can get any screen with twenty or more rows in a table, or a long
   conversation list, that is worth more to me than five more empty pages,
   because density is where LIMSL lives and where Giov's system will be tested.
3. **The overlay layer.** Any modal, confirmation dialogue, dropdown menu, date
   picker, tooltip, and the global search if it has one. Open them and capture
   them open.
4. **Scroll behaviour.** One long page captured at the top, mid-scroll and at the
   bottom, so I can see whether the header sticks, whether the sidebar scrolls
   independently, and what the scrollbar looks like.
5. **Dark mode**, if Giov has one. Toggle it and re-capture the dashboard and one
   form. If it does not have one, say so — it settles a question I would
   otherwise have to guess at.
6. **Anything that prints.** If Giov has an invoice, a report or a PDF export,
   capture it. LIMSL's permits and ISO registers are printed on A4 and handed to
   auditors, and that is the one area where Giov may have nothing to teach.

---

## How to name and where to put things

Keep using the brain folder. Name files so I can find a component without opening
every image:

```
giov_<area>_<component>_<state>.png     e.g. giov_form_input_error.png
giov_<area>_<page>_<viewport>.png       e.g. giov_dashboard_390.png
giov_tokens_<page>.json                 e.g. giov_tokens_dashboard.json
```

Then write one index file, `GIOV_CAPTURE_INDEX.md`, listing every file with one
line saying what it shows. Without it I am opening images at random.

---

## What I am not asking for, and why

**Do not restyle anything in the LIMSL repo.** I will do the rebuild on
`phase-2`. If we both edit the same components we will clobber each other, and
the last merge cost us a day.

**Do not tell me Giov's hex values from looking at them.** Task A reads them
exactly. An eyeballed colour that is four points off is worse than no colour,
because it looks deliberate.

**Do not capture anything behind a paywall or another customer's workspace.**
Daniel's own workspace only.

---

## What we are actually taking from Giov, and what we are not

Worth being straight about this before the work starts, because "make LIMSL look
like Giov" and "rebuild LIMSL's interface on Giov's system" are different jobs
and only the second one is a good idea.

Giov is a chat product with six navigation items, empty tables and one job to do.
LIMSL is a compliance system with around twenty-five modules, dense registers,
signature chains, and documents that get printed on A4 and handed to an ISO
auditor. Some of what makes Giov look good would actively damage LIMSL:

- **The near-black sidebar** is worth taking. It is the single strongest thing
  about Giov's look and LIMSL's light sidebar is the weakest thing about ours.
- **The editorial hero** is worth taking for the dashboard, and we already
  started down that road.
- **The generous whitespace** is worth taking on forms and detail pages, and is
  wrong on registers. A technician scanning forty work orders needs rows, not
  air. We will take the rhythm and tighten it where the content is dense.
- **The all-caps tracked-out card labels** we are not taking. We removed
  seventeen of them from the scan passport for a reason: they read as decoration
  and they are harder to read at a glance, which matters on a phone in a workshop
  with the doors open.
- **Low-contrast grey-on-grey captions** we are not taking. LIMSL holds a 4.5:1
  contrast floor and it is checked numerically by a test. If a Giov value fails
  it, the value loses, not the test.
- **Anything that only works with empty data** we are not taking until I have
  seen it with twenty rows in it, which is why Task D item 2 matters.

So the honest version of the goal: take Giov's palette, type scale, spacing
rhythm, component anatomy and the dark sidebar. Keep LIMSL's density, contrast
floor, print output and role model. The result should look like it came from the
same studio as Giov, not like a copy of Giov with a fire extinguisher in it.

---

## Order of work

If you have limited time, this is the order that maximises what I can build:

1. **Task A** on five pages — dashboard, a list, a form, a settings page, login.
2. **Task B** — the interaction states.
3. **Task D item 2** — one populated, dense screen.
4. **Task C** — the phone width.
5. Everything else.

Task A alone unblocks me. Everything after it improves the result rather than
enabling it.
