import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import { Types } from "mongoose";
import Brand from "@/models/Brand";
import { logAction } from "@/lib/audit/logAction";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";

// GET /api/brands/[id]
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const h = await headers();
    const userId = h.get("x-user-id");
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const session = await getEnrichedSession();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try {
      requirePermission(session as any, buildPermissionCode("brands", "view"));
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: err.code === "FORBIDDEN" ? 403 : 401 });
    }

    const { id } = await context.params;

    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid brand id" }, { status: 400 });
    }

    await connectDB();

    const brand = await Brand.findById(id).lean();

    if (!brand) {
      return NextResponse.json({ error: "Brand not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, brand });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// PUT /api/brands/[id]
export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const h = await headers();
    const userId = h.get("x-user-id");
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const session = await getEnrichedSession();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try {
      requirePermission(session as any, buildPermissionCode("brands", "edit"));
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: err.code === "FORBIDDEN" ? 403 : 401 });
    }

    const { id } = await context.params;

    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid brand id" }, { status: 400 });
    }

    const body = await req.json();
    const { name, description, logoUrl, isActive, businessScope, businessIds, parentId, category, productCategoryId } = body;

    await connectDB();

    // A brand can't be its own parent, and can't be moved under one of its
    // own descendants (would create a cycle) -- one level of check here
    // (self), same guard product-categories already relies on for the
    // common case; deep-cycle prevention beyond that isn't attempted, same
    // as the existing category pages.
    if (parentId && parentId === id) {
      return NextResponse.json({ error: "A brand cannot be its own parent" }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name.trim();
    if (description !== undefined) updates.description = description?.trim();
    if (logoUrl !== undefined) updates.logoUrl = logoUrl?.trim();
    if (isActive !== undefined) updates.isActive = isActive;
    if (businessScope !== undefined) updates.businessScope = businessScope;
    if (businessIds !== undefined) updates.businessIds = businessIds;
    if (parentId !== undefined) updates.parentId = parentId || null;
    if (category !== undefined) updates.category = category || null;
    if (productCategoryId !== undefined) updates.productCategoryId = productCategoryId || null;

    const brand = await Brand.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    ).lean();

    if (!brand) {
      return NextResponse.json({ error: "Brand not found" }, { status: 404 });
    }

    logAction({
      action: "UPDATE",
      entity: "Brand",
      entityId: id,
      after: updates,
      req,
    });

    return NextResponse.json({ success: true, brand });
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

// DELETE /api/brands/[id]
export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const h = await headers();
    const userId = h.get("x-user-id");
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const session = await getEnrichedSession();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try {
      requirePermission(session as any, buildPermissionCode("brands", "delete"));
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: err.code === "FORBIDDEN" ? 403 : 401 });
    }

    const { id } = await context.params;

    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid brand id" }, { status: 400 });
    }

    await connectDB();

    const brand = await Brand.findByIdAndDelete(id).lean();

    if (!brand) {
      return NextResponse.json({ error: "Brand not found" }, { status: 404 });
    }

    logAction({
      action: "DELETE",
      entity: "Brand",
      entityId: id,
      req: _req,
    });

    return NextResponse.json({ success: true, message: "Brand deleted" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
