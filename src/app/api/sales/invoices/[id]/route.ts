import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
// Was a locally-declared inline SalesInvoice schema (near-identical to, but
// missing invoiceType/vendorId/sourceOrderId from, models/SalesInvoice.ts).
// Mongoose registers models globally by name, so whichever of the 4 route
// files defining "SalesInvoice" happened to load first silently won for
// the whole app — the other 3 definitions became dead weight while still
// creating the false impression each route controlled its own schema. Now
// imports the single canonical model, matching what models/SalesInvoice.ts's
// own top comment already (incorrectly, until now) claimed was already true.
import SalesInvoice from "@/models/SalesInvoice";
import { logAction } from "@/lib/audit/logAction";

/* ── GET single invoice ──────────────────────────────────── */
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    await connectDB();

    const invoice = await SalesInvoice.findById(id).lean();
    if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ success: true, invoice });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/* ── PUT update invoice ──────────────────────────────────── */
export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const h = await headers();
    const userId = h.get("x-user-id");
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    const body = await req.json();
    await connectDB();

    // Recalculate if items sent
    if (body.items) {
      let subtotal = 0, taxTotal = 0;
      body.items = body.items.map((item: any) => {
        const lineTotal = (item.quantity || 1) * (item.unitPrice || 0);
        const tax = lineTotal * ((item.taxRate || 0) / 100);
        subtotal += lineTotal;
        taxTotal += tax;
        return { ...item, taxAmount: tax, total: lineTotal + tax };
      });
      body.subtotal = subtotal;
      body.taxTotal = taxTotal;
      body.grandTotal = subtotal + taxTotal - (body.discountAmount || 0);
    }

    const invoice = await SalesInvoice.findByIdAndUpdate(id, { $set: body }, { new: true }).lean();

    logAction({
      action: "UPDATE",
      entity: "SalesInvoice",
      entityId: id,
      after: invoice,
      req,
      actor: { id: userId },
    });

    return NextResponse.json({ success: true, invoice });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/* ── DELETE invoice ──────────────────────────────────────── */
export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const h = await headers();
    const userId = h.get("x-user-id");
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    await connectDB();
    await SalesInvoice.findByIdAndDelete(id);

    logAction({
      action: "DELETE",
      entity: "SalesInvoice",
      entityId: id,
      req,
      actor: { id: userId },
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
