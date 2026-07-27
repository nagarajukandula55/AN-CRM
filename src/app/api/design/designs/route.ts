import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Types } from "mongoose";
import Design from "@/models/Design";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";

// GET /api/design/designs?businessId=...&isTemplate=true|false
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
    const isTemplate = searchParams.get("isTemplate");

    if (!businessId) {
      return NextResponse.json({ success: false, error: "businessId is required" }, { status: 400 });
    }

    await connectDB();

    const query: Record<string, unknown> = {
      businessId: new Types.ObjectId(businessId),
      isActive: true,
    };
    if (isTemplate !== null) query.isTemplate = isTemplate === "true";

    // Full canvasJson is intentionally excluded here — the gallery only
    // needs name/thumbnail/dates, and canvasJson can be large; the editor
    // fetches it separately via GET /api/design/designs/[id].
    const designs = await Design.find(query)
      .select("name isTemplate canvasWidth canvasHeight thumbnailAssetId createdBy updatedAt createdAt")
      .populate("thumbnailAssetId", "fileUrl thumbnailUrl")
      .sort({ updatedAt: -1 })
      .lean();

    return NextResponse.json({ success: true, designs });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// POST /api/design/designs — save a new design
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
    const {
      businessId,
      name,
      isTemplate,
      canvasWidth,
      canvasHeight,
      canvasJson,
      thumbnailAssetId,
      businessScope,
      businessIds,
    } = body;

    if (!businessId || !name || !canvasWidth || !canvasHeight || !canvasJson) {
      return NextResponse.json(
        { success: false, error: "businessId, name, canvasWidth, canvasHeight and canvasJson are required" },
        { status: 400 }
      );
    }

    await connectDB();

    const design = await Design.create({
      businessId: new Types.ObjectId(businessId),
      name: String(name).trim(),
      isTemplate: !!isTemplate,
      canvasWidth,
      canvasHeight,
      canvasJson,
      thumbnailAssetId: thumbnailAssetId ? new Types.ObjectId(thumbnailAssetId) : null,
      createdBy: session.user.id ? new Types.ObjectId(session.user.id) : null,
      businessScope: businessScope || "SINGLE",
      businessIds: Array.isArray(businessIds) ? businessIds : [],
    });

    return NextResponse.json({ success: true, design }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
