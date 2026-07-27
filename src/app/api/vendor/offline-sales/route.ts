import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import NativeProduct from "@/models/NativeProduct";
import SalesInvoice from "@/models/SalesInvoice";
import { resolveVendorContext } from "@/lib/auth/vendorContext";
import { generateDocumentNumber } from "@/core/numbering/numberingService";
import { logAction } from "@/lib/audit/logAction";

/**
 * Offline sale — a vendor selling to a walk-in/offline customer directly
 * (not through the Native storefront), raising a real GST invoice for it.
 * Deducts the same NativeProduct.stock every online order confirmation
 * deducts, so online and offline sales never double-sell the same stock.
 * Per explicit requirement, serial numbers must be captured per unit for
 * every line item (offline sales of physical goods need to be traceable).
 */

interface OfflineSaleLine {
  productId: string;
  quantity: number;
  unitPrice?: number; // defaults to the product's basePrice if omitted
  serialNumbers: string[];
}

async function requireVendor() {
  const headersList = await headers();
  const userId = headersList.get("x-user-id");
  if (!userId) return { error: NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 }) };
  // resolveVendorContext covers both the vendor Owner (User.role ===
  // "VENDOR") AND vendor-team staff/Managers (whose User.role is never
  // actually "VENDOR") -- a blunt x-user-role check here used to reject
  // every staff member outright before this even ran.
  const ctx = await resolveVendorContext(userId);
  if (!ctx) return { error: NextResponse.json({ success: false, message: "Vendor profile not found" }, { status: 404 }) };
  return { userId, vendor: ctx.vendor as any };
}

export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const auth = await requireVendor();
    if ("error" in auth) return auth.error;

    const invoices = await SalesInvoice.find({
      vendorId: auth.vendor._id,
      sourceOrderId: { $regex: "^OFFLINE:" },
    })
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();

    return NextResponse.json({ success: true, invoices });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const auth = await requireVendor();
    if ("error" in auth) return auth.error;
    const { userId, vendor } = auth;

    const body = await req.json();
    const customer = body.customer || {};
    const lines: OfflineSaleLine[] = Array.isArray(body.lines) ? body.lines : [];
    const supplyType = body.supplyType === "INTERSTATE" ? "INTERSTATE" : "INTRASTATE";

    if (!customer.name?.trim() || !customer.phone?.trim()) {
      return NextResponse.json({ success: false, message: "Customer name and phone are required" }, { status: 400 });
    }
    if (lines.length === 0) {
      return NextResponse.json({ success: false, message: "Add at least one product line" }, { status: 400 });
    }

    // Resolve + validate every line before touching stock or creating
    // anything -- an offline sale must be all-or-nothing, never partially
    // committed.
    const resolvedLines: Array<{ product: any; qty: number; unitPrice: number; serialNumbers: string[] }> = [];
    for (const line of lines) {
      const qty = Number(line.quantity || 0);
      if (!qty || qty <= 0) {
        return NextResponse.json({ success: false, message: "Every line needs a quantity greater than 0" }, { status: 400 });
      }
      const product = await NativeProduct.findOne({ _id: line.productId, vendorId: vendor._id });
      if (!product) {
        return NextResponse.json({ success: false, message: "Product not found or not yours" }, { status: 404 });
      }
      const serials = (line.serialNumbers || []).map((s) => String(s).trim()).filter(Boolean);
      // Per explicit requirement: serial numbers must be captured, one per
      // unit sold -- not optional, not a single shared value for the whole
      // line.
      if (serials.length !== qty) {
        return NextResponse.json(
          {
            success: false,
            message: `"${product.name}": enter exactly ${qty} serial number(s) (one per unit) — got ${serials.length}.`,
          },
          { status: 400 }
        );
      }
      if ((product.stock || 0) < qty) {
        return NextResponse.json(
          {
            success: false,
            message: `Not enough stock for "${product.name}": need ${qty}, have ${product.stock || 0}. Use Stock Adjustment (Inbound) first.`,
          },
          { status: 409 }
        );
      }
      const unitPrice = Number(line.unitPrice ?? product.basePrice ?? 0);
      resolvedLines.push({ product, qty, unitPrice, serialNumbers: serials });
    }

    let subtotal = 0, cgstTotal = 0, sgstTotal = 0, igstTotal = 0;
    const items = resolvedLines.map(({ product, qty, unitPrice, serialNumbers }) => {
      const lineAmt = qty * unitPrice;
      const taxRate = product.taxRate || 0;
      const totalGST = lineAmt * (taxRate / 100);
      let cgstRate = 0, cgstAmount = 0, sgstRate = 0, sgstAmount = 0, igstRate = 0, igstAmount = 0;
      if (supplyType === "INTERSTATE") {
        igstRate = taxRate;
        igstAmount = totalGST;
        igstTotal += igstAmount;
      } else {
        cgstRate = taxRate / 2;
        sgstRate = cgstRate;
        cgstAmount = totalGST / 2;
        sgstAmount = totalGST / 2;
        cgstTotal += cgstAmount;
        sgstTotal += sgstAmount;
      }
      subtotal += lineAmt;
      return {
        description: product.name,
        quantity: qty,
        unit: product.unit || "pcs",
        unitPrice,
        taxRate,
        taxAmount: totalGST,
        hsnCode: product.hsn || "",
        cgstRate, cgstAmount, sgstRate, sgstAmount, igstRate, igstAmount,
        assessableValue: lineAmt,
        total: lineAmt + totalGST,
        serialNumbers,
      };
    });

    const taxTotal = cgstTotal + sgstTotal + igstTotal;
    const grandTotal = subtotal + taxTotal;
    const isGstInvoice = items.some((i) => i.taxRate > 0);

    const { value: invoiceNumber } = await generateDocumentNumber(
      String(vendor.businessId),
      isGstInvoice ? "INVOICE" : "NON_GST_INVOICE",
      { vendorId: vendor.vendorId || "" }
    );

    const invoice = await SalesInvoice.create({
      invoiceNumber,
      businessId: vendor.businessId,
      vendorId: vendor._id,
      createdBy: userId,
      invoiceType: customer.gstin ? "B2B" : "B2C",
      sourceOrderId: `OFFLINE:${vendor.vendorId}:${Date.now()}`,
      customer: {
        name: customer.name.trim(),
        phone: customer.phone.trim(),
        email: customer.email?.trim(),
        address: customer.address?.trim(),
        gstin: customer.gstin?.trim(),
      },
      supplyType,
      items,
      subtotal,
      cgstTotal,
      sgstTotal,
      igstTotal,
      taxTotal,
      grandTotal,
      notes: `Offline sale by vendor ${vendor.vendorId} (${vendor.companyName})`,
      status: "SENT",
    });

    // Deduct stock now that the invoice is real and committed.
    for (const { product, qty } of resolvedLines) {
      product.stock = Math.max(0, (product.stock || 0) - qty);
      await product.save();
    }

    logAction({
      action: "CREATE",
      entity: "SalesInvoice",
      entityId: invoice._id?.toString(),
      after: invoice,
      req,
      actor: { id: userId, businessId: String(vendor.businessId) },
    });

    return NextResponse.json({ success: true, invoice });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
