/**
 * ONE-TIME: give the Native storefront (the "E Commerce" business,
 * businessId 6a53e91f13ec6a86d3ccee44 -- see NEXT_PUBLIC_AN_BUSINESS_ID in
 * the Native frontend's .env.local) a real electronics ProductCategory
 * list, and tag its 106 existing electronics Brand rows to the matching
 * one. Currently this business's ProductCategory list is 5 unrelated food
 * items (Cold Pressed Oils, Dosa Mix, ...) left over from earlier testing,
 * while its brands are all electronics (Apple, Samsung, LG, ...) with zero
 * productCategoryId set -- so the vendor product-creation wizard's
 * Category and Brand dropdowns were two disconnected lists that didn't
 * even semantically match.
 *
 * Idempotent: category creation is findOne-then-create; brand tagging only
 * sets productCategoryId when unset, never overwrites an existing tag.
 * Does NOT touch the 5 existing food categories or the two placeholder
 * "Native"/"Mobile" brand rows with no deviceCategory -- those are left for
 * manual review since their real purpose is unclear from data alone.
 *
 * HOW TO RUN:
 *   npx tsx --env-file=.env.local scripts/seedNativeProductCategories.ts
 */

import { connectDB } from "../src/core/db/mongodb";
import Brand from "../src/models/Brand";
import ProductCategory from "../src/models/ProductCategory";
import { DEVICE_CATEGORIES, DEVICE_CATEGORY_LABELS, type DeviceCategory } from "../src/core/catalog/deviceCategory";

const NATIVE_BIZ = "6a53e91f13ec6a86d3ccee44";

async function main() {
  await connectDB();

  const categoryIdByDeviceCategory: Partial<Record<DeviceCategory, string>> = {};
  let categoriesCreated = 0;

  for (const dc of DEVICE_CATEGORIES) {
    const name = DEVICE_CATEGORY_LABELS[dc];
    let cat = await ProductCategory.findOne({ businessId: NATIVE_BIZ, name });
    if (!cat) {
      cat = await ProductCategory.create({
        businessId: NATIVE_BIZ,
        name,
        description: `Electronics category, matches the ${dc} device type used elsewhere in the platform.`,
        isActive: true,
        businessScope: "SINGLE",
      } as any);
      categoriesCreated++;
    }
    categoryIdByDeviceCategory[dc] = String(cat._id);
  }
  console.log(`ProductCategories: ${categoriesCreated} created (${DEVICE_CATEGORIES.length - categoriesCreated} already existed).`);

  const brands = await Brand.find({ businessId: NATIVE_BIZ, category: { $ne: null }, productCategoryId: null });
  let tagged = 0;
  for (const brand of brands) {
    const categoryId = categoryIdByDeviceCategory[brand.category as DeviceCategory];
    if (!categoryId) continue;
    brand.productCategoryId = categoryId as any;
    await brand.save();
    tagged++;
  }
  console.log(`Brands tagged: ${tagged}.`);

  const untagged = await Brand.find({ businessId: NATIVE_BIZ, category: null }).select("name").lean();
  if (untagged.length > 0) {
    console.log(`\nBrands with no deviceCategory set at all (left untouched, need manual review):`);
    for (const b of untagged as any[]) console.log(`  - ${b.name}`);
  }

  console.log("Done.");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
