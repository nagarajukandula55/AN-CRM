/**
 * ONE-TIME CLI: seeds the curated Indian-market catalog (see
 * src/core/catalog/seedCatalogData.ts for the actual data/logic and its
 * full scope/idempotency notes) across EVERY business in the database.
 *
 * For seeding just one business from the browser (no local .env.local /
 * shell access needed), use the "Seed Standard Catalog" button on the
 * admin Brands page instead, which hits POST /api/admin/seed-catalog and
 * runs the exact same seedForBusiness() against the server's own already-
 * configured DB connection.
 *
 * HOW TO RUN:
 *   npx tsx --env-file=.env.local scripts/seedDeviceCategories.ts
 */

import { connectDB } from "../src/core/db/mongodb";
import Business from "../src/models/Business";
import Brand from "../src/models/Brand";
import { seedForBusiness } from "../src/core/catalog/seedCatalogData";

async function main() {
  await connectDB();

  // Brand's unique index changed from {businessId, name} to {businessId,
  // category, name} (see Brand.ts's comment) -- Mongoose's default
  // autoIndex only ADDS newly-declared indexes, it doesn't drop the old one
  // still sitting in MongoDB, so the old constraint would keep rejecting a
  // legitimate second "Apple"/"Samsung" row under a different category.
  // syncIndexes() reconciles the collection's real indexes with the schema.
  console.log("Syncing Brand indexes...");
  await Brand.syncIndexes();

  const businesses = await Business.find({}).select("_id name").lean();
  console.log(`Seeding device categories for ${businesses.length} business(es)...`);

  for (const biz of businesses) {
    console.log(`Business: ${(biz as any).name || biz._id}`);
    await seedForBusiness(String(biz._id));
  }

  console.log("Done.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
