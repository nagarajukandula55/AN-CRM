import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import VendorSubscription from "@/models/VendorSubscription";
import VendorBillingInvoice from "@/models/VendorBillingInvoice";
import { resolveVendorContext } from "@/lib/auth/vendorContext";
import { computeStatus } from "@/core/billing/billing.service";
import { generateScopedDocumentNumber } from "@/core/numbering/numberingService";
import { createRazorpayOrder } from "@/core/billing/paymentGateway";
import { getEffectivePlan } from "@/core/pricing/planAccess";
import { currentMonthlyRate, type PlanKey } from "@/core/pricing/plans";
import { GST_RATE } from "@/app/api/invoice/view/[invoiceNumber]/vendorBillingView";

// Starter < Basic/Pro < Ultimate -- the only ordering that matters for
// deciding whether a requested plan is actually an upgrade.
const PLAN_RANK: Record<PlanKey, number> = { STARTER: 0, BASIC: 1, PRO: 1, ULTIMATE: 2 };

/**
 * POST /api/vendor/billing/upgrade — mid-cycle upgrade to a HIGHER tier,
 * paying only the prorated difference for the days remaining in the
 * current paid period (no period extension, no downgrade path -- per
 * explicit direction: "cover this upgrade option and don't give option
 * for downgrade").
 *
 * Mints a Razorpay order for the prorated amount, same as
 * api/vendor/billing/subscribe -- the client opens Checkout and, on
 * success, calls the SAME api/vendor/billing/invoices/:id/confirm route
 * unchanged. That route's activation logic (activateVendorInvoice)
 * already does exactly what an upgrade needs as long as the invoice is
 * built with validityDays: 0 -- extendPeriod(currentPeriodEnd, 0) leaves
 * currentPeriodEnd untouched (adds zero days), while modules/planKey/
 * planName still get applied to the subscription, subVendorBilling gets
 * re-wired, and the WhatsApp quota gets granted for the new tier. No
 * changes needed to that shared activation code at all.
 */
export async function POST(req: NextRequest) {
  try {
    const headersList = await headers();
    const userId = headersList.get("x-user-id");
    if (!userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const requestedPlanKey = body.planKey as PlanKey;
    if (!requestedPlanKey || !["STARTER", "BASIC", "PRO", "ULTIMATE"].includes(requestedPlanKey)) {
      return NextResponse.json({ success: false, message: "A valid planKey is required" }, { status: 400 });
    }

    await connectDB();
    const ctx = await resolveVendorContext(userId);
    if (!ctx) return NextResponse.json({ success: false, message: "Vendor profile not found" }, { status: 404 });
    const vendor = ctx.vendor as any;

    const subscription = await VendorSubscription.findOne({ vendorId: vendor._id });
    if (!subscription || computeStatus(subscription) !== "ACTIVE") {
      return NextResponse.json(
        { success: false, message: "You need an active plan before you can upgrade -- pick one from Plan & Billing first." },
        { status: 400 }
      );
    }

    const currentPlanKey = (subscription.planKey as PlanKey) || "BASIC";
    if (PLAN_RANK[requestedPlanKey] <= PLAN_RANK[currentPlanKey]) {
      return NextResponse.json(
        {
          success: false,
          message:
            PLAN_RANK[requestedPlanKey] === PLAN_RANK[currentPlanKey]
              ? "You're already on this plan."
              : "Downgrading isn't available -- contact AN Group support if you need a lower tier.",
        },
        { status: 400 }
      );
    }

    const mode = "SC" as const;
    const [currentPlan, newPlan] = await Promise.all([
      getEffectivePlan(mode, currentPlanKey),
      getEffectivePlan(mode, requestedPlanKey),
    ]);
    if (!newPlan) return NextResponse.json({ success: false, message: "Plan not found" }, { status: 404 });

    // Prorate off each plan's own current monthly-equivalent rate (launch
    // or standard, whichever is active) rather than the old invoice's
    // actual paid amount -- so an upgrade priced today always reflects
    // today's real per-day cost of each tier, not a stale snapshot.
    const currentDailyRate = currentPlan ? currentMonthlyRate(currentPlan) / 30 : 0;
    const newDailyRate = currentMonthlyRate(newPlan) / 30;

    const now = Date.now();
    const periodEnd = subscription.currentPeriodEnd ? subscription.currentPeriodEnd.getTime() : now;
    const remainingDays = Math.max(0, Math.ceil((periodEnd - now) / (24 * 60 * 60 * 1000)));
    if (remainingDays === 0) {
      return NextResponse.json(
        { success: false, message: "Your current plan has no time left -- renew or pick a fresh plan instead of upgrading." },
        { status: 400 }
      );
    }

    const basePrice = Math.max(0, Math.round((newDailyRate - currentDailyRate) * remainingDays * 100) / 100);
    const price = Math.round(basePrice * (1 + GST_RATE / 100) * 100) / 100;

    // Full new-tier module set (not just the delta) -- this REPLACES
    // subscription.modules on confirm, same as a fresh subscribe would,
    // so the vendor ends up with exactly what the new tier includes.
    const n = newPlan.vendorModuleKeys.length;
    const base = Math.floor((price / n) * 100) / 100;
    const modules = newPlan.vendorModuleKeys.map((key, i) => ({
      key,
      rate: i === n - 1 ? Math.round((price - base * (n - 1)) * 100) / 100 : base,
    }));

    await VendorBillingInvoice.updateMany(
      { vendorId: vendor._id, status: "PENDING" },
      { $set: { status: "CANCELLED" } }
    );

    const { value: invoiceNumber } = await generateScopedDocumentNumber(
      String(vendor._id),
      "VENDOR_BILLING_INVOICE",
      String(vendor.businessId)
    );

    const invoice = await VendorBillingInvoice.create({
      vendorId: vendor._id,
      businessId: vendor.businessId,
      subscriptionId: subscription._id,
      invoiceNumber,
      modules,
      amount: price,
      // Zero -- an upgrade never extends the paid-through date, it only
      // changes what's included for the time already paid for. See this
      // route's own top comment for why this alone is enough for the
      // shared confirm/activation path to do the right thing.
      validityDays: 0,
      planKey: newPlan.key,
      planName: `${newPlan.name} (upgrade)`,
      periodStart: subscription.currentPeriodStart || new Date(),
      periodEnd: subscription.currentPeriodEnd || new Date(),
      status: "PENDING",
    });

    let order;
    try {
      order = await createRazorpayOrder(invoice);
    } catch (err: any) {
      return NextResponse.json({ success: false, message: err.message || "Payments are not yet configured" }, { status: 503 });
    }

    invoice.gatewayRef = order.orderId;
    await invoice.save();

    return NextResponse.json({
      success: true,
      invoiceId: invoice._id.toString(),
      invoiceNumber: invoice.invoiceNumber,
      razorpayOrderId: order.orderId,
      amount: order.amount,
      currency: order.currency,
      keyId: order.keyId,
      planName: newPlan.name,
      remainingDays,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
