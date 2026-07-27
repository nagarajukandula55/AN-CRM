import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import { Types } from "mongoose";
import MaterialCategory from "@/models/MaterialCategory";
import { logAction } from "@/lib/audit/logAction";
import { buildBusinessScopeQuery } from "@/core/catalog/businessScopeFilter";
// Required for .populate(...) below -- model must be registered before populate can resolve it.
import "@/models/ProductCategory";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";

/* =========================================================
 * GET  /api/material-categories?businessId=xxx
 * List all non-deleted categories for a business
 * ======================================================= */
export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const h = await headers();
    const userId = h.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const session = await getEnrichedSession();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try {
      requirePermission(session as any, buildPermissionCode("material_categories", "view"));
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: err.code === "FORBIDDEN" ? 403 : 401 });
    }

    const { searchParams } = new URL(req.url);
    const businessId = searchParams.get("businessId");

    if (!businessId) {
      return NextResponse.json(
        { success: false, error: "businessId is required" },
        { status: 400 }
      );
    }

    const categories = await MaterialCategory.find({
      ...buildBusinessScopeQuery(businessId),
      isDeleted: false,
    })
      .populate("parentCategory", "name code")
      .sort({ name: 1 });

    return NextResponse.json({ success: true, data: categories });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}

/* =========================================================
 * POST /api/material-categories
 * Create a new material category
 * ======================================================= */
export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const h = await headers();
    const userId = h.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const session = await getEnrichedSession();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try {
      requirePermission(session as any, buildPermissionCode("material_categories", "create"));
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: err.code === "FORBIDDEN" ? 403 : 401 });
    }

    const body = await req.json();
    const { businessId, name, code, description, parentCategory, unit, isActive, businessScope, businessIds } = body;

    if (!businessId) {
      return NextResponse.json(
        { success: false, error: "businessId is required" },
        { status: 400 }
      );
    }
    if (!name || !name.trim()) {
      return NextResponse.json(
        { success: false, error: "name is required" },
        { status: 400 }
      );
    }

    // Check for duplicate name within the same business
    const existing = await MaterialCategory.findOne({
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

    const category = await MaterialCategory.create({
      businessId: new Types.ObjectId(businessId),
      name: name.trim(),
      code: code?.trim() || undefined,
      description: description?.trim() || undefined,
      parentCategory: parentCategory ? new Types.ObjectId(parentCategory) : null,
      unit: unit?.trim() || undefined,
      isActive: isActive !== undefined ? isActive : true,
      isDeleted: false,
      businessScope: businessScope || "SINGLE",
      businessIds: Array.isArray(businessIds) ? businessIds : [],
      createdBy: new Types.ObjectId(userId),
    });

    logAction({
      action: "CREATE",
      entity: "MaterialCategory",
      entityId: category?._id?.toString(),
      after: category,
      req,
    });

    return NextResponse.json({ success: true, data: category }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
