/**
 * ONE-TIME: give every existing business an explicit, saved, editable
 * INVOICE DocumentTemplate matching what they get today (defaultBlocksFor's
 * built-in fallback block order) -- per explicit direction: "whatever
 * already current was there you can save them as current using now."
 *
 * Before this, a business with no saved INVOICE template silently rendered
 * via getTemplateForBusiness()'s built-in fallback (invisible in the Admin
 * > Document Templates builder -- nothing to click "Edit" on). This makes
 * that fallback a real, visible, duplicable row named "Current" so an
 * admin can open the builder and start customizing from what's actually
 * live today, or duplicate it before making changes, rather than editing
 * blind. INSERT-ONLY: skips any business that already has a default
 * INVOICE template (never overwrites a real customization).
 *
 * HOW TO RUN:
 *   npx tsx --env-file=.env.local scripts/seedDefaultInvoiceTemplates.ts
 */

import { connectDB } from "../src/core/db/mongodb";
import Business from "../src/models/Business";
import DocumentTemplate from "../src/models/DocumentTemplate";
import { defaultBlocksFor } from "../src/core/documentTemplates/blockPalette";

async function main() {
  await connectDB();

  const businesses = await Business.find({}).select("_id name").lean();

  for (const biz of businesses as any[]) {
    const existing = await DocumentTemplate.findOne({
      businessId: biz._id,
      documentType: "INVOICE",
      isDefault: true,
    });
    if (existing) {
      console.log(`Skipping "${biz.name}" — already has a default INVOICE template.`);
      continue;
    }

    await DocumentTemplate.create({
      businessId: biz._id,
      documentType: "INVOICE",
      name: "Current",
      isDefault: true,
      blocks: defaultBlocksFor("INVOICE"),
      accentColor: "#111827",
    });
    console.log(`Created "Current" INVOICE template for "${biz.name}".`);
  }

  console.log("Done.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Failed:", err);
    process.exit(1);
  });
