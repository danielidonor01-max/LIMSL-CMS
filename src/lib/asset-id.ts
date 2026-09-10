// src/lib/asset-id.ts
// The asset-numbering policy, in one place.
//
// LIMSL numbers three different kinds of thing and the distinction is not
// cosmetic: PE is production equipment, a machine you can point at, take out
// of service and put a permit on. SYS is a facility system, the compressed-air
// ring, the earthing installation, the LV distribution, which is rarely "off",
// is maintained as an installation rather than a unit, and is what an auditor
// looks for when asking about infrastructure. OE is office and facility
// equipment: the split AC units in the offices and welfare block, each a
// serviceable unit with its own tag, serial and service interval.
//
// OE was not invented here. LIMSL already prints LEE/OE/#### on those units and
// keeps them in its own servicing sheets, so the register carries the tag that
// is on the wall. Renumbering them into an existing series would have meant the
// label and the record disagreeing, which is the one thing an asset register
// must never do.
//
// Before this module the generator only knew how to make PE codes, so creating
// a SYS asset meant typing an ID by hand and hoping it was free, with a unique
// constraint on the column, a collision surfaced as a generic save failure.

export const ASSET_PREFIXES = ["PE", "SYS", "OE"] as const;
export type AssetPrefix = (typeof ASSET_PREFIXES)[number];

// `tab` is one word on purpose. It sits in a segmented control that has to fit
// a 375px phone alongside three siblings and a count, and a two-word label
// wrapped onto three lines there. `noun` is the same idea written as prose for
// the register's subtitle, where "19 office" would read as a typo.
export const ASSET_PREFIX_META: Record<
  AssetPrefix,
  { tab: string; noun: string; label: string; help: string }
> = {
  PE: {
    tab: "Machines",
    noun: "machines",
    label: "Production Equipment",
    help: "A machine on the shop floor, lathes, presses, welders, cranes, compressors.",
  },
  SYS: {
    tab: "Systems",
    noun: "facility systems",
    label: "Facility System",
    help: "An installation rather than a unit, earthing, LV distribution, the compressed-air ring.",
  },
  OE: {
    tab: "Office",
    noun: "office units",
    label: "Office & Facility Equipment",
    help: "A serviceable unit outside the workshop, split AC units, office and welfare-block plant.",
  },
};

// Categories that are installations, not machines. Everything else is PE.
const SYSTEM_CATEGORIES = new Set(["SYSTEM", "ELECTRICAL_PANEL", "EARTHING", "FACILITY_AC"]);

export const prefixForCategory = (category: string | null | undefined): AssetPrefix =>
  SYSTEM_CATEGORIES.has((category ?? "").toUpperCase().trim()) ? "SYS" : "PE";

export const isAssetPrefix = (v: unknown): v is AssetPrefix =>
  typeof v === "string" && (ASSET_PREFIXES as readonly string[]).includes(v.toUpperCase());

// Built from ASSET_PREFIXES rather than spelled out, because the two used to
// be written separately and adding OE meant remembering to edit both. A prefix
// the list knows about but the pattern does not is the worst kind of bug here:
// parseAssetId returns null, the register silently files the asset under PE,
// and the create form rejects an ID that is printed on the unit.
const ASSET_ID_RE = new RegExp(`^LEE/(${ASSET_PREFIXES.join("|")})/(\\d{1,6})$`, "i");

export function parseAssetId(assetId: string | null | undefined): {
  prefix: AssetPrefix;
  serial: number;
} | null {
  const m = (assetId ?? "").trim().match(ASSET_ID_RE);
  if (!m) return null;
  return { prefix: m[1].toUpperCase() as AssetPrefix, serial: parseInt(m[2], 10) };
}

export const formatAssetId = (prefix: AssetPrefix, serial: number): string =>
  `LEE/${prefix}/${String(serial).padStart(4, "0")}`;

// The next free serial WITHIN a prefix, the two series are numbered
// independently, so LEE/PE/0007 and LEE/SYS/0007 can both exist.
export function nextAssetId(existingIds: (string | null | undefined)[], prefix: AssetPrefix): string {
  let max = 0;
  for (const id of existingIds) {
    const parsed = parseAssetId(id);
    if (parsed && parsed.prefix === prefix) max = Math.max(max, parsed.serial);
  }
  return formatAssetId(prefix, max + 1);
}

// Accepts a hand-typed ID. Returns the canonical (upper-case, zero-padded) form
// so "lee/pe/7" and "LEE/PE/0007" cannot both be entered as different assets.
export function normaliseAssetId(assetId: string): { ok: true; assetId: string } | { ok: false; error: string } {
  const parsed = parseAssetId(assetId);
  if (!parsed) {
    return {
      ok: false,
      error:
        "Asset ID must look like LEE/PE/0001 (a machine), LEE/SYS/0001 (a facility system) " +
        "or LEE/OE/0001 (office and facility equipment).",
    };
  }
  return { ok: true, assetId: formatAssetId(parsed.prefix, parsed.serial) };
}
