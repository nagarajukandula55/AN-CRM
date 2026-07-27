import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import { Types } from "mongoose";
import ProductCategory from "@/models/ProductCategory";
import { logAction } from "@/lib/audit/logAction";

// GET /api/product-categories/[id]
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const h = await headers();
    const userId = h.get("x-user-id");
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    await connectDB();

    const category = await ProductCategory.findOne({ _id: id, isDeleted: false })
      .populate("parentId", "name")
      .lean();

    if (!category) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, category });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// PUT /api/product-categories/[id]
export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const h = await headers();
    const userId = h.get("x-user-id");
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const body = await req.json();
    const { name, description, parentId, imageUrl, isActive, businessScope, businessIds } = body;

    await connectDB();

    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name.trim();
    if (description !== undefined) updates.description = description?.trim() || undefined;
    if (parentId !== undefined) updates.parentId = parentId ? new Types.ObjectId(parentId) : null;
    if (imageUrl !== undefined) updates.imageUrl = imageUrl?.trim() || undefined;
    if (isActive !== undefined) updates.isActive = isActive;
    if (businessScope !== undefined) updates.businessScope = businessScope;
    if (businessIds !== undefined) updates.businessIds = businessIds;

    // Prevent setting parent to self
    if (parentId && parentId === id) {
      return NextResponse.json(
        { success: false, error: "A category cannot be its own parent" },
        { status: 400 }
      );
    }

    const category = await ProductCategory.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    )
      .populate("parentId", "name")
      .lean();

    if (!category) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }

    logAction({
      action: "UPDATE",
      entity: "ProductCategory",
      entityId: id,
      after: category,
      req,
      actor: { id: userId },
    });

    return NextResponse.json({ success: true, category });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("duplicate key") || message.includes("E11000")) {
      return NextResponse.json(
        { success: false, error: "A category with this name already exists" },
        { status: 409 }
      );
    }
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// DELETE /api/product-categories/[id]
export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const h = await headers();
    const userId = h.get("x-user-id");
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    await connectDB();

    // Soft-delete
    const category = await ProductCategory.findByIdAndUpdate(
      id,
      { $set: { isDeleted: true, isActive: false } },
      { new: true }
    ).lean();

    if (!category) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }

    // Unlink children whose parent is this category
    await ProductCategory.updateMany(
      { parentId: new Types.ObjectId(id) },
      { $set: { parentId: null } }
    );

    logAction({
      action: "DELETE",
      entity: "ProductCategory",
      entityId: id,
      before: category,
      req: _req,
      actor: { id: userId },
    });

    return NextResponse.json({ success: true, message: "Category deleted" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
