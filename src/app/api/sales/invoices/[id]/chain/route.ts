import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import SalesInvoice from "@/models/SalesInvoice";
import { getB2B2CChain } from "@/core/invoicing/dualInvoiceService";

// GET /api/sales/invoices/[id]/chain — the other invoice(s) generated for
// the same source order (the B2B2C vendor -> AN Group -> customer chain;
// see dualInvoiceService.ts's getB2B2CChain for what that means here).
// Empty/isB2B2C:false for any invoice not part of a dual-invoice order.
export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();
    const { id } = await context.params;

    const invoice = await SalesInvoice.findById(id).select("sourceOrderId").lean() as any;
    if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!invoice.sourceOrderId) {
      return NextResponse.json({ success: true, isB2B2C: false, b2b: [], b2c: [] });
    }

    const chain = await getB2B2CChain(invoice.sourceOrderId);
    return NextResponse.json({ success: true, ...chain });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
