/**
 * ONE-TIME: seed a global (businessId: null) DocumentNumberConfig row for
 * the "ROLE" document type, with template "{businessCode}-{seq}" so a
 * freshly-created role gets a serial like "ECOM-0001" out of the box on
 * every business, without each business having to configure it first --
 * generateNumberInScope() already falls back to the businessId:null config
 * row when a business has never saved its own override (numberingService.ts).
 *
 * Per explicit direction: "give a number to every role... like
 * BusinessID-sequence" -- businessCode is the human-readable per-business
 * identifier (e.g. "ECOM"), sequenceLength left at the model default (4),
 * so the result reads "ECOM-0001", "ECOM-0002", ...
 *
 * HOW TO RUN:
 *   npx tsx --env-file=.env.local scripts/seedRoleNumberConfig.ts
 */

import { connectDB } from "../src/core/db/mongodb";
import DocumentNumberConfig from "../src/models/DocumentNumberConfig";

async function main() {
  await connectDB();

  const existing = await DocumentNumberConfig.findOne({ businessId: null, documentType: "ROLE" });
  if (existing) {
    console.log("Global ROLE numbering config already exists — not touching it.");
    return;
  }

  await DocumentNumberConfig.create({
    businessId: null,
    documentType: "ROLE",
    template: "{businessCode}-{seq}",
    isActive: true,
  });
  console.log('Created global ROLE numbering config: template "{businessCode}-{seq}".');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Failed:", err);
    process.exit(1);
  });
