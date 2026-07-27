import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import NativeProduct from "@/models/NativeProduct";
import VendorStockAdjustment from "@/models/VendorStockAdjustment";
import { resolveVendorContext } from "@/lib/auth/vendorContext";
import { generateDocumentNumber } from "@/core/numbering/numberingService";
import { logAction } from "@/lib/audit/logAction";

/**
 * GET /api/vendor/stock-adjustments — this vendor's own inbound/adjustment
 * history (for the Inventory page + CSV export).
 * POST /api/vendor/stock-adjustments — the legal way a vendor gets stock
 * into the system: an auditable, numbered adjustment against their own
 * product's NativeProduct.stock (the same field the storefront reads for
 * availability, and what order confirmation checks/deducts against).
 */

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

    const adjustments = await VendorStockAdjustment.find({ vendorId: auth.vendor._id })
      .populate("productId", "name sku")
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();

    return NextResponse.json({ success: true, adjustments });
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
    const productId = String(body.productId || "");
    const type = String(body.type || "INBOUND");
    const quantity = Number(body.quantity || 0);
    const reason = String(body.reason || "").trim();

    if (!productId) {
      return NextResponse.json({ success: false, message: "Product is required" }, { status: 400 });
    }
    if (!quantity || quantity <= 0) {
      return NextResponse.json({ success: false, message: "Quantity must be a positive number" }, { status: 400 });
    }
    if (!["INBOUND", "CORRECTION", "DAMAGED", "RETURN"].includes(type)) {
      return NextResponse.json({ success: false, message: "Invalid adjustment type" }, { status: 400 });
    }

    // A vendor can only adjust stock for a product that's actually theirs
    // -- vendorId was stamped on NativeProduct at approval time (see
    // api/vendor-products/[id]/approve/route.ts).
    const product = await NativeProduct.findOne({ _id: productId, vendorId: vendor._id });
    if (!product) {
      return NextResponse.json({ success: false, message: "Product not found or not yours" }, { status: 404 });
    }

    const previousStock = product.stock || 0;
    // INBOUND/RETURN add stock; DAMAGED/CORRECTION here means "remove"
    // (a vendor found less than expected, or damaged units) -- kept as two
    // separate reasons rather than one ambiguous "adjust" so the audit
    // trail is self-explanatory without reading the quantity's sign.
    const isAddition = type === "INBOUND" || type === "RETURN";
    const newStock = isAddition
      ? previousStock + quantity
      : Math.max(0, previousStock - quantity);

    product.stock = newStock;
    await product.save();

    const { value: adjustmentNumber } = await generateDocumentNumber(
      String(vendor.businessId),
      "STOCK_ADJUSTMENT",
      { vendorId: vendor.vendorId || "" }
    );

    const adjustment = await VendorStockAdjustment.create({
      businessId: vendor.businessId,
      vendorId: vendor._id,
      productId: product._id,
      adjustmentNumber,
      type,
      quantity,
      previousStock,
      newStock,
      reason,
      createdBy: userId,
    });

    logAction({
      action: "CREATE",
      entity: "VendorStockAdjustment",
      entityId: adjustment._id?.toString(),
      after: adjustment,
      req,
      actor: { id: userId, businessId: String(vendor.businessId) },
    });

    return NextResponse.json({ success: true, adjustment, product: { _id: product._id, stock: product.stock } });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
