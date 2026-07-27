import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Types } from "mongoose";
import DesignComponent, { DESIGN_COMPONENT_CATEGORIES } from "@/models/DesignComponent";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";

// Design Studio has no dedicated permission module of its own — it reuses
// the existing "assets" module's view/create actions (same as the upload
// endpoint it's built on top of) rather than inventing a new permission
// module for what is, functionally, just another kind of asset record.

// GET /api/design/components?businessId=...&category=...&search=...
export async function GET(req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("assets", "view"));
    } catch (err: any) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.code === "FORBIDDEN" ? 403 : 401 });
    }

    const { searchParams } = new URL(req.url);
    const businessId = searchParams.get("businessId");
    const category = searchParams.get("category");
    const search = searchParams.get("search");
    const includeInactive = searchParams.get("includeInactive") === "true";

    if (!businessId) {
      return NextResponse.json({ success: false, error: "businessId is required" }, { status: 400 });
    }

    await connectDB();

    const query: Record<string, unknown> = { businessId: new Types.ObjectId(businessId) };
    if (!includeInactive) query.isActive = true;
    if (category && (DESIGN_COMPONENT_CATEGORIES as string[]).includes(category)) {
      query.category = category;
    }
    if (search) {
      query.name = { $regex: search, $options: "i" };
    }

    const components = await DesignComponent.find(query)
      .populate("assetId", "fileUrl thumbnailUrl fileType")
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({ success: true, components });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// POST /api/design/components
export async function POST(req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("assets", "create"));
    } catch (err: any) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.code === "FORBIDDEN" ? 403 : 401 });
    }

    const body = await req.json();
    const { businessId, name, category, assetId, sourceAssetId, width, height, tags } = body;

    if (!businessId || !name || !assetId) {
      return NextResponse.json(
        { success: false, error: "businessId, name and assetId are required" },
        { status: 400 }
      );
    }

    await connectDB();

    const component = await DesignComponent.create({
      businessId: new Types.ObjectId(businessId),
      name: String(name).trim(),
      category: (DESIGN_COMPONENT_CATEGORIES as string[]).includes(category) ? category : "OTHER",
      assetId: new Types.ObjectId(assetId),
      sourceAssetId: sourceAssetId ? new Types.ObjectId(sourceAssetId) : null,
      width: typeof width === "number" ? width : undefined,
      height: typeof height === "number" ? height : undefined,
      tags: Array.isArray(tags) ? tags : [],
    });

    return NextResponse.json({ success: true, component }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
