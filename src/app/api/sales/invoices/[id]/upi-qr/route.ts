/**
 * GET /api/sales/invoices/[id]/upi-qr — returns a UPI payment QR code
 * (PNG data URL) for this invoice, if a UPI VPA is configured -- the
 * ISSUING VENDOR's own (VendorProfile.upiId, vendor Profile > Settings)
 * when the invoice has a vendorId, the shared Business's otherwise
 * (single-tenant business, no marketplace vendors). Every self-signed-up
 * vendor shares one platform Business, so reading Business.upiId
 * unconditionally meant every vendor's invoice showed whichever ONE UPI
 * ID any vendor had last saved -- reported live. 404s cleanly when no
 * VPA is set, rather than a broken/blank QR -- the print page treats
 * that as "no QR to show", not an error.
 */
import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import SalesInvoice from "@/models/SalesInvoice";
import Business from "@/models/Business";
import VendorProfile from "@/models/VendorProfile";
import { generateUpiQrDataUrl } from "@/core/payments/upiQr";
import { getEnrichedSession } from "@/lib/auth/session-enriched";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: "Invalid invoice id" }, { status: 400 });
    }

    await connectDB();
    const invoice = await SalesInvoice.findById(id).select("invoiceNumber grandTotal businessId vendorId").lean<any>();
    if (!invoice) {
      return NextResponse.json({ success: false, message: "Invoice not found" }, { status: 404 });
    }

    const vendor = invoice.vendorId
      ? await VendorProfile.findById(invoice.vendorId).select("upiId companyName").lean<any>()
      : null;
    const business = await Business.findById(invoice.businessId).select("upiId name legalName").lean<any>();
    const upiId = vendor ? vendor.upiId : business?.upiId;
    if (!upiId?.trim()) {
      return NextResponse.json({ success: false, message: "No UPI ID configured for this business" }, { status: 404 });
    }

    const qrDataUrl = await generateUpiQrDataUrl({
      vpa: upiId.trim(),
      payeeName: (vendor?.companyName) || business?.legalName || business?.name || "AN CRM",
      amount: invoice.grandTotal || 0,
      invoiceNumber: invoice.invoiceNumber,
    });

    return NextResponse.json({ success: true, qrDataUrl });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
