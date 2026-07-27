import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import { Types } from "mongoose";
import ProductCategory from "@/models/ProductCategory";
import NativeProduct from "@/models/NativeProduct";
import { logAction } from "@/lib/audit/logAction";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";
import { buildBusinessScopeQuery } from "@/core/catalog/businessScopeFilter";

// GET /api/product-categories?businessId=...&search=...
export async function GET(req: NextRequest) {
  try {
    const h = await headers();
    const userId = h.get("x-user-id");
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const businessId = searchParams.get("businessId");
    const search = searchParams.get("search");
    // Was never enforced here even though ProductCategory.isActive is
    // fully toggleable from the admin Product Categories page -- every
    // consumer of this route (including the vendor product-creation
    // wizard's Category dropdown) showed deactivated categories exactly
    // the same as active ones. includeInactive lets the admin management
    // page itself keep seeing everything (it needs to show/toggle
    // inactive rows), while every other caller (storefront-facing pickers)
    // now only sees what's actually "allowed" for the business.
    const includeInactive = searchParams.get("includeInactive") === "true";

    if (!businessId) {
      return NextResponse.json({ error: "businessId is required" }, { status: 400 });
    }

    await connectDB();

    const scopeQuery = buildBusinessScopeQuery(businessId);
    const query: Record<string, unknown> = { ...scopeQuery, isDeleted: false };
    if (!includeInactive) query.isActive = true;

    if (search) {
      query.$and = [
        { $or: scopeQuery.$or },
        { $or: [{ name: { $regex: search, $options: "i" } }, { description: { $regex: search, $options: "i" } }] },
      ];
      delete query.$or;
    }

    const categories = await ProductCategory.find(query)
      .populate("parentId", "name")
      .sort({ name: 1 })
      .lean();

    // Get product counts per category name
    const categoryNames = categories.map((c) => c.name);
    const productCounts = await NativeProduct.aggregate([
      {
        $match: {
          businessId: new Types.ObjectId(businessId),
          category: { $in: categoryNames },
          isDeleted: { $ne: true },
        },
      },
      { $group: { _id: "$category", count: { $sum: 1 } } },
    ]);

    const countMap: Record<string, number> = {};
    for (const pc of productCounts) {
      if (pc._id) countMap[pc._id] = pc.count;
    }

    const result = categories.map((cat) => ({
      ...cat,
      productCount: countMap[cat.name] || 0,
    }));

    return NextResponse.json({ success: true, categories: result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// POST /api/product-categories
// Category creation is Super-Admin-only: the wizard UI (StepBasicInfo.tsx)
// only lets vendors SELECT an existing category, never create a new one, so
// this endpoint being reachable by any authenticated user (previously just
// an x-user-id header check, no permission check at all) was a real gap —
// a vendor could hit this route directly and add categories outside the
// admin-curated taxonomy.
export async function POST(req: NextRequest) {
  try {
    const h = await headers();
    const userId = h.get("x-user-id");
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("product_categories", "create"));
    } catch (err: any) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: err.code === "FORBIDDEN" ? 403 : 401 }
      );
    }

    const body = await req.json();
    const { name, description, parentId, imageUrl, businessId, businessScope, businessIds } = body;

    if (!name || !businessId) {
      return NextResponse.json(
        { error: "name and businessId are required" },
        { status: 400 }
      );
    }

    await connectDB();

    // Check duplicate name within business
    const existing = await ProductCategory.findOne({
      businessId: new Types.ObjectId(businessId),
      name: name.trim(),
      isDeleted: false,
    });
    if (existing) {
      return NextResponse.json(
        { success: false, error: "A category with this name already exists" },
        { status: 409 }
      );
    }

    const category = await ProductCategory.create({
      name: name.trim(),
      description: description?.trim() || undefined,
      parentId: parentId ? new Types.ObjectId(parentId) : null,
      imageUrl: imageUrl?.trim() || undefined,
      businessId: new Types.ObjectId(businessId),
      businessScope: businessScope || "SINGLE",
      businessIds: Array.isArray(businessIds) ? businessIds : [],
      createdBy: new Types.ObjectId(userId),
    });

    logAction({
      action: "CREATE",
      entity: "ProductCategory",
      entityId: category._id?.toString(),
      after: category,
      req,
      actor: { id: userId, businessId },
    });

    return NextResponse.json({ success: true, category }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
