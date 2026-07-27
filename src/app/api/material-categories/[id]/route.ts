import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import { Types } from "mongoose";
import MaterialCategory from "@/models/MaterialCategory";
import { logAction } from "@/lib/audit/logAction";
// Required for .populate(...) below -- model must be registered before populate can resolve it.
import "@/models/ProductCategory";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";

/* =========================================================
 * GET /api/material-categories/[id]
 * Fetch a single material category by id
 * ======================================================= */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
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

    const { id } = await context.params;

    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, error: "Invalid id" },
        { status: 400 }
      );
    }

    const category = await MaterialCategory.findOne({
      _id: new Types.ObjectId(id),
      isDeleted: false,
    }).populate("parentCategory", "name code");

    if (!category) {
      return NextResponse.json(
        { success: false, error: "Category not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: category });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}

/* =========================================================
 * PUT /api/material-categories/[id]
 * Update a material category
 * ======================================================= */
export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
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
      requirePermission(session as any, buildPermissionCode("material_categories", "edit"));
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: err.code === "FORBIDDEN" ? 403 : 401 });
    }

    const { id } = await context.params;

    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, error: "Invalid id" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { name, code, description, parentCategory, unit, isActive, businessScope, businessIds } = body;

    const category = await MaterialCategory.findOne({
      _id: new Types.ObjectId(id),
      isDeleted: false,
    });

    if (!category) {
      return NextResponse.json(
        { success: false, error: "Category not found" },
        { status: 404 }
      );
    }

    // Check duplicate name only if name is being changed
    if (name && name.trim() !== category.name) {
      const duplicate = await MaterialCategory.findOne({
        businessId: category.businessId,
        name: name.trim(),
        isDeleted: false,
        _id: { $ne: category._id },
      });
      if (duplicate) {
        return NextResponse.json(
          { success: false, error: "A category with this name already exists" },
          { status: 409 }
        );
      }
    }

    if (name !== undefined) category.name = name.trim();
    if (code !== undefined) category.code = code?.trim() || undefined;
    if (description !== undefined) category.description = description?.trim() || undefined;
    if (parentCategory !== undefined) {
      category.parentCategory = parentCategory
        ? new Types.ObjectId(parentCategory)
        : undefined;
    }
    if (unit !== undefined) category.unit = unit?.trim() || undefined;
    if (isActive !== undefined) category.isActive = isActive;
    if (businessScope !== undefined) category.businessScope = businessScope;
    if (businessIds !== undefined) category.businessIds = businessIds;

    await category.save();

    logAction({
      action: "UPDATE",
      entity: "MaterialCategory",
      entityId: id,
      after: category,
      req,
    });

    return NextResponse.json({ success: true, data: category });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}

/* =========================================================
 * DELETE /api/material-categories/[id]
 * Soft-delete a material category
 * ======================================================= */
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
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
      requirePermission(session as any, buildPermissionCode("material_categories", "delete"));
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: err.code === "FORBIDDEN" ? 403 : 401 });
    }

    const { id } = await context.params;

    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, error: "Invalid id" },
        { status: 400 }
      );
    }

    const category = await MaterialCategory.findOne({
      _id: new Types.ObjectId(id),
      isDeleted: false,
    });

    if (!category) {
      return NextResponse.json(
        { success: false, error: "Category not found" },
        { status: 404 }
      );
    }

    category.isDeleted = true;
    await category.save();

    logAction({
      action: "DELETE",
      entity: "MaterialCategory",
      entityId: id,
      req,
    });

    return NextResponse.json({ success: true, message: "Category deleted successfully" });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
