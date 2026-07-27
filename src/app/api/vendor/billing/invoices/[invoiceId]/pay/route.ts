import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import VendorBillingInvoice from "@/models/VendorBillingInvoice";
import { resolveVendorContext } from "@/lib/auth/vendorContext";
import { createPaymentLink } from "@/core/billing/paymentGateway";

// POST /api/vendor/billing/invoices/:invoiceId/pay — mints (or re-returns)
// a payment link for this invoice. Stubbed until a real gateway is wired
// up (see paymentGateway.ts).
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

    const { link, gatewayRef } = await createPaymentLink(invoice);
    invoice.paymentLink = link;
    invoice.gatewayRef = gatewayRef;
    await invoice.save();

    return NextResponse.json({ success: true, paymentLink: link });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
