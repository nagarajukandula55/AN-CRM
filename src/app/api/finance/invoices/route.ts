import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";
import SalesInvoice from "@/models/SalesInvoice";
import SalesOrder from "@/models/SalesOrder";
import { generateDocumentNumber } from "@/core/numbering/numberingService";
import { logAction } from "@/lib/audit/logAction";

/* =========================================================
 * GET INVOICES
 * =======================================================*/
export async function GET(req: NextRequest) {
  try {
    const session = await getEnrichedSession();

    if (!session?.user || !session.business) {
      return NextResponse.json(
        { error: "Unauthorized or missing business context" },
        { status: 401 }
      );
    }

    requirePermission(session as any, buildPermissionCode("finance", "view"));

    const invoices = await SalesInvoice.find({
      businessId: new Types.ObjectId(session.business.businessId),
      isDeleted: false,
    }).sort({ createdAt: -1 });

    return NextResponse.json({
      success: true,
      data: invoices,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Internal Server Error",
      },
      { status: 500 }
    );
  }
}

/* =========================================================
 * CREATE INVOICE FROM SALES ORDER
 * =======================================================*/
export async function POST(req: NextRequest) {
  try {
    const session = await getEnrichedSession();

    if (!session?.user || !session.business) {
      return NextResponse.json(
        { error: "Unauthorized or missing business context" },
        { status: 401 }
      );
    }

    requirePermission(session as any, buildPermissionCode("finance", "create"));

    const body = await req.json();

    const { salesOrderId, taxRate } = body;

    if (!salesOrderId) {
      return NextResponse.json(
        { error: "salesOrderId is required" },
        { status: 400 }
      );
    }

    const businessId = session.business.businessId;

    /**
     * STEP 1: Validate Sales Order
     */
    const order = await SalesOrder.findOne({
      _id: new Types.ObjectId(salesOrderId),
      businessId: new Types.ObjectId(businessId),
      isDeleted: false,
    });

    if (!order) {
      return NextResponse.json(
        { error: "Sales order not found" },
        { status: 404 }
      );
    }

    /**
     * STEP 2: Build line items + totals.
     * Was reading item.quantity (undefined -- Order/OrderItemSchema's real
     * field is `qty`) which made subTotal always NaN, and created an
     * Invoice document with fields (salesOrderId, subTotal, taxRate,
     * taxAmount, totalAmount, createdBy) that don't exist anywhere on that
     * schema -- so `invoiceNumber`/`orderId` (both required) were never
     * set either, and this route's Invoice.create() always threw a
     * validation error. Fixed to read the real item shape and build
     * SalesInvoice's per-item GST-split shape, same pattern as
     * lib/invoice/createInvoice.ts and the CRM jobsheet-close route.
     */
    const effectiveTaxRate = Number(taxRate) || 0;

    let subtotal = 0;
    let cgstTotal = 0;
    let sgstTotal = 0;

    const invoiceItems = (order.items || []).map((item: any) => {
      const quantity = Number(item.qty || 1);
      const unitPrice = Number(item.price || item.sellingPrice || 0);
      const lineAmt = quantity * unitPrice;
      const lineTax = (lineAmt * effectiveTaxRate) / 100;
      const cgstAmount = lineTax / 2;
      const sgstAmount = lineTax / 2;

      subtotal += lineAmt;
      cgstTotal += cgstAmount;
      sgstTotal += sgstAmount;

      return {
        description: item.name || "",
        hsnCode: item.hsn || "",
        quantity,
        unit: "pcs",
        unitPrice,
        taxRate: effectiveTaxRate,
        taxAmount: lineTax,
        cgstRate: effectiveTaxRate / 2,
        cgstAmount,
        sgstRate: effectiveTaxRate / 2,
        sgstAmount,
        assessableValue: lineAmt,
        total: lineAmt + lineTax,
      };
    });

    const taxTotal = cgstTotal + sgstTotal;
    const grandTotal = subtotal + taxTotal;

    const { value: invoiceNumber } = await generateDocumentNumber(businessId, "INVOICE", { vendorId: "" });

    /**
     * STEP 3: Create Invoice
     */
    const invoice = await SalesInvoice.create({
      businessId: new Types.ObjectId(businessId),
      createdBy: new Types.ObjectId(session.user.id),
      sourceOrderId: String(salesOrderId),
      invoiceNumber,
      invoiceType: "STANDARD",
      customer: { name: order.address?.name || order.customerName || "Customer" },
      items: invoiceItems,
      subtotal,
      cgstTotal,
      sgstTotal,
      taxTotal,
      grandTotal,
      status: "DRAFT",
    });

    logAction({
      action: "CREATE",
      entity: "SalesInvoice",
      entityId: invoice._id?.toString(),
      after: invoice,
      req,
      actor: { id: session.user.id, businessId },
    });

    return NextResponse.json({
      success: true,
      message: "Invoice created successfully",
      data: invoice,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Internal Server Error",
      },
      { status: 500 }
    );
  }
}
