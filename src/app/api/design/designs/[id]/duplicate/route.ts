import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Types } from "mongoose";
import Design from "@/models/Design";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";

// POST /api/design/designs/[id]/duplicate — clone a design (typically a
// shared template) into a private, editable copy. Always forces
// isTemplate:false on the clone so opening a template to "start from it"
// can never mutate the shared template itself.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("assets", "create"));
    } catch (err: any) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.code === "FORBIDDEN" ? 403 : 401 });
    }

    await connectDB();
    const source = await Design.findById(id).lean<any>();
    if (!source) {
      return NextResponse.json({ success: false, error: "Design not found" }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const businessId = body?.businessId || source.businessId;

    const clone = await Design.create({
      businessId: new Types.ObjectId(businessId),
      name: body?.name ? String(body.name).trim() : `${source.name} (Copy)`,
      isTemplate: false,
      canvasWidth: source.canvasWidth,
      canvasHeight: source.canvasHeight,
      canvasJson: source.canvasJson,
      thumbnailAssetId: source.thumbnailAssetId || null,
      createdBy: session.user.id ? new Types.ObjectId(session.user.id) : null,
      businessScope: "SINGLE",
      businessIds: [],
    });

    return NextResponse.json({ success: true, design: clone }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
