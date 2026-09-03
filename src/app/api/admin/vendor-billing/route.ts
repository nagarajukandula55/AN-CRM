import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import VendorProfile from "@/models/VendorProfile";
import VendorSubscription from "@/models/VendorSubscription";
import Subscription from "@/models/Subscription";
import Business from "@/models/Business";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { computeStatus, totalAmount } from "@/core/billing/billing.service";

/**
 * GET /api/admin/vendor-billing — every vendor across every business, with
 * its current plan/status, for the Super Admin's cross-business billing
 * overview. Super Admin only — pricing is not a per-business-admin concern.
 */
export async function GET() {
  try {
    const session = await getEnrichedSession();
    if (!session?.user || !session.isSuperAdmin) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }

    await connectDB();
    const [vendors, subs, businesses, legacyTrials] = await Promise.all([
      VendorProfile.find({ isDeleted: { $ne: true } }).select("vendorId companyName businessId status").lean(),
      VendorSubscription.find().lean(),
      Business.find().select("name").lean(),
      // The instant-trial mechanism (services/vendorActivation.service.ts)
      // writes a legacy Subscription row alongside VendorSubscription, and
      // lib/vendor/checkTrialAccess.ts -- the check that actually gates
      // portal access -- treats THIS row's trialEndsAt as authoritative.
      // VendorSubscription.currentPeriodEnd is meant to mirror it, but a
      // handful of vendors' copies had drifted stale (validityDays bumped
      // without currentPeriodEnd following), showing EXPIRED here while
      // the vendor's actual trial (and portal access) was still live.
      // Falling back to the later of the two dates keeps this admin view
      // honest even if that drift reappears before its root cause (data
      // written in two places instead of one) gets a real fix.
      Subscription.find({ subVendorOf: { $ne: null }, status: "TRIAL" })
        .select("subVendorOf trialEndsAt expiryDate")
        .lean(),
    ]);

    const subByVendor = new Map(subs.map((s: any) => [String(s.vendorId), s]));
    const nameByBusiness = new Map(businesses.map((b: any) => [String(b._id), b.name]));
    const legacyTrialEndByVendor = new Map(
      legacyTrials.map((s: any) => [String(s.subVendorOf), s.trialEndsAt || s.expiryDate])
    );

    const rows = vendors.map((v: any) => {
      const sub = subByVendor.get(String(v._id)) || null;
      const legacyEnd = legacyTrialEndByVendor.get(String(v._id));
      const effectiveSub = sub && legacyEnd && (!sub.currentPeriodEnd || new Date(legacyEnd).getTime() > new Date(sub.currentPeriodEnd).getTime())
        ? { ...sub, currentPeriodEnd: legacyEnd }
        : sub;
      return {
        vendorId: v._id,
        vendorCode: v.vendorId,
        companyName: v.companyName,
        businessId: v.businessId,
        businessName: v.businessId ? nameByBusiness.get(String(v.businessId)) || "" : "",
        status: computeStatus(effectiveSub),
        amount: sub ? totalAmount(sub.modules) : 0,
        validityDays: sub?.validityDays ?? null,
        currentPeriodEnd: effectiveSub?.currentPeriodEnd ?? null,
      };
    });

    return NextResponse.json({ success: true, vendors: rows });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
