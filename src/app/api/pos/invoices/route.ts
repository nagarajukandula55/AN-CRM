/**
 * POST /api/pos/invoices — POS quick-sale invoice creation. Same
 * GST-split/B2B-vs-B2C/GST-vs-non-GST-series logic as
 * crm/jobsheets/[id]/close/route.ts, reused here rather than reinvented so
 * every invoice in the system (CRM-originated or POS-originated) is
 * structurally identical and files under GST the same way. Billing pattern
 * modeled on standard small-business GST billing apps (myBillBook et al.):
 * party details + a line-item cart + running GST-split totals + payment
 * collected at the point of sale, saved as one invoice in one step.
 *
 * GET /api/pos/invoices lists this business's POS-originated invoices
 * (sourceOrderId starting "POS:") for the till's recent-sales list.
 */

import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import SalesInvoice from "@/models/SalesInvoice";
import Business from "@/models/Business";
import { generateDocumentNumber } from "@/core/numbering/numberingService";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";
import { logAction } from "@/lib/audit/logAction";

export async function GET(req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    if (!session.business?.businessId) {
      return NextResponse.json({ success: false, message: "No active business" }, { status: 400 });
    }

    await connectDB();
    const invoices = await SalesInvoice.find({
      businessId: session.business.businessId,
      sourceOrderId: { $regex: "^POS:" },
      isDeleted: { $ne: true },
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .select("invoiceNumber customer grandTotal status createdAt")
      .lean();

    return NextResponse.json({ success: true, invoices });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("sales", "create"));
    } catch (err: any) {
      return NextResponse.json(
        { success: false, message: err.message },
        { status: err.code === "FORBIDDEN" ? 403 : 401 }
      );
    }
    if (!session.business?.businessId) {
      return NextResponse.json({ success: false, message: "No active business" }, { status: 400 });
    }
    const businessId = session.business.businessId;

    const body = await req.json();
    const {
      customer, // { name, phone, email, company, gstNumber, address }
      items, // [{ description, quantity, unitPrice, taxRate, hsnCode }]
      supplyType = "INTRASTATE",
      placeOfSupply,
      discountAmount = 0,
      paymentMode = "CASH",
      amountPaid,
    } = body;

    if (!customer?.name?.trim()) {
      return NextResponse.json({ success: false, message: "Customer name is required" }, { status: 400 });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ success: false, message: "At least one item is required" }, { status: 400 });
    }

    await connectDB();

    const business = await Business.findById(businessId).select("applyTaxOnB2CBilling").lean<any>();
    const isB2B = Boolean(customer.company?.trim() || customer.gstNumber?.trim());
    // Same B2C tax toggle as the CRM close flow -- see that route's
    // matching comment for the full rationale.
    const applyB2CTax = business?.applyTaxOnB2CBilling !== false;
    const zeroTaxForB2C = !isB2B && !applyB2CTax;

    let subtotal = 0, cgstTotal = 0, sgstTotal = 0, igstTotal = 0;

    const invoiceItems = items.map((item: any) => {
      const effectiveTaxRate = zeroTaxForB2C ? 0 : (item.taxRate || 0);
      const lineAmt = (item.quantity || 1) * (item.unitPrice || 0);
      const totalGST = lineAmt * (effectiveTaxRate / 100);

      let cgstRate = 0, cgstAmount = 0, sgstRate = 0, sgstAmount = 0;
      let igstRate = 0, igstAmount = 0;

      if (supplyType === "INTERSTATE") {
        igstRate = effectiveTaxRate;
        igstAmount = totalGST;
        igstTotal += igstAmount;
      } else {
        cgstRate = effectiveTaxRate / 2;
        sgstRate = cgstRate;
        cgstAmount = totalGST / 2;
        sgstAmount = totalGST / 2;
        cgstTotal += cgstAmount;
        sgstTotal += sgstAmount;
      }

      subtotal += lineAmt;

      return {
        description: item.description || "",
        quantity: item.quantity || 1,
        unit: item.unit || "pcs",
        unitPrice: item.unitPrice || 0,
        hsnCode: item.hsnCode || "",
        taxRate: effectiveTaxRate,
        taxAmount: totalGST,
        cgstRate, cgstAmount,
        sgstRate, sgstAmount,
        igstRate, igstAmount,
        total: lineAmt + totalGST,
      };
    });

    const taxTotal = cgstTotal + sgstTotal + igstTotal;
    const grandTotal = subtotal + taxTotal - (discountAmount || 0);

    const isGstInvoice = zeroTaxForB2C ? false : invoiceItems.some((item: any) => (item.taxRate || 0) > 0);
    const { value: invoiceNumber } = await generateDocumentNumber(
      businessId,
      isB2B ? "B2B_INVOICE" : isGstInvoice ? "INVOICE" : "NON_GST_INVOICE"
    );

    const paidAmount = amountPaid !== undefined ? Number(amountPaid) : grandTotal;
    const invoiceStatus = paidAmount >= grandTotal ? "PAID" : paidAmount > 0 ? "PARTIAL" : "SENT";

    const invoice = await SalesInvoice.create({
      invoiceNumber,
      businessId,
      createdBy: new mongoose.Types.ObjectId(session.user.id),
      invoiceType: isB2B ? "B2B" : "B2C",
      sourceOrderId: `POS:${invoiceNumber}`,
      customer: {
        name: customer.name.trim(),
        company: customer.company?.trim() || undefined,
        email: customer.email?.trim() || undefined,
        phone: customer.phone?.trim() || undefined,
        address: customer.address?.trim() || undefined,
      },
      supplyType,
      placeOfSupply,
      items: invoiceItems,
      subtotal,
      cgstTotal,
      sgstTotal,
      igstTotal,
      taxTotal,
      discountAmount,
      grandTotal,
      notes: `POS sale -- payment mode: ${paymentMode}`,
      status: invoiceStatus,
    });

    logAction({
      action: "CREATE",
      entity: "SalesInvoice",
      entityId: invoice._id.toString(),
      after: { invoiceNumber: invoice.invoiceNumber, grandTotal, paymentMode },
      req,
    });

    return NextResponse.json({ success: true, invoice }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
