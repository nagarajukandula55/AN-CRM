import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import VendorBillingInvoice from "@/models/VendorBillingInvoice";
import VendorSubscription from "@/models/VendorSubscription";
import { resolveVendorContext } from "@/lib/auth/vendorContext";
import { confirmPayment } from "@/core/billing/paymentGateway";
import { extendPeriod } from "@/core/billing/billing.service";

// POST /api/vendor/billing/invoices/:invoiceId/confirm — marks an invoice
// PAID and extends the subscription's validity period. Today this is
// called directly from the stub "pay" page (see vendor/billing/pay/[id]).
// Once a real gateway is wired up, this becomes (or is called from) that
// gateway's webhook handler instead — confirmPayment() is the swap point.
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
      return NextResponse.json({ success: true, invoice });
    }

    const result = await confirmPayment(invoice.gatewayRef);
    if (!result.success) {
      return NextResponse.json({ success: false, message: "Payment not confirmed" }, { status: 402 });
    }

    const subscription = await VendorSubscription.findById(invoice.subscriptionId);
    if (!subscription) return NextResponse.json({ success: false, message: "Subscription not found" }, { status: 404 });

    const { start, end } = extendPeriod(subscription.currentPeriodEnd, subscription.validityDays);
    subscription.currentPeriodStart = start;
    subscription.currentPeriodEnd = end;
    await subscription.save();

    invoice.status = "PAID";
    invoice.paidAt = new Date();
    await invoice.save();

    return NextResponse.json({ success: true, invoice, subscription });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
