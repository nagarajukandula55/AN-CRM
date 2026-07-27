import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import DesignComponent, { DESIGN_COMPONENT_CATEGORIES } from "@/models/DesignComponent";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";

// PUT /api/design/components/[id] — rename / retag / activate-deactivate
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
    if (body.category && (DESIGN_COMPONENT_CATEGORIES as string[]).includes(body.category)) update.category = body.category;
    if (Array.isArray(body.tags)) update.tags = body.tags;
    if (typeof body.isActive === "boolean") update.isActive = body.isActive;

    await connectDB();
    const component = await DesignComponent.findByIdAndUpdate(id, update, { new: true });
    if (!component) {
      return NextResponse.json({ success: false, error: "Component not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, component });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// DELETE /api/design/components/[id]
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
    const component = await DesignComponent.findByIdAndDelete(id);
    if (!component) {
      return NextResponse.json({ success: false, error: "Component not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
