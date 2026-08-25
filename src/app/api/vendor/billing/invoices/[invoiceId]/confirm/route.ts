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

    // Atomic claim -- guards against a double-click/retry sending two
    // concurrent requests with the same valid signature both passing the
    // status check above and both extending the subscription period. Only
    // the request that actually flips PENDING -> PAID here proceeds to
    // extend the subscription; a second concurrent request finds no
    // matching document (status already PAID) and just returns the
    // already-confirmed invoice, same pattern as activateSubscription's
    // atomic claim for the customer-subscription flow.
    const claimed = await VendorBillingInvoice.findOneAndUpdate(
      { _id: invoiceId, vendorId: vendor._id, status: { $ne: "PAID" } },
      { $set: { status: "PAID", paidAt: new Date(), gatewayPaymentId: razorpayPaymentId } },
      { new: true }
    );
    if (!claimed) {
      const current = await VendorBillingInvoice.findById(invoiceId);
      return NextResponse.json({ success: true, invoice: current });
    }

    const subscription = await VendorSubscription.findById(claimed.subscriptionId);
    if (!subscription) return NextResponse.json({ success: false, message: "Subscription not found" }, { status: 404 });

    // Apply the modules/validityDays/plan SNAPSHOTTED ON THE INVOICE (set
    // at invoice-creation time, see api/vendor/billing/subscribe) onto the
    // subscription only now, having just verified real money moved --
    // never trust whatever the live subscription doc holds, since a
    // self-serve vendor could otherwise get access by creating an invoice
    // and abandoning checkout. A no-op for the admin-generated-invoice
    // flow, where the subscription's modules were already set (by a
    // trusted admin) to the same values before the invoice existed.
    const validityDays = claimed.validityDays || subscription.validityDays;
    if (claimed.modules?.length) subscription.modules = claimed.modules as any;
    subscription.validityDays = validityDays;
    if (claimed.planId) subscription.planId = claimed.planId;
    if (claimed.planName) subscription.planName = claimed.planName;

    const { start, end } = extendPeriod(subscription.currentPeriodEnd, validityDays);
    subscription.currentPeriodStart = start;
    subscription.currentPeriodEnd = end;
    await subscription.save();

    sendVendorAlert(
      String(vendor._id),
      "PAYMENT_RECEIVED",
      `Payment received for invoice ${claimed.invoiceNumber} (₹${claimed.amount}). Subscription extended to ${end.toLocaleDateString("en-IN")}.`
    ).catch(() => {});

    return NextResponse.json({ success: true, invoice: claimed, subscription });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
