import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import mongoose from "mongoose";
import { notify } from "@/lib/notify";

const InvoiceSchema = new mongoose.Schema({ status: String, paidAt: Date, paidAmount: Number, paymentMethod: String, paymentRef: String }, { timestamps: true, strict: false });
const SalesInvoice = mongoose.models.SalesInvoice || mongoose.model("SalesInvoice", InvoiceSchema);

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const h = await headers();
    if (!h.get("x-user-id")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    const { paidAmount, paymentMethod, paymentRef } = await req.json();
    await connectDB();

    const invoice = await SalesInvoice.findByIdAndUpdate(
      id,
      { status: "PAID", paidAt: new Date(), paidAmount, paymentMethod, paymentRef },
      { new: true }
    ).lean();

    const inv = invoice as any;
    notify({
      event: 'PAYMENT_RECEIVED',
      message: `💰 Payment received.\nInvoice: ${inv?.invoiceNumber || id}\nAmount: ₹${(paidAmount || 0).toLocaleString('en-IN')}\nMethod: ${paymentMethod || 'N/A'}${paymentRef ? `\nRef: ${paymentRef}` : ''}`,
    }).catch(() => {});

    return NextResponse.json({ success: true, invoice });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
