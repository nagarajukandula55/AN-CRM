/**
 * Read-only diagnostic: lists every vendor/business currently blocked by
 * ANY of the trial/subscription gates (checkTrialAccess.ts's
 * isVendorBlockedByExpiredTrial for vendors, checkAccess.ts's
 * isSubscriptionBlocked for businesses), with enough detail to see exactly
 * which mechanism/date is responsible for each -- so a "still getting
 * subscription expired" report can be traced to the real cause instead of
 * guessed at.
 *
 *   npx tsx --env-file=.env.local scripts/diagnoseBlockedVendors.ts
 */
import { connectDB } from "../src/lib/mongodb";
import Subscription from "../src/models/Subscription";
import VendorProfile from "../src/models/VendorProfile";
import VendorSubscription from "../src/models/VendorSubscription";
import Business from "../src/models/Business";

async function main() {
  await connectDB();

  console.log("=== Subscription docs with subVendorOf set (instant-trial mechanism) ===");
  const subVendorSubs = await Subscription.find({ subVendorOf: { $ne: null } }).lean();
  for (const s of subVendorSubs as any[]) {
    const vendor = await VendorProfile.findById(s.subVendorOf).select("companyName createdAt").lean<any>();
    const trialEndsAt = s.trialEndsAt ? new Date(s.trialEndsAt) : null;
    const expiryDate = s.expiryDate ? new Date(s.expiryDate) : null;
    const now = Date.now();
    let blocked = false;
    if (s.status === "ACTIVE") blocked = false;
    else if (s.status === "EXPIRED") blocked = true;
    else if (s.status === "TRIAL") blocked = !!(trialEndsAt && trialEndsAt.getTime() < now);
    console.log(
      `  vendor=${vendor?.companyName || s.subVendorOf} status=${s.status} trialEndsAt=${trialEndsAt?.toISOString() || "-"} expiryDate=${expiryDate?.toISOString() || "-"} vendorCreatedAt=${vendor?.createdAt?.toISOString?.() || "-"} -> BLOCKED=${blocked}`
    );
  }

  console.log("\n=== VendorProfile.trialEndsAt (universal self-signup trial) ===");
  const selfSignupVendors = await VendorProfile.find({ trialEndsAt: { $ne: null } }).select("companyName trialEndsAt createdAt").lean();
  for (const v of selfSignupVendors as any[]) {
    const trialEndsAt = new Date(v.trialEndsAt);
    const vs = await VendorSubscription.findOne({ vendorId: v._id }).select("currentPeriodEnd planKey validityDays").lean<any>();
    const now = Date.now();
    const trialExpired = trialEndsAt.getTime() < now;
    const paidCoversNow = !!(vs?.currentPeriodEnd && new Date(vs.currentPeriodEnd).getTime() > now);
    const blocked = trialExpired && !paidCoversNow;
    console.log(
      `  vendor=${v.companyName} createdAt=${v.createdAt?.toISOString?.()} trialEndsAt=${trialEndsAt.toISOString()} vsCurrentPeriodEnd=${vs?.currentPeriodEnd ? new Date(vs.currentPeriodEnd).toISOString() : "-"} planKey=${vs?.planKey || "-"} validityDays=${vs?.validityDays ?? "-"} -> BLOCKED=${blocked}`
    );
  }

  console.log("\n=== Business-level Subscription (subVendorOf: null) -- checkAccess.ts / console gate ===");
  const bizSubs = await Subscription.find({ subVendorOf: null, status: { $in: ["ACTIVE", "EXPIRED"] } }).lean();
  for (const s of bizSubs as any[]) {
    const business = await Business.findById(s.businessId).select("name brandName createdAt").lean<any>();
    const expiryDate = s.expiryDate ? new Date(s.expiryDate) : null;
    const blocked = s.status === "EXPIRED" || (expiryDate ? expiryDate.getTime() < Date.now() : false);
    console.log(
      `  business=${business?.brandName || business?.name || s.businessId} status=${s.status} expiryDate=${expiryDate?.toISOString() || "-"} -> BLOCKED=${blocked}`
    );
  }

  console.log("\nDone.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
