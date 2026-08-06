/**
 * ONE-TIME (re-runnable): pushes every EXISTING AN-CRM Business into
 * central-api's "businesses" dataset via the same sync path Business.ts's
 * post-save/post-findOneAndUpdate hooks now use going forward. Those hooks
 * only fire on a future save -- this backfills everything that already
 * existed before that sync was added, so resolveCentralBusinessId() (used
 * by every per-business cross-app override: integrations, report-field-
 * config, vendor-onboarding-config, role-catalog) actually has something
 * to find for businesses created before tonight.
 *
 * Requires CENTRAL_API_URL and CENTRAL_API_KEY (a registered site key,
 * not the admin key -- this uses the same write path a normal save does).
 *
 *   npx tsx --env-file=.env.local scripts/backfillBusinessesToCentral.ts
 */
import { connectDB } from "../src/lib/mongodb";
import Business from "../src/models/Business";
import { syncRecordToCentralApi } from "../src/lib/centralApiSync";

async function main() {
  await connectDB();

  const businesses = await Business.find({}).lean();
  console.log(`Found ${businesses.length} business(es) to sync.`);

  for (const b of businesses as any[]) {
    await syncRecordToCentralApi("businesses", String(b._id), {
      name: b.name,
      brandName: b.brandName,
      operatingMode: b.operatingMode,
      isActive: b.isActive,
      isPlatform: b.isPlatform,
      app: "an-crm",
    });
    console.log(`  synced ${b.name} (${b._id})${b.isPlatform ? " [platform]" : ""}`);
  }

  console.log("\nDone. Check central-api's Businesses tab -- every AN-CRM business should now show up with app: an-crm.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
