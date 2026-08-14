import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import VendorBillingInvoice from "@/models/VendorBillingInvoice";
import VendorSubscription from "@/models/VendorSubscription";
import { resolveVendorContext } from "@/lib/auth/vendorContext";
import { verifyRazorpaySignature } from "@/core/billing/paymentGateway";
import { extendPeriod } from "@/core/billing/billing.service";
import { sendVendorAlert } from "@/core/telegram/sendVendorAlert";

// POST /api/vendor/billing/invoices/:invoiceId/confirm
// Body: { razorpayOrderId, razorpayPaymentId, razorpaySignature } -- the
// three values Razorpay Checkout hands back to the client on success.
// This is the ONLY thing that may mark an invoice PAID, and it only does
// so after recomputing Razorpay's HMAC signature server-side and
// confirming it matches -- a request cannot forge this without our
// RAZORPAY_KEY_SECRET, which never leaves the server. Previously this
// route trusted a bare "I paid" claim with zero verification (any vendor
// could self-confirm their own invoice for free) -- see git history.
export async function POST(req: NextRequest, { params }: { params: Promise<{ invoiceId: string }> }) {
  try {
    const headersList = await headers();
    const userId = headersList.get("x-user-id");
    if (!userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    const { invoiceId } = await params;
    const body = await req.json().catch(() => ({}));
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = body;
    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return NextResponse.json({ success: false, message: "Missing payment verification fields" }, { status: 400 });
    }

    await connectDB();
    const ctx = await resolveVendorContext(userId);
    if (!ctx) return NextResponse.json({ success: false, message: "Vendor profile not found" }, { status: 404 });

    const vendor = ctx.vendor as any;
    const invoice = await VendorBillingInvoice.findOne({ _id: invoiceId, vendorId: vendor._id });
    if (!invoice) return NextResponse.json({ success: false, message: "Invoice not found" }, { status: 404 });
    if (invoice.status === "PAID") {
      return NextResponse.json({ success: true, invoice });
    }
    // The order this signature was issued for must match the one WE
    // created for this invoice (invoice.gatewayRef, set in pay/route.ts)
    // -- otherwise a valid signature from a DIFFERENT order/invoice could
    // be replayed here to mark an unrelated invoice paid.
    if (invoice.gatewayRef !== razorpayOrderId) {
      return NextResponse.json({ success: false, message: "Order mismatch for this invoice" }, { status: 400 });
    }

    const verified = verifyRazorpaySignature({ razorpayOrderId, razorpayPaymentId, razorpaySignature });
    if (!verified) {
      return NextResponse.json({ success: false, message: "Payment verification failed" }, { status: 402 });
    }

    const subscription = await VendorSubscription.findById(invoice.subscriptionId);
    if (!subscription) return NextResponse.json({ success: false, message: "Subscription not found" }, { status: 404 });

    const { start, end } = extendPeriod(subscription.currentPeriodEnd, subscription.validityDays);
    subscription.currentPeriodStart = start;
    subscription.currentPeriodEnd = end;
    await subscription.save();

    invoice.status = "PAID";
    invoice.paidAt = new Date();
    invoice.gatewayPaymentId = razorpayPaymentId;
    await invoice.save();

    if (vendor.businessId) {
      sendVendorAlert(
        String(vendor.businessId),
        "PAYMENT_RECEIVED",
        `Payment received for invoice ${invoice.invoiceNumber} (₹${invoice.amount}). Subscription extended to ${end.toLocaleDateString("en-IN")}.`
      ).catch(() => {});
    }

    return NextResponse.json({ success: true, invoice, subscription });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
