import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import VendorBillingInvoice from "@/models/VendorBillingInvoice";
import { resolveVendorContext } from "@/lib/auth/vendorContext";
import { verifyRazorpaySignature } from "@/core/billing/paymentGateway";
import { activateVendorInvoice } from "@/core/billing/activateVendorInvoice";

// POST /api/vendor/billing/invoices/:invoiceId/confirm
// Body: { razorpayOrderId, razorpayPaymentId, razorpaySignature } -- the
// three values Razorpay Checkout hands back to the client on success.
// This is the ONLY client-triggered path that may mark an invoice PAID,
// and it only does so after recomputing Razorpay's HMAC signature
// server-side and confirming it matches -- a request cannot forge this
// without our RAZORPAY_KEY_SECRET, which never leaves the server.
// Previously this route trusted a bare "I paid" claim with zero
// verification (any vendor could self-confirm their own invoice for
// free) -- see git history. api/webhooks/razorpay is the OTHER path that
// can activate an invoice (Razorpay calling us directly on
// payment.captured, independent of the client) -- both funnel through
// the same activateVendorInvoice() so the actual activation logic (extend
// period, apply modules, sub-vendor flag, comms quota, notify) lives in
// exactly one place.
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
    // created for this invoice (invoice.gatewayRef, set in subscribe/
    // route.ts) -- otherwise a valid signature from a DIFFERENT order/
    // invoice could be replayed here to mark an unrelated invoice paid.
    if (invoice.gatewayRef !== razorpayOrderId) {
      return NextResponse.json({ success: false, message: "Order mismatch for this invoice" }, { status: 400 });
    }

    const verified = verifyRazorpaySignature({ razorpayOrderId, razorpayPaymentId, razorpaySignature });
    if (!verified) {
      return NextResponse.json({ success: false, message: "Payment verification failed" }, { status: 402 });
    }

    const result = await activateVendorInvoice(invoiceId, razorpayPaymentId);
    if ("reason" in result) {
      return NextResponse.json({ success: false, message: result.reason }, { status: 500 });
    }

    return NextResponse.json({ success: true, invoice: result.invoice, subscription: "subscription" in result ? result.subscription : undefined });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
