import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import Business from "@/models/Business";
import VendorSubscription from "@/models/VendorSubscription";
import VendorBillingInvoice from "@/models/VendorBillingInvoice";
import { resolveVendorContext } from "@/lib/auth/vendorContext";
import { extendPeriod } from "@/core/billing/billing.service";
import { generateScopedDocumentNumber } from "@/core/numbering/numberingService";
import { createRazorpayOrder } from "@/core/billing/paymentGateway";
import { getEffectivePlan } from "@/core/pricing/planAccess";
import { BILLING_PERIODS, type BillingPeriod, type OperatingMode, type PlanKey } from "@/core/pricing/plans";
import { priceForPeriodAsync, isLaunchPricingActiveAsync } from "@/core/pricing/pricingSettingsService";
import { trackEvent } from "@/core/analytics/trackEvent";
import { GST_RATE } from "@/app/api/invoice/view/[invoiceNumber]/vendorBillingView";

/**
 * POST /api/vendor/billing/subscribe — self-serve entry point: vendor picks
 * a BASIC/PRO/ULTIMATE tier off the SAME plan catalog that drives /pricing
 * and module gating (core/pricing/plans.ts, PlanFeatureConfig overrides via
 * getEffectivePlan) -- there is no separate self-serve-only plan catalog
 * any more (see git history: VendorPlan used to be a parallel catalog a
 * vendor could buy into that module-gating didn't actually understand).
 * This mints a real Razorpay order for the picked tier. The client then
 * opens Razorpay Checkout and, on success, calls the ALREADY-HARDENED
 * /api/vendor/billing/invoices/:invoiceId/confirm route (unchanged) to
 * verify the signature and activate — this route deliberately does not
 * duplicate any of that verification logic, it only prepares the
 * subscription+invoice+order for confirm to act on.
 *
 * Body: { planKey: "BASIC" | "PRO" | "ULTIMATE", period?: BillingPeriod }
 * period defaults to YEARLY -- only YEARLY/TWO_YEARLY are self-serve
 * choices now (see BILLING_PERIODS' own comment on why MONTHLY/QUARTERLY/
 * HALF_YEARLY were removed from that array). Either period applies
 * BILLING_PERIODS' discount on top of whichever base rate (launch or
 * standard) is currently active -- see plans.ts's priceForPeriod/
 * currentMonthlyRate.
 */
