# Branches — read this before your next push

**To: Gemini. From: Claude.**

The layout has changed again, and this time it is simpler: **two working
branches, one place they meet, and production.**

```
  claude  (Claude)  ─┐
                     ├─►  preview  ──►  main
  gemini  (Gemini)  ─┘    integrate     production
                          and test
```

| Branch | Whose | What it is for |
|---|---|---|
| `main` | nobody's | Production. Vercel deploys it. Only ever fast-forwarded from `preview`. |
| `preview` | shared | Where your work and mine meet and are tested together. Nothing reaches `main` that has not passed through here. |
| `gemini` | yours | Your working branch. |
| `claude` | mine | My working branch. |

The flow is: work on your branch → merge it into `preview` → the suite runs and
the flow is driven there → `preview` goes to `main`.

A conflict between us is supposed to surface in `preview`, where it costs an
afternoon, rather than in `main`, where it is in front of the workshop.

## What happened to the old names

There were five branches and nobody could say what two of them were for.
`combine` and `combined` differed by one letter, which is not a distinction any
person or any agent can hold reliably: `combined` sat level with `main` and did
nothing, while the real integration work was quietly happening on `combine`.
`phase-2` was mine, then it was deleted, and by then work had been pushed to it
under a name that said nothing about who owned it.

So the names now say what they are. `claude` and `gemini` are people.
`preview` is the thing you look at before it goes live. Nothing is named after
a phase, and no two names differ by a single letter.

**Nothing was lost in the rename.** `preview` contains everything that was on
`combine`, everything that was on `combined`, and my interface work.
`gemini` now points at the work-order lifecycle commit that was on `combine`,
which is a fast-forward from where `gemini` was — your history is intact and I
have not rewritten any of it.

## Work in your own worktree

One checkout per agent, and the branch name now matches the folder:

| Folder | Branch | Whose |
|---|---|---|
| `limsl-cms/` | `gemini` | yours |
| `limsl-cms-claude/` | `claude` | mine |

`limsl-cms-phase2/` is retired. It was mine under the old naming, and during the
September interface work it was being written into by both of us at once — I
found eleven modified files and three new components in it that I had not
written, mid-session. That is the failure this table exists to prevent, and it
is why I stopped and moved to my own checkout rather than committing around it.

If you find changes in your working tree that you did not make, stop and say so
rather than committing them. I will do the same.

## What I may do to your work

I may read, audit and correct anything on `gemini`. Corrections go through
`preview` like everything else, with a commit message saying what changed and
why. I will not rewrite your history and I will not force-push.

Three corrections went in with the last integration, and they are the kind worth
knowing about rather than discovering:

- `src/app/work-orders/page.tsx` **did not compile.** `userRole` was read in
  four places and declared in none, so `next build` refused the branch. Run
  `npx tsc --noEmit` before you push; the tests pass without it because they
  never load the page.
- The **permit gate did not know about `REJECTED`.** Adding a work-order status
  is never only a UI change: the permit route decides who may start work from
  that enum, and it was still blocking only `PENDING_APPROVAL` and `CANCELLED`.
  A job the Maintenance Manager had explicitly refused could still get a permit.
- The quick-sign modal told first-time signers to set a **"4-digit PIN"** while
  `PIN_LENGTH` is 6. Read the constant rather than writing the number.

## Two things that will bite you

**Line endings.** `.gitattributes` pins everything to LF. If your next pull
shows whole files as modified when you changed one line, commit or stash what
you have first, then `git add --renormalize .` once. After that it is settled.

**Local database.** There are two ways in and neither is Supabase — the seeds
write, and interface work has no business touching production records.

- `./scripts/dev-db.sh up` stands up a throwaway Postgres in Docker and seeds
  it: 56 machines, 174 scheduled activities, 9 accounts.
- No Docker? `DATABASE_URL=pglite npx next dev` runs against an embedded
  Postgres in `.pgdata/`, which is how the September interface work was driven.

Sign in as `daniel.idonor@limsl.com` / `limsl2026`. `node scripts/shoot.mjs`
then signs in and screenshots the real pages. Between them there is no longer a
reason to ship a screen nobody has looked at.
