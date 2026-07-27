/**
 * ONE-TIME PRODUCTION REPAIR: fixes the doubled SKU
 * ("BIZ-0001-VND-0001-PRD-0001-BIZ-0001-VND-0001-PRD-0001-V1") left behind
 * by the now-fixed bug in approve/route.ts's generateSKU() call, which
 * broke checkout ("Product not found: <doubled sku>").
 *
 * Run this against PRODUCTION (point MONGODB_URI at the production
 * database -- do NOT run with your local .env.local):
 *   npx tsx --env-file=.env.production.local scripts/fixDosaMixSku.ts
 * (or however you reference the production Mongo URI — adjust the
 * --env-file flag to whatever env file actually holds it)
 */
import { connectDB } from "../src/core/db/mongodb";
import Product from "../src/models/Product";
import ProductVariant from "../src/models/ProductVariant";
import NativeProduct from "../src/models/NativeProduct";

const DOUBLED = "BIZ-0001-VND-0001-PRD-0001-BIZ-0001-VND-0001-PRD-0001-V1";
const CORRECT = "BIZ-0001-VND-0001-PRD-0001-V1";

async function main() {
  await connectDB();

  const variant = await ProductVariant.findOneAndUpdate(
    { sku: DOUBLED },
    { $set: { sku: CORRECT } },
    { new: true }
  );
  console.log("ProductVariant fixed:", variant ? variant._id.toString() : "not found");

  const native = await NativeProduct.findOneAndUpdate(
    { sku: DOUBLED },
    { $set: { sku: CORRECT } },
    { new: true }
  );
  console.log("NativeProduct fixed:", native ? native._id.toString() : "not found");
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