export async function POST(req: NextRequest) {
  try {
    const headersList = await headers();
    const userId = headersList.get("x-user-id");
    if (!userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const planKey = body.planKey as PlanKey;
    if (!planKey || !["STARTER", "BASIC", "PRO", "ULTIMATE"].includes(planKey)) {
      return NextResponse.json({ success: false, message: "A valid planKey is required" }, { status: 400 });
    }
    const periodKey = (body.period as BillingPeriod) || "YEARLY";
    const periodDef = BILLING_PERIODS.find((p) => p.key === periodKey);
    if (!periodDef) {
      return NextResponse.json({ success: false, message: "Invalid billing period" }, { status: 400 });
    }

    await connectDB();
    const ctx = await resolveVendorContext(userId);
    if (!ctx) return NextResponse.json({ success: false, message: "Vendor profile not found" }, { status: 404 });

    const vendor = ctx.vendor as any;
    if (!vendor.businessId) {
      // Every vendor is attached to a Business at admin-approval time (see
      // api/vendors/[id]/review) -- a freshly self-signed-up, not-yet-
      // approved vendor has no businessId yet, and VendorSubscription/
      // VendorBillingInvoice both require one. Self-serve billing only
      // makes sense post-approval, same gate the rest of the vendor portal
      // already sits behind.
      return NextResponse.json(
        { success: false, message: "Your account is still pending approval — contact AN Group to get activated first." },
        { status: 403 }
      );
    }

    const business = await Business.findById(vendor.businessId).select("operatingMode").lean();
    const mode = ((business as any)?.operatingMode || "SC") as OperatingMode;
    const plan = await getEffectivePlan(mode, planKey);
    if (!plan) return NextResponse.json({ success: false, message: "Plan not found or no longer available" }, { status: 404 });

    // Fetched here (rather than further down, where this lookup used to
    // sit) so a referral discount earned as a REFERRER (see
    // activateVendorInvoice.ts's referral-reward block) can be applied to
    // the price BEFORE the Razorpay order is created -- the amount is
    // fixed at order-creation time, so this has to happen first.
    let subscription = await VendorSubscription.findOne({ vendorId: vendor._id });
    if (!subscription) {
      subscription = await VendorSubscription.create({
        vendorId: vendor._id,
        businessId: vendor.businessId,
        modules: [],
        validityDays: periodDef.months * 30,
      });
    }

    // The pricing page / plan picker show the GST-EXCLUSIVE base rate --
    // whichever of launch/standard is currently active, see
    // priceForPeriod's own comment. What actually gets CHARGED (and what
    // invoice.amount stores) is base + GST_RATE% on top, matching
    // vendorBillingView.ts's own comment on why invoice.amount must be
    // the GST-INCLUSIVE grand total: it's exactly what createRazorpayOrder
    // charges, with nothing added after the fact.
    let { total: basePrice } = await priceForPeriodAsync(plan, periodKey);
    // Referral reward: this vendor earned 10% off their NEXT renewal by
    // referring someone who paid for a 1-year term (see
    // activateVendorInvoice.ts). Applied once, then cleared immediately --
    // an abandoned checkout after this point does forfeit the discount,
    // same trade-off as a typical one-time coupon being consumed on use
    // rather than on confirmed payment.
    if (subscription.pendingReferralDiscountPct) {
      basePrice = Math.round(basePrice * (1 - subscription.pendingReferralDiscountPct / 100) * 100) / 100;
      subscription.pendingReferralDiscountPct = undefined;
      await subscription.save();
    }
    const price = Math.round(basePrice * (1 + GST_RATE / 100) * 100) / 100;
    const validityDays = periodDef.months * 30;

    // Split the GST-inclusive total evenly across the plan's VENDOR-PORTAL
    // module keys (plan.vendorModuleKeys -- NOT plan.moduleKeys, which is a
    // different vocabulary that gates the console sidebar, not the vendor
    // portal -- see Plan.vendorModuleKeys's own comment in plans.ts) so
    // sum(modules[].rate) always equals invoice.amount exactly (an
    // invariant a couple of other call sites rely on), while modules[].key
    // stays the real module list vendorAccess.service.ts's
    // getVendorAvailableModules() actually reads to gate the vendor's own
    // nav -- collapsing to one synthetic line, or using the wrong
    // vocabulary, would silently break access gating. Remainder from
    // integer-paise rounding goes on the last module.
    const n = plan.vendorModuleKeys.length;
    const base = Math.floor((price / n) * 100) / 100;
    const modules = plan.vendorModuleKeys.map((key, i) => ({
      key,
      rate: i === n - 1 ? Math.round((price - base * (n - 1)) * 100) / 100 : base,
    }));

    // Deliberately does NOT write modules/validityDays/planKey onto the
    // subscription here -- getVendorAvailableModules() (see
    // core/access/vendorAccess.service.ts) grants real module access the
    // moment a VendorSubscription has a non-empty modules list, with no
    // separate paid/unpaid check of its own. That's an acceptable
    // trust boundary when only a Super Admin can set it (the ad-hoc
    // console/admin/vendor-billing flow), but here the VENDOR is the one
    // calling this route -- writing modules before payment would let any
    // vendor grant themselves access by simply hitting this endpoint and
    // abandoning checkout. The plan snapshot below travels on the INVOICE
    // instead; api/vendor/billing/invoices/[invoiceId]/confirm applies it
    // to the subscription only after verifying a real Razorpay payment.
    // (subscription itself was already fetched/created above, before the
    // price computation.)

    // Cancel any of this vendor's own still-PENDING invoices before
    // starting a fresh one -- a vendor re-picking a plan (or picking a
    // different one) after abandoning an earlier checkout shouldn't leave
    // multiple stale PENDING invoices sitting in their billing history.
    await VendorBillingInvoice.updateMany(
      { vendorId: vendor._id, status: "PENDING" },
      { $set: { status: "CANCELLED" } }
    );

    // early-renewal still extends from the existing currentPeriodEnd if
    // it's in the future, same rule extendPeriod always applies.
    const { start, end } = extendPeriod(subscription.currentPeriodEnd, validityDays);
    // Scoped to this vendor's own counter, not the shared business one --
    // see the matching comment in api/crm/jobsheets/[id]/close/route.ts
    // for why (every vendor under one business used to share one counter,
    // revealing each other's invoice volume).
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
      validityDays: validityDays,
      planKey: plan.key,
      planName: plan.name,
      periodStart: start,
      periodEnd: end,
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

    trackEvent("CHECKOUT_STARTED", {
      vendorId: String(vendor._id),
      businessId: String(vendor.businessId),
      planKey: plan.key,
      billingPeriod: periodKey,
      amount: price,
      isFoundingPricing: await isLaunchPricingActiveAsync(),
    });

    return NextResponse.json({
      success: true,
      invoiceId: invoice._id.toString(),
      invoiceNumber: invoice.invoiceNumber,
      razorpayOrderId: order.orderId,
      amount: order.amount,
      currency: order.currency,
      keyId: order.keyId,
      planName: plan.name,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
