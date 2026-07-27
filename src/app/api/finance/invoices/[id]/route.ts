/**
 * Finance Invoice by ID API
 */
import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import mongoose, { Schema, Model } from "mongoose";
import { logAction } from "@/lib/audit/logAction";

const InvoiceSchema = new Schema(
  {
    invoiceNumber: { type: String, unique: true },
    client: { type: String, required: true },
    clientEmail: String,
    items: [
      { description: String, quantity: Number, unitPrice: Number, total: Number },
    ],
    subtotal: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
    currency: { type: String, default: "INR" },
    status: {
      type: String,
      enum: ["DRAFT", "SENT", "PAID", "OVERDUE", "CANCELLED"],
      default: "DRAFT",
    },
    dueDate: Date,
    paidDate: Date,
    businessId: String,
    notes: String,
    isDeleted: { type: Boolean, default: false },
    createdBy: String,
  },
  { timestamps: true, versionKey: false }
);

const Invoice: Model<any> =
  mongoose.models.Invoice || mongoose.model("Invoice", InvoiceSchema);

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const h = await headers();
    const userId = h.get("x-user-id");
    if (!userId)
      return NextResponse.json({ success: false, message: "Unauthorised" }, { status: 401 });

    await connectDB();
    const { id } = await context.params;
    const body = await req.json();

    const update: any = { ...body };
    if (body.status === "PAID" && !body.paidDate) {
      update.paidDate = new Date();
    }

    const invoice = await Invoice.findByIdAndUpdate(id, update, { new: true }).lean();
    if (!invoice)
      return NextResponse.json({ success: false, message: "Invoice not found" }, { status: 404 });

    logAction({
      action: "UPDATE",
      entity: "Invoice",
      entityId: id,
      after: update,
      req,
    });

    return NextResponse.json({ success: true, invoice });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
