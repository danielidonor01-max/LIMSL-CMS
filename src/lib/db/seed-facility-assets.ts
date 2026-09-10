// src/lib/db/seed-facility-assets.ts
// Command-line wrapper around the same load the app runs from Settings, for
// anyone who has a connection string and would rather use a terminal.
//
//   DATABASE_URL=postgresql://... npx tsx src/lib/db/seed-facility-assets.ts
//
// The work itself lives in src/lib/facility-assets-load.ts, because the
// deployed app is the only thing that can reach this database and a load that
// only exists as a script is a load that does not happen.

import { loadFacilityAssets } from "../facility-assets-load";
import { AC_UNITS, CALIBRATED_INSTRUMENTS } from "../facility-assets";

async function main() {
  console.log("❄️  Loading office AC units and calibrated instruments...");

  const r = await loadFacilityAssets();

  console.log(
    `✅ ${r.created} created, ${r.updated} updated ` +
      `(${AC_UNITS.length} AC units, ${CALIBRATED_INSTRUMENTS.length} instruments)`,
  );

  if (r.assigned.length) {
    console.log("\n🏷️  Asset IDs assigned to the untagged instruments. Label them to match:");
    for (const a of r.assigned) console.log(`   ${a.assetId}  ${a.name}`);
  }

  console.log("\n⚠️  The source sheets disagree with each other in these places.");
  console.log("   Each is flagged in the asset's notes. Someone has to read the labels:");
  for (const c of r.conflicts) console.log(`   • ${c}`);
  console.log("\n🎉 Facility asset load complete.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("❌ Facility asset load failed:", e);
    process.exit(1);
  });
