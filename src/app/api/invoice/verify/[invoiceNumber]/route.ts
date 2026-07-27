import { NextResponse } from "next/server";
import SalesInvoice from "@/models/SalesInvoice";
import Business from "@/models/Business";
import { connectDB } from "@/lib/mongodb";

// This handler used to be a hardcoded stub -- it returned
// `{ success: true, verified: true }` for literally ANY invoiceNumber,
// including ones that don't exist, without ever touching the database.
// The QR code printed on every invoice (see app/invoice/[invoiceNumber]/
// page.tsx) points here, and the verify page (app/invoice/verify/
// [invoiceNumber]/page.tsx) reads data.customer.name, data.invoiceDate,
// data.summary.grandTotal off the response -- none of which this stub ever
// returned, so the "Invoice Verified" page always rendered a real-looking
// checkmark next to "undefined" customer name, "Invalid Date", and
// "₹undefined". That defeats the entire point of a verification page (and
// would even "verify" a fabricated invoice number). Now actually looks the
// invoice up and returns 404 + verified:false when it doesn't exist.
export async function GET(
  req: Request,
  { params }: any
) {
  try {
    await connectDB();

    const { invoiceNumber } = await params;

    const invoice = await SalesInvoice.findOne({ invoiceNumber }).lean();

    if (!invoice) {
      return NextResponse.json(
        {
          success: false,
          verified: false,
          message: "Invoice not found",
        },
        { status: 404 }
      );
    }

    const inv = invoice as any;

    // Same multi-tenant hardcode bug that api/invoice/view/[invoiceNumber]
    // had (every invoice showed the same hardcoded "Native" company name
    // regardless of which business actually issued it) -- fixed there by
    // reading the real Business record; do the same here for parity.
    const business = inv.businessId
      ? await Business.findById(inv.businessId).lean()
      : null;

    return NextResponse.json({
      success: true,
      verified: true,
      invoiceNumber: inv.invoiceNumber,
      invoiceDate: inv.createdAt,
      customer: {
        name: inv.customer?.name,
      },
      summary: {
        grandTotal: inv.grandTotal || 0,
      },
      issuedBy:
        (business as any)?.name ||
        (business as any)?.legalName ||
        "the issuing business",
      message: "Invoice verified",
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, verified: false, message: err.message },
      { status: 500 }
    );
  }
}
