import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import { Types } from "mongoose";
import Brand from "@/models/Brand";
import ProductCategory from "@/models/ProductCategory";
import { logAction } from "@/lib/audit/logAction";
import { buildBusinessScopeQuery } from "@/core/catalog/businessScopeFilter";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";

// GET /api/brands?businessId=...&search=...&isActive=...
export async function GET(req: NextRequest) {
  try {
    const h = await headers();
    const userId = h.get("x-user-id");
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Was authentication-only -- ANY logged-in account, regardless of role
    // or granted permissions, could view/edit/delete every business's
    // brand catalog. Same gap class as warehouses/stock-transfers before
    // they were fixed (see moduleHierarchy.ts's ops-inventory comment).
    const session = await getEnrichedSession();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try {
      requirePermission(session as any, buildPermissionCode("brands", "view"));
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: err.code === "FORBIDDEN" ? 403 : 401 });
    }

    const { searchParams } = new URL(req.url);
    const businessId = searchParams.get("businessId");
    const search = searchParams.get("search");
    const isActive = searchParams.get("isActive");
    const includeInactive = searchParams.get("includeInactive") === "true";
    const category = searchParams.get("category");
    const productCategoryId = searchParams.get("productCategoryId");

    if (!businessId) {
      return NextResponse.json({ error: "businessId is required" }, { status: 400 });
    }

    await connectDB();

    const scopeQuery = buildBusinessScopeQuery(businessId);
    const query: Record<string, unknown> = { ...scopeQuery };

    // Defaults to active-only, same as /api/product-categories -- pass an
    // explicit isActive=true/false to filter one way, or includeInactive=true
    // (used by the admin Brands masters page, which manages both) to see
    // everything.
    if (isActive !== null) {
      query.isActive = isActive === "true";
    } else if (!includeInactive) {
      query.isActive = true;
    }

    if (category) {
      query.category = category;
    }

    if (productCategoryId) {
      // A brand tagged to a PARENT category (e.g. one "Native" brand tagged
      // to "Edible") should still show when a CHILD category under it is
      // selected ("Instant Mix", "Cold Pressed Oil", ...) -- otherwise every
      // subcategory would need its own separately-tagged brand row.
      const cat = await ProductCategory.findById(productCategoryId).select("parentId").lean<any>();
      const categoryIds = [productCategoryId, ...(cat?.parentId ? [String(cat.parentId)] : [])];
      query.productCategoryId = { $in: categoryIds };
    }

    if (search) {
      query.$and = [
        { $or: scopeQuery.$or },
        { $or: [{ name: { $regex: search, $options: "i" } }, { description: { $regex: search, $options: "i" } }] },
      ];
      delete query.$or;
    }

    // Dropdown/TreeSelect payload only ever reads _id/name/parentId/logoUrl
    // (see TreeSelectItem) plus isActive/category for masters-page display
    // -- restricting the projection cuts payload size now that the catalog
    // spans thousands of models across 45 categories.
    const brands = await Brand.find(query)
      .select("name parentId logoUrl isActive category businessId")
      .sort({ name: 1 })
      .lean();

    return NextResponse.json({ success: true, brands });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// POST /api/brands
export async function POST(req: NextRequest) {
  try {
    const h = await headers();
    const userId = h.get("x-user-id");
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const session = await getEnrichedSession();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try {
      requirePermission(session as any, buildPermissionCode("brands", "create"));
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: err.code === "FORBIDDEN" ? 403 : 401 });
    }

    const body = await req.json();
    const { name, description, businessId, logoUrl, businessScope, businessIds, parentId, category, productCategoryId } = body;

    if (!name || !businessId) {
      return NextResponse.json(
        { error: "name and businessId are required" },
        { status: 400 }
      );
    }

    await connectDB();

    const brand = await Brand.create({
      name: name.trim(),
      description: description?.trim(),
      category: category || null,
      productCategoryId: productCategoryId ? new Types.ObjectId(productCategoryId) : null,
      parentId: parentId ? new Types.ObjectId(parentId) : null,
      businessId: new Types.ObjectId(businessId),
      logoUrl: logoUrl?.trim(),
      businessScope: businessScope || "SINGLE",
      businessIds: Array.isArray(businessIds) ? businessIds : [],
    });

    logAction({
      action: "CREATE",
      entity: "Brand",
      entityId: brand?._id?.toString(),
      after: body,
      req,
    });

    return NextResponse.json({ success: true, brand }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("duplicate key") || message.includes("E11000")) {
      return NextResponse.json(
        { success: false, error: "A brand with this name already exists" },
        { status: 409 }
      );
    }
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
