import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Asset from "@/models/Asset";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";

// DELETE /api/assets/[id] — used by the Design Studio asset library to
// remove uploaded source images/components. Only removes the Asset
// record (Cloudinary object itself is left in place, same conservative
// behavior as other delete endpoints in this codebase that don't reach
// out to third-party storage on delete).
export async function DELETE(req, { params }) {
  try {
    const { id } = await params;
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session, buildPermissionCode("assets", "delete"));
    } catch (err) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: err.code === "FORBIDDEN" ? 403 : 401 }
      );
    }

    await connectDB();
    const asset = await Asset.findByIdAndDelete(id);
    if (!asset) {
      return NextResponse.json({ success: false, error: "Asset not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
