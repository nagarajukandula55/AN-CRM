import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import NativeProduct from "@/models/NativeProduct";
import { resolveVendorContext } from "@/lib/auth/vendorContext";

/**
 * GET /api/vendor/catalog — this vendor's own live storefront products
 * (NativeProduct, the model approval writes to and the storefront reads
 * from), each with its real stock count. Used by Inventory and Offline
 * Sale, both of which need "just this vendor's own sellable products",
 * not the whole business's catalog (/api/products has no vendor scoping
 * at all -- reusing it here would have leaked every other vendor's
 * products on the same business into this vendor's Inventory page).
 */
export async function GET(req: NextRequest) {
  try {
    const headersList = await headers();
    const userId = headersList.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    // resolveVendorContext covers both the vendor Owner (User.role ===
    // "VENDOR") AND vendor-team staff/Managers (whose User.role is never
    // actually "VENDOR") -- a blunt x-user-role check here used to reject
    // every staff member outright before this even ran.
    const ctx = await resolveVendorContext(userId);
    if (!ctx) {
      return NextResponse.json({ success: false, message: "Vendor profile not found" }, { status: 404 });
    }

    const products = await NativeProduct.find({
      vendorId: ctx.vendor._id,
      isDeleted: { $ne: true },
    })
      .select("name sku stock unit basePrice taxRate hsn isActive")
      .sort({ name: 1 })
      .lean();

    return NextResponse.json({ success: true, products });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
