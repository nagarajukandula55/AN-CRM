/**
 * Extends every still-unpaid vendor's free trial from the old 7-day window
 * to the new 15-day window (see core/pricing/plans.ts / api/vendors/self-signup
 * TRIAL_DAYS, both raised 7 -> 15), recomputed from the vendor's own account
 * creation date ("ID creation"), not from today.
 *
 * Two places carry a trial window that need extending:
 *  - Subscription (legacy, status: "TRIAL") -- trialEndsAt/expiryDate.
 *  - VendorSubscription (the actual module-access gate) -- currentPeriodEnd,
 *    identified by validityDays === 7 (the old trial constant; every paid
 *    tier uses 30/365/730-day multiples, never exactly 7, so this can't
 *    accidentally touch a real paid subscription).
 *
 * Only ever extends (new date > old date) and only touches vendors that
 * have never made a payment (no invoiceId/paid VendorBillingInvoice) --
 * a vendor who already upgraded to a paid plan keeps their real paid
 * period untouched regardless of what their original trial window was.
 *
 * Dry-run by default (prints counts only, writes nothing). Pass --confirm
 * to actually write.
 *
 *   npx tsx --env-file=.env.local scripts/extendExistingTrialsTo15Days.ts
 *   npx tsx --env-file=.env.local scripts/extendExistingTrialsTo15Days.ts --confirm
 */

import { connectDB } from "../src/lib/mongodb";
import Subscription from "../src/models/Subscription";
import VendorSubscription from "../src/models/VendorSubscription";
import VendorProfile from "../src/models/VendorProfile";
import VendorBillingInvoice from "../src/models/VendorBillingInvoice";

const CONFIRM = process.argv.includes("--confirm");
const NEW_TRIAL_DAYS = 15;
const OLD_TRIAL_VALIDITY_DAYS = 7;

function addDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
}

async function main() {
  await connectDB();

  // ── Legacy Subscription (status: "TRIAL") ──────────────────────────
  const trialSubs = await Subscription.find({ status: "TRIAL" }).lean();
  console.log(`Subscription: ${trialSubs.length} TRIAL-status docs found`);

  let subUpdates = 0;
  for (const sub of trialSubs) {
    const anchor = (sub as any).startDate || (sub as any).createdAt;
    if (!anchor) continue;
    const newEnd = addDays(new Date(anchor), NEW_TRIAL_DAYS);
    const currentEnd = (sub as any).trialEndsAt || (sub as any).expiryDate;
    if (currentEnd && new Date(currentEnd).getTime() >= newEnd.getTime()) continue; // already >= 15 days, leave it
    subUpdates++;
    console.log(`  Subscription ${sub._id}: trialEndsAt/expiryDate -> ${newEnd.toISOString()}`);
    if (CONFIRM) {
      await Subscription.updateOne(
        { _id: sub._id },
        { $set: { trialEndsAt: newEnd, expiryDate: newEnd } }
      );
    }
  }
  console.log(`Subscription: ${subUpdates} would be updated${CONFIRM ? " (written)" : " (dry-run)"}`);

  // ── VendorSubscription (validityDays === 7 -> the old trial window) ─
  const trialVendorSubs = await VendorSubscription.find({ validityDays: OLD_TRIAL_VALIDITY_DAYS }).lean();
  console.log(`VendorSubscription: ${trialVendorSubs.length} docs with validityDays=${OLD_TRIAL_VALIDITY_DAYS} found`);

  let vsUpdates = 0;
  for (const vs of trialVendorSubs) {
    // Skip anyone who has ever actually paid -- a real paid invoice means
    // this isn't a live trial window regardless of the stale validityDays.
    const hasPaid = await VendorBillingInvoice.exists({ vendorId: (vs as any).vendorId, status: "PAID" });
    if (hasPaid) continue;

    const vendor = await VendorProfile.findById((vs as any).vendorId).select("createdAt").lean<any>();
    const anchor = vendor?.createdAt || (vs as any).currentPeriodStart || (vs as any).createdAt;
    if (!anchor) continue;
    const newEnd = addDays(new Date(anchor), NEW_TRIAL_DAYS);
    const currentEnd = (vs as any).currentPeriodEnd;
    if (currentEnd && new Date(currentEnd).getTime() >= newEnd.getTime()) continue;

    vsUpdates++;
    console.log(`  VendorSubscription ${vs._id} (vendor ${(vs as any).vendorId}): currentPeriodEnd -> ${newEnd.toISOString()}, validityDays -> ${NEW_TRIAL_DAYS}`);
    if (CONFIRM) {
      await VendorSubscription.updateOne(
        { _id: vs._id },
        { $set: { currentPeriodEnd: newEnd, validityDays: NEW_TRIAL_DAYS } }
      );
    }
  }
  console.log(`VendorSubscription: ${vsUpdates} would be updated${CONFIRM ? " (written)" : " (dry-run)"}`);

  // ── VendorProfile.trialEndsAt -- the universal self-signup trial ────
  // (see lib/vendor/checkTrialAccess.ts's own comment: this is the THIRD,
  // independent trial mechanism, separate from both models above).
  const selfSignupVendors = await VendorProfile.find({ trialEndsAt: { $ne: null } }).lean();
  console.log(`VendorProfile: ${selfSignupVendors.length} docs with trialEndsAt set found`);

  let vpUpdates = 0;
  for (const vendor of selfSignupVendors) {
    const anchor = (vendor as any).createdAt;
    if (!anchor) continue;
    const newEnd = addDays(new Date(anchor), NEW_TRIAL_DAYS);
    const currentEnd = (vendor as any).trialEndsAt;
    if (currentEnd && new Date(currentEnd).getTime() >= newEnd.getTime()) continue;

    // Skip anyone who has ever actually paid.
    const hasPaid = await VendorBillingInvoice.exists({ vendorId: vendor._id, status: "PAID" });
    if (hasPaid) continue;

    vpUpdates++;
    console.log(`  VendorProfile ${vendor._id}: trialEndsAt -> ${newEnd.toISOString()}`);
    if (CONFIRM) {
      await VendorProfile.updateOne({ _id: vendor._id }, { $set: { trialEndsAt: newEnd } });
      // Keep the matching VendorSubscription.currentPeriodEnd in sync too --
      // both are consulted by checkTrialAccess.ts.
      await VendorSubscription.updateOne(
        { vendorId: vendor._id },
        { $set: { currentPeriodEnd: newEnd } },
        { upsert: false }
      );
    }
  }
  console.log(`VendorProfile: ${vpUpdates} would be updated${CONFIRM ? " (written)" : " (dry-run)"}`);

  if (!CONFIRM) {
    console.log("\nDry run only -- pass --confirm to actually write these changes.");
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
