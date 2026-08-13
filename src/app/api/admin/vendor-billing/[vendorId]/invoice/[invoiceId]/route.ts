import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import VendorSubscription from "@/models/VendorSubscription";
import VendorBillingInvoice from "@/models/VendorBillingInvoice";
import { getEnrichedSession } from "@/lib/auth/session-enriched";

async function requireSuperAdmin() {
  const session = await getEnrichedSession();
  if (!session?.user || !session.isSuperAdmin) return null;
  return session;
}

// PATCH /api/admin/vendor-billing/:vendorId/invoice/:invoiceId — admin
// action on a single invoice: mark it PAID (manually recorded payment,
// bypassing the vendor-side Razorpay confirm flow -- see
// api/vendor/billing/invoices/[invoiceId]/confirm/route.ts for the normal
// self-serve path) or CANCELLED. Marking PAID extends the vendor's
// VendorSubscription paid-through period using the invoice's own
// periodStart/periodEnd (already computed at generation time, see
// invoice/route.ts's POST handler), mirroring exactly what the vendor-side
// confirm route does after a verified Razorpay payment.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ vendorId: string; invoiceId: string }> }
) {
  try {
    const session = await requireSuperAdmin();
    if (!session) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });

    const { vendorId, invoiceId } = await params;
    const body = await req.json().catch(() => ({}));
    const status = body.status;
    if (!["PAID", "CANCELLED"].includes(status)) {
      return NextResponse.json({ success: false, message: "status must be PAID or CANCELLED" }, { status: 400 });
    }

    await connectDB();
    const invoice = await VendorBillingInvoice.findOne({ _id: invoiceId, vendorId });
    if (!invoice) return NextResponse.json({ success: false, message: "Invoice not found" }, { status: 404 });

    if (invoice.status === "PAID" || invoice.status === "CANCELLED") {
      return NextResponse.json({ success: true, invoice });
    }

    if (status === "PAID") {
      const subscription = await VendorSubscription.findById(invoice.subscriptionId);
      if (subscription) {
        subscription.currentPeriodStart = invoice.periodStart;
        subscription.currentPeriodEnd = invoice.periodEnd;
        await subscription.save();
      }
      invoice.status = "PAID";
      invoice.paidAt = new Date();
    } else {
      invoice.status = "CANCELLED";
    }
    await invoice.save();

    return NextResponse.json({ success: true, invoice });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
