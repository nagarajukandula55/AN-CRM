/**
 * ONE-TIME (CLI): seed 2-3 templates per document type across every
 * business. Actual spec/logic lives in
 * src/core/documentTemplates/seedVariety.ts (shared with the in-app
 * super-admin trigger at /api/admin/seed-document-templates, for when
 * there's no local .env.local/MONGODB_URI to run this script against).
 *
 * HOW TO RUN:
 *   npx tsx --env-file=.env.local scripts/seedDocumentTemplateVariety.ts
 */

import { connectDB } from "../src/core/db/mongodb";
import { seedDocumentTemplateVariety } from "../src/core/documentTemplates/seedVariety";

async function main() {
  await connectDB();
  const results = await seedDocumentTemplateVariety();
  for (const r of results) {
    console.log(`Seeded ${r.created.length} template(s) for "${r.businessName}": ${r.created.join(", ")}`);
  }
  console.log(`Done. ${results.length} business(es) updated.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Failed:", err);
    process.exit(1);
  });
