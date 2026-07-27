import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Types } from "mongoose";
import Design from "@/models/Design";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";

// GET /api/design/designs/[id] — full design incl. canvasJson
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("assets", "view"));
    } catch (err: any) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.code === "FORBIDDEN" ? 403 : 401 });
    }

    await connectDB();
    const design = await Design.findById(id).populate("thumbnailAssetId", "fileUrl thumbnailUrl").lean();
    if (!design) {
      return NextResponse.json({ success: false, error: "Design not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, design });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// PUT /api/design/designs/[id] — update / re-save
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("assets", "edit"));
    } catch (err: any) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.code === "FORBIDDEN" ? 403 : 401 });
    }

    const body = await req.json();
    const update: Record<string, unknown> = {};
    if (typeof body.name === "string") update.name = body.name.trim();
    if (typeof body.isTemplate === "boolean") update.isTemplate = body.isTemplate;
    if (typeof body.canvasWidth === "number") update.canvasWidth = body.canvasWidth;
    if (typeof body.canvasHeight === "number") update.canvasHeight = body.canvasHeight;
    if (body.canvasJson !== undefined) update.canvasJson = body.canvasJson;
    if (body.thumbnailAssetId !== undefined) {
      update.thumbnailAssetId = body.thumbnailAssetId ? new Types.ObjectId(body.thumbnailAssetId) : null;
    }
    if (typeof body.isActive === "boolean") update.isActive = body.isActive;

    await connectDB();
    const design = await Design.findByIdAndUpdate(id, update, { new: true });
    if (!design) {
      return NextResponse.json({ success: false, error: "Design not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, design });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// DELETE /api/design/designs/[id]
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("assets", "delete"));
    } catch (err: any) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.code === "FORBIDDEN" ? 403 : 401 });
    }

    await connectDB();
    const design = await Design.findByIdAndDelete(id);
    if (!design) {
      return NextResponse.json({ success: false, error: "Design not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
