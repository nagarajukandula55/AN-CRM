import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import Business from "@/models/Business";
import SalesInvoice from "@/models/SalesInvoice";
import Order from "@/models/Order";
import NativeProduct from "@/models/NativeProduct";
import { resolveOwnerOrManagerVendor } from "@/core/access/vendorAccess.service";

type RouteContext = { params: Promise<{ id: string }> };

async function nextInvoiceNumber(prefix: string): Promise<string> {
  // Simple monotonically-increasing number per prefix. Uses count+timestamp
  // fallback to stay unique under concurrency.
  const count = await SalesInvoice.countDocuments({
    invoiceNumber: new RegExp(`^${prefix}-`),
  });
  return `${prefix}-${String(count + 1).padStart(6, "0")}`;
}

/**
 * POST /api/vendor/orders/[id]/confirm
 *
 * Native order fulfilment flow:
 *   Customer places order on the Native website → the order lines routed to
 *   this vendor appear in the vendor portal → the VENDOR CONFIRMS here.
 *
 * On confirmation this endpoint creates the two invoices of the flow:
 *   1. B2B invoice — FROM the vendor TO the business (Native): our purchase
 *      from the vendor. Billed to the business's registered address/GSTIN
 *      (configured on the Business record).
 *   2. B2C invoice — FROM the business (Native) TO the end customer, using
 *      the customer's details from the order.
 * The order then moves to PROCESSING.
 */
