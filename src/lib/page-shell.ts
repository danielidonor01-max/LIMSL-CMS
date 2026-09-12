// src/lib/page-shell.ts
// How wide a page is, how much air is around it, and how far apart its blocks
// sit. Three decisions that were being made sixty separate times.
//
// Measured across the app before this existed:
//
//   seven paddings   p-4, p-5, p-6, p-6 lg:p-8, p-8, p-10, p-16
//   six widths       max-w-3xl through max-w-7xl, plus md and 2xl
//   four rhythms     space-y-4, -5, -6, -8
//
// Administration was the clearest case: Settings at max-w-5xl, Settings →
// Users at 6xl, Settings → Import at 4xl. Three pages in one module, three
// widths, and somebody moving between them watches the content jump sideways
// each time without being able to say why.
//
// None of it was decided. Each page was written on a different day and took
// roughly whatever the last one looked like. Giov's screens do not do this:
// one shell, a small number of widths, everything else inherits.
//
// Deliberately a set of class strings rather than a wrapper component. A
// component would mean restructuring the JSX of every page, and the first
// attempt at that broke four of them on a closing tag. This changes one string
// per page and cannot alter the shape of anything.

/** The page background and column. Identical on every page; never varies. */
export const PAGE_ROOT = "min-h-screen bg-canvas text-ink-900 flex flex-col font-sans";

/**
 * `register` — a wide table of records. Equipment, work orders, permits.
 * `detail`   — one record, a feed, or a queue of things to act on.
 * `form`     — something to fill in. Narrow on purpose: a form the width of a
 *              register is a form nobody can follow across the page.
 */
export const PAGE_MAIN = {
  register: "flex-1 p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-8",
  detail: "flex-1 p-6 lg:p-8 max-w-5xl w-full mx-auto space-y-8",
  form: "flex-1 p-6 lg:p-8 max-w-3xl w-full mx-auto space-y-8",
} as const;

export type PageWidth = keyof typeof PAGE_MAIN;

/**
 * For the few pages whose main element also carries a grid. The width, padding
 * and rhythm still come from here; only the inner layout is the page's own.
 */
export const pageMain = (width: PageWidth, extra?: string) =>
  extra ? `${PAGE_MAIN[width]} ${extra}` : PAGE_MAIN[width];
