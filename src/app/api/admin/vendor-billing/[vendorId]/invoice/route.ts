import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import VendorProfile from "@/models/VendorProfile";
import VendorSubscription from "@/models/VendorSubscription";
import VendorBillingInvoice from "@/models/VendorBillingInvoice";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { totalAmount, extendPeriod } from "@/core/billing/billing.service";
import { generateDocumentNumber } from "@/core/numbering/numberingService";

// POST /api/admin/vendor-billing/:vendorId/invoice — generate a new invoice
// for this vendor's currently-configured plan. periodStart/periodEnd on the
// invoice describe the cycle it WOULD cover once paid (see
// vendor/billing/invoices/[id]/confirm, which is what actually extends the
// subscription's real currentPeriodEnd).
export async function POST(_req: NextRequest, { params }: { params: Promise<{ vendorId: string }> }) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user || !session.isSuperAdmin) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }

    const { vendorId } = await params;
    await connectDB();

    const vendor = await VendorProfile.findById(vendorId).select("businessId").lean();
    if (!vendor) return NextResponse.json({ success: false, message: "Vendor not found" }, { status: 404 });

    const subscription = await VendorSubscription.findOne({ vendorId });
    if (!subscription || !subscription.modules.length) {
      return NextResponse.json({ success: false, message: "No billing plan set for this vendor yet" }, { status: 400 });
    }

    const amount = totalAmount(subscription.modules);
    const { start, end } = extendPeriod(subscription.currentPeriodEnd, subscription.validityDays);
    const businessId = String((vendor as any).businessId);

    const { value: invoiceNumber } = await generateDocumentNumber(businessId, "VENDOR_BILLING_INVOICE");

    const invoice = await VendorBillingInvoice.create({
      vendorId,
      businessId,
      subscriptionId: subscription._id,
      invoiceNumber,
      modules: subscription.modules,
      amount,
      periodStart: start,
      periodEnd: end,
      status: "PENDING",
    });

    return NextResponse.json({ success: true, invoice });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
