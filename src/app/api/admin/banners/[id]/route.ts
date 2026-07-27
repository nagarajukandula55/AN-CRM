import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import { Types } from "mongoose";
import Banner from "@/models/Banner";
import { logAction } from "@/lib/audit/logAction";
import { requirePermission } from "@/lib/auth/permissions";
import { buildPermissionCode } from "@/core/access/actions";
import { getEnrichedSession } from "@/lib/auth/session-enriched";

const EDITABLE_FIELDS = [
  "imageUrl",
  "heading",
  "subheading",
  "ctaText",
  "ctaLink",
  "sortOrder",
  "isActive",
] as const;

// PATCH /api/admin/banners/[id] — edit fields, reorder (sortOrder), or
// toggle isActive.
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    requirePermission(session as any, buildPermissionCode("banners", "edit"));

    const h = await headers();
    const userId = h.get("x-user-id");

    const { id } = await context.params;
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
    }

    const body = await req.json();
    const updates: Record<string, unknown> = {};
    for (const field of EDITABLE_FIELDS) {
      if (body[field] !== undefined) updates[field] = body[field];
    }

    await connectDB();

    const before = await Banner.findById(id).lean();
    if (!before) {
      return NextResponse.json({ success: false, error: "Banner not found" }, { status: 404 });
    }

    const banner = await Banner.findByIdAndUpdate(id, { $set: updates }, { new: true, runValidators: true }).lean();

    logAction({
      action: "UPDATE",
      entity: "Banner",
      entityId: id,
      before,
      after: banner,
      req,
      actor: { id: userId || undefined, businessId: (before as any).businessId?.toString() },
    });

    return NextResponse.json({ success: true, banner });
  } catch (error: any) {
    if (error?.code === "FORBIDDEN") {
      return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    }
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// DELETE /api/admin/banners/[id]
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    requirePermission(session as any, buildPermissionCode("banners", "delete"));

    const h = await headers();
    const userId = h.get("x-user-id");

    const { id } = await context.params;
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
    }

    await connectDB();

    const banner = await Banner.findByIdAndDelete(id).lean();
    if (!banner) {
      return NextResponse.json({ success: false, error: "Banner not found" }, { status: 404 });
    }

    logAction({
      action: "DELETE",
      entity: "Banner",
      entityId: id,
      before: banner,
      req,
      actor: { id: userId || undefined, businessId: (banner as any).businessId?.toString() },
    });

    return NextResponse.json({ success: true, message: "Banner deleted" });
  } catch (error: any) {
    if (error?.code === "FORBIDDEN") {
      return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    }
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
