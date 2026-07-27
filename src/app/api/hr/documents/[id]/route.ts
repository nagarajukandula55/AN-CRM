import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import HrDocument from "@/models/HrDocument";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";
import { logAction } from "@/lib/audit/logAction";

export async function DELETE(req: NextRequest, context: any) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("hr_documents", "delete"));
    } catch (err: any) {
      return NextResponse.json({ success: false, message: err.message }, { status: err.code === "FORBIDDEN" ? 403 : 401 });
    }

    await connectDB();
    const id = context?.params?.id;

    const result = await HrDocument.deleteOne({ _id: id });
    if (result.deletedCount === 0) {
      return NextResponse.json({ success: false, message: "Document not found" }, { status: 404 });
    }

    logAction({
      action: "DELETE",
      entity: "HrDocument",
      entityId: id,
      req,
      actor: { id: session.user.id },
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err?.message || "Failed to delete document" },
      { status: 500 }
    );
  }
}
