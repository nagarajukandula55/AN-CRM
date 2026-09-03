/**
 * Corrective backfill: for every vendor with a legacy Subscription row
 * (subVendorOf set, status "TRIAL"), makes sure VendorSubscription.
 * currentPeriodEnd is never EARLIER than that Subscription's trialEndsAt/
 * expiryDate.
 *
 * Root cause this fixes: the two records are meant to be written together
 * (see services/vendorActivation.service.ts's activateVendorWithTrial),
 * but some existing vendors' VendorSubscription.currentPeriodEnd had
 * drifted behind their legacy Subscription.trialEndsAt (validityDays had
 * been bumped to 15 without currentPeriodEnd following). Since
 * /api/vendor/billing, /api/admin/vendor-billing, and the vendor portal's
 * TrialPlanBanner all compute their own EXPIRED/ACTIVE status purely from
 * VendorSubscription.currentPeriodEnd -- independent of
 * lib/vendor/checkTrialAccess.ts, which checks the legacy Subscription
 * FIRST and is what actually blocks the portal -- this drift meant a
 * vendor could see "Trial ended" / EXPIRED everywhere in the UI while
 * still technically not locked out, or vice versa. Reported live: the
 * admin Vendor Billing page showed EXPIRED for 3 vendors whose real trial
 * (per Subscription.trialEndsAt) still had a week left.
 *
 * Dry-run by default. Pass --confirm to write.
 *
 *   npx tsx --env-file=.env.local scripts/syncVendorSubscriptionFromLegacyTrial.ts
 *   npx tsx --env-file=.env.local scripts/syncVendorSubscriptionFromLegacyTrial.ts --confirm
 */
import { connectDB } from "../src/lib/mongodb";
import Subscription from "../src/models/Subscription";
import VendorSubscription from "../src/models/VendorSubscription";

const CONFIRM = process.argv.includes("--confirm");

async function main() {
  await connectDB();

  const trialSubs = await Subscription.find({ subVendorOf: { $ne: null }, status: "TRIAL" }).lean();
  console.log(`Found ${trialSubs.length} legacy TRIAL Subscription rows to check.`);

  let updates = 0;
  for (const sub of trialSubs as any[]) {
    const authoritativeEnd = sub.trialEndsAt || sub.expiryDate;
    if (!authoritativeEnd) continue;

    const vs = await VendorSubscription.findOne({ vendorId: sub.subVendorOf });
    if (!vs) continue;

    const currentEnd = vs.currentPeriodEnd ? new Date(vs.currentPeriodEnd) : null;
    if (currentEnd && currentEnd.getTime() >= new Date(authoritativeEnd).getTime()) continue; // already in sync or ahead

    updates++;
    console.log(
      `  vendor=${sub.subVendorOf}: VendorSubscription.currentPeriodEnd ${currentEnd?.toISOString() || "(none)"} -> ${new Date(authoritativeEnd).toISOString()}`
    );
    if (CONFIRM) {
      vs.currentPeriodEnd = new Date(authoritativeEnd);
      await vs.save();
    }
  }

  console.log(`${updates} VendorSubscription row(s) would be updated${CONFIRM ? " (written)" : " (dry-run)"}.`);
  if (!CONFIRM) console.log("\nDry run only -- pass --confirm to actually write.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
