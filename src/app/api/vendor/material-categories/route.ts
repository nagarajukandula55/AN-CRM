import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import MaterialCategory from "@/models/MaterialCategory";
import { resolveVendorContext } from "@/lib/auth/vendorContext";

/**
 * GET/POST /api/vendor/material-categories — vendor-scoped material
 * category list + quick-add, for the Materials page's category dropdown.
 * "material_categories" is deliberately NOT in VENDOR_MODULE_KEYS (it's a
 * business-wide taxonomy, not something every vendor should freely edit),
 * so this is a narrower vendor-facing path, same pattern as
 * /api/vendor/materials itself -- list + create-your-own only.
 */
export async function GET() {
  try {
    const headersList = await headers();
    const userId = headersList.get("x-user-id");
    if (!userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    await connectDB();
    const ctx = await resolveVendorContext(userId);
    if (!ctx) return NextResponse.json({ success: false, message: "Vendor profile not found" }, { status: 404 });
    const vendor = ctx.vendor as any;

    const categories = await MaterialCategory.find({ businessId: vendor.businessId, isDeleted: { $ne: true } })
      .select("name")
      .sort({ name: 1 })
      .lean();

    return NextResponse.json({ success: true, data: categories });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const headersList = await headers();
    const userId = headersList.get("x-user-id");
    if (!userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    await connectDB();
    const ctx = await resolveVendorContext(userId);
    if (!ctx) return NextResponse.json({ success: false, message: "Vendor profile not found" }, { status: 404 });
    const vendor = ctx.vendor as any;

    const body = await req.json();
    const name = String(body.name || "").trim();
    if (!name) return NextResponse.json({ success: false, message: "Category name is required" }, { status: 400 });

    let category = await MaterialCategory.findOne({ businessId: vendor.businessId, name, isDeleted: { $ne: true } });
    if (!category) {
      category = await MaterialCategory.create({ businessId: vendor.businessId, name });
    }

    return NextResponse.json({ success: true, data: category });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
