/**
 * ONE-TIME (re-runnable/idempotent): seed Region, RegionTheme, and
 * ServiceCategory data for the ServiceFlow marketplace app (working name).
 * Upserts by natural key (stateCode / key), safe to re-run after adjusting
 * seed data in src/data/seed/*.
 *
 * HOW TO RUN:
 *   npx tsx --env-file=.env.local scripts/seedMarketplace.ts
 */
import { connectDB } from "../src/core/db/mongodb";
import Region from "../src/models/Region";
import RegionTheme from "../src/models/RegionTheme";
import ServiceCategory from "../src/models/ServiceCategory";
import { buildRegionSeeds } from "../src/data/seed/regions.seed";
import { REGION_THEME_SEEDS } from "../src/data/seed/regionThemes.seed";
import { SERVICE_CATEGORY_SEEDS } from "../src/data/seed/serviceCategories.seed";

async function main() {
  await connectDB();

  console.log("Seeding RegionTheme...");
  for (const theme of REGION_THEME_SEEDS) {
    await RegionTheme.findOneAndUpdate({ key: theme.key }, theme, {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    });
  }
  console.log(`  ${REGION_THEME_SEEDS.length} theme(s) upserted.`);

  console.log("Seeding ServiceCategory...");
  for (const category of SERVICE_CATEGORY_SEEDS) {
    await ServiceCategory.findOneAndUpdate({ key: category.key }, category, {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    });
  }
  console.log(`  ${SERVICE_CATEGORY_SEEDS.length} categor(y/ies) upserted.`);

  console.log("Seeding Region (all 36 states/UTs, only Andhra Pradesh enabled)...");
  const regions = buildRegionSeeds();
  for (const region of regions) {
    await Region.findOneAndUpdate({ stateCode: region.stateCode }, region, {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    });
  }
  console.log(`  ${regions.length} region(s) upserted.`);

  console.log("Done.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Failed:", err);
    process.exit(1);
  });
