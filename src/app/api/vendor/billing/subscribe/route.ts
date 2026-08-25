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
import type { OperatingMode, PlanKey } from "@/core/pricing/plans";

// Self-serve validity is fixed at one calendar-month cycle for now (see
// BILLING_PERIODS.MONTHLY in core/pricing/plans.ts) -- period-length
// picking (quarterly/half-yearly/yearly discounts) is a pricing-UI concern
// for later, not a data-model one.
const SELF_SERVE_VALIDITY_DAYS = 30;

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
 * Body: { planKey: "BASIC" | "PRO" | "ULTIMATE" }
 */
export async function POST(req: NextRequest) {
  try {
    const headersList = await headers();
    const userId = headersList.get("x-user-id");
    if (!userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const planKey = body.planKey as PlanKey;
    if (!planKey || !["BASIC", "PRO", "ULTIMATE"].includes(planKey)) {
      return NextResponse.json({ success: false, message: "A valid planKey is required" }, { status: 400 });
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

    // Split the plan's flat monthly price evenly across its module keys so
    // each module keeps a real rate for invoice line items (GST is computed
    // per-line in vendorBillingView.ts) while modules[].key stays the real
    // module list vendorAccess.service.ts reads for actual feature access
    // -- collapsing to one synthetic line would silently break access
    // gating. Remainder from integer-paise rounding goes on the last
    // module so the rates always sum to exactly the plan's price.
    const price = plan.monthlyPriceINR;
    const n = plan.moduleKeys.length;
    const base = Math.floor((price / n) * 100) / 100;
    const modules = plan.moduleKeys.map((key, i) => ({
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
    let subscription = await VendorSubscription.findOne({ vendorId: vendor._id });
    if (!subscription) {
      subscription = await VendorSubscription.create({
        vendorId: vendor._id,
        businessId: vendor.businessId,
        modules: [],
        validityDays: SELF_SERVE_VALIDITY_DAYS,
      });
    }

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
    const { start, end } = extendPeriod(subscription.currentPeriodEnd, SELF_SERVE_VALIDITY_DAYS);
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
      validityDays: SELF_SERVE_VALIDITY_DAYS,
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
