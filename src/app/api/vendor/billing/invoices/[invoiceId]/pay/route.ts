import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import VendorBillingInvoice from "@/models/VendorBillingInvoice";
import { resolveVendorContext } from "@/lib/auth/vendorContext";
import { createRazorpayOrder } from "@/core/billing/paymentGateway";

// POST /api/vendor/billing/invoices/:invoiceId/pay — mints a real Razorpay
// order for this invoice (amount comes from OUR OWN invoice record, never
// the client) and returns what the client needs to open Razorpay Checkout.
// Returns 503 with a clear message if RAZORPAY_KEY_ID/SECRET aren't
// configured yet, instead of ever faking a successful payment.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ invoiceId: string }> }) {
  try {
    const headersList = await headers();
    const userId = headersList.get("x-user-id");
    if (!userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    const { invoiceId } = await params;
    await connectDB();
    const ctx = await resolveVendorContext(userId);
    if (!ctx) return NextResponse.json({ success: false, message: "Vendor profile not found" }, { status: 404 });

    const vendor = ctx.vendor as any;
    const invoice = await VendorBillingInvoice.findOne({ _id: invoiceId, vendorId: vendor._id });
    if (!invoice) return NextResponse.json({ success: false, message: "Invoice not found" }, { status: 404 });
    if (invoice.status === "PAID") {
      return NextResponse.json({ success: false, message: "Invoice already paid" }, { status: 400 });
    }

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
      orderId: order.orderId,
      amount: order.amount,
      currency: order.currency,
      keyId: order.keyId,
      invoiceNumber: invoice.invoiceNumber,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