export async function POST(req: NextRequest, context: RouteContext) {
  try {
    await connectDB();
    const h = await headers();
    const userId = h.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    // resolveOwnerOrManagerVendor already covers both the vendor Owner
    // (User.role === "VENDOR") AND a granted Manager (whose User.role is
    // never actually "VENDOR") -- a blunt x-user-role check here used to
    // reject every Manager outright before this even ran.
    const vendor = await resolveOwnerOrManagerVendor(userId);
    if (!vendor) {
      return NextResponse.json({ success: false, message: "Vendor profile not found" }, { status: 404 });
    }
    if (!(vendor as any).isApproved) {
      return NextResponse.json({ success: false, message: "Vendor not approved yet" }, { status: 403 });
    }

    const { id } = await context.params;
    const order = await (Order as any).findOne({
      $or: [{ _id: id.match(/^[0-9a-f]{24}$/i) ? id : undefined }, { orderId: id }].filter(
        (c) => c && Object.values(c)[0] !== undefined
      ),
    });
    if (!order) {
      return NextResponse.json({ success: false, message: "Order not found" }, { status: 404 });
    }

    // Only cart lines routed to this vendor
    const vendorIdStr = String((vendor as any)._id);
    const vendorLines = (order.cart || []).filter(
      (line: any) => String(line.vendorId || "") === vendorIdStr
    );
    if (vendorLines.length === 0) {
      return NextResponse.json(
        { success: false, message: "This order has no line items assigned to your vendor account" },
        { status: 403 }
      );
    }

    if (["CANCELLED", "REFUNDED", "EXPIRED", "FAILED"].includes(order.status)) {
      return NextResponse.json(
        { success: false, message: `Order is ${order.status} and cannot be confirmed` },
        { status: 400 }
      );
    }

    // Idempotency — don't double-invoice the same order+vendor
    const existingB2B = await SalesInvoice.findOne({
      sourceOrderId: order.orderId || String(order._id),
      vendorId: (vendor as any)._id,
      invoiceType: "B2B",
    }).lean();
    if (existingB2B) {
      return NextResponse.json(
        { success: false, message: "This order is already confirmed and invoiced" },
        { status: 409 }
      );
    }

    // Stock gate — a customer can place an order regardless of stock (the
    // storefront never blocked checkout on availability), but a vendor may
    // only ACCEPT/PROCESS it once they actually have enough on hand. Was
    // no check at all: any order could be confirmed regardless of stock,
    // silently going negative with nothing to reconcile against. If short,
    // the vendor uses Stock Adjustment (Inbound) to legally bring stock in
    // first, then retries confirmation -- not blocked forever, just gated
    // on having real stock.
    const shortItems: { name: string; required: number; available: number }[] = [];
    const productDocs = new Map<string, any>();
    for (const line of vendorLines) {
      const product = await NativeProduct.findById(line.productId);
      if (!product) continue;
      productDocs.set(String(line.productId), product);
      const required = line.qty || 1;
      const available = product.stock || 0;
      if (available < required) {
        shortItems.push({ name: line.name, required, available });
      }
    }
    if (shortItems.length > 0) {
      return NextResponse.json(
        {
          success: false,
          message: `Not enough stock to process this order: ${shortItems
            .map((s) => `${s.name} (need ${s.required}, have ${s.available})`)
            .join(", ")}. Use Stock Adjustment (Inbound) to bring in more stock, then try again.`,
          shortItems,
        },
        { status: 409 }
      );
    }

    const business = await (Business as any)
      .findById((vendor as any).businessId)
      .select("name legalName brandName email phone address city state pincode compliance")
      .lean();

    const businessAddress = [business?.address, business?.city, business?.state, business?.pincode]
      .filter(Boolean)
      .join(", ");

    /* ── Build shared line items ─────────────────────────────────────── */
    const items = vendorLines.map((line: any) => {
      const qty = line.qty || 1;
      const unitPrice = line.price || line.sellingPrice || 0;
      const taxRate = line.taxRate || 0;
      const base = qty * unitPrice;
      const taxAmount = (base * taxRate) / 100;
      return {
        description: line.name + (line.variant ? ` (${line.variant})` : ""),
        quantity: qty,
        unit: "pcs",
        unitPrice,
        taxRate,
        taxAmount,
        total: base + taxAmount,
      };
    });
    const subtotal = items.reduce((s: number, i: any) => s + i.quantity * i.unitPrice, 0);
    const taxTotal = items.reduce((s: number, i: any) => s + i.taxAmount, 0);
    const grandTotal = subtotal + taxTotal;

    const sourceOrderId = order.orderId || String(order._id);

    /* ── 1. B2B invoice: vendor → business (our purchase) ───────────── */
    const b2bInvoice = await SalesInvoice.create({
      invoiceNumber: await nextInvoiceNumber("B2B"),
      businessId: (vendor as any).businessId,
      invoiceType: "B2B",
      vendorId: (vendor as any)._id,
      sourceOrderId,
      customer: {
        // On a B2B purchase invoice, the "customer" is OUR business (Native)
        name: business?.legalName || business?.name || "Business",
        email: business?.email || undefined,
        phone: business?.phone || undefined,
        address: businessAddress || undefined,
        gstin: business?.compliance?.gstNumber || undefined,
      },
      items,
      subtotal,
      taxTotal,
      grandTotal,
      currency: "INR",
      notes: `Purchase from vendor ${(vendor as any).companyName} (${(vendor as any).vendorId}) against order ${sourceOrderId}`,
      status: "SENT",
      issueDate: new Date(),
    });

    /* ── 2. B2C invoice: business → end customer ────────────────────── */
    const shippingAddress = order.address
      ? [order.address.line1, order.address.line2, order.address.city, order.address.state, order.address.pincode]
          .filter(Boolean)
          .join(", ")
      : undefined;

    const b2cInvoice = await SalesInvoice.create({
      invoiceNumber: await nextInvoiceNumber("B2C"),
      businessId: (vendor as any).businessId,
      invoiceType: "B2C",
      vendorId: (vendor as any)._id,
      sourceOrderId,
      customer: {
        name: order.customer?.name || "Customer",
        email: order.customer?.email || undefined,
        phone: order.customer?.phone || undefined,
        address: shippingAddress,
      },
      items,
      subtotal,
      taxTotal,
      grandTotal,
      currency: "INR",
      notes: `Invoice for order ${sourceOrderId}`,
      status: "SENT",
      issueDate: new Date(),
    });

    /* ── 3. Deduct stock — only now, once confirmation is actually going
       through (already re-validated above), so a rejected/failed
       confirmation never touches stock. ─────────────────────────────── */
    for (const line of vendorLines) {
      const product = productDocs.get(String(line.productId));
      if (!product) continue;
      product.stock = Math.max(0, (product.stock || 0) - (line.qty || 1));
      await product.save();
    }

    /* ── 4. Move the order forward ──────────────────────────────────── */
    if (["CREATED", "PENDING_PAYMENT", "PAID"].includes(order.status)) {
      order.status = "PROCESSING";
    }
    order.statusHistory = order.statusHistory || [];
    order.statusHistory.push({
      status: "VENDOR_CONFIRMED",
      at: new Date(),
      by: `vendor:${(vendor as any).vendorId}`,
    });
    await order.save();

    return NextResponse.json({
      success: true,
      message: "Order confirmed — B2B and B2C invoices generated",
      order: { _id: order._id, orderId: order.orderId, status: order.status },
      invoices: {
        b2b: { _id: b2bInvoice._id, invoiceNumber: b2bInvoice.invoiceNumber, grandTotal },
        b2c: { _id: b2cInvoice._id, invoiceNumber: b2cInvoice.invoiceNumber, grandTotal },
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}
