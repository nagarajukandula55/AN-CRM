/**
 * GET /api/admin/page-column-config
 * Returns every registered PageColumnConfig doc — used to populate the
 * page-picker dropdown on the super-admin Page Columns screen. The list is
 * expected to stay small (one row per wired vendor list page), so full docs
 * are returned rather than a trimmed summary.
 */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import PageColumnConfig from "@/models/PageColumnConfig";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";

function permissionErrorResponse(err: any) {
  return NextResponse.json(
    { success: false, error: err.message },
    { status: err.code === "FORBIDDEN" ? 403 : 401 }
  );
}

export async function GET() {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("platform", "manage_page_columns"));
    } catch (err: any) {
      return permissionErrorResponse(err);
    }

    await connectDB();
    const configs = await PageColumnConfig.find({}).sort({ pageKey: 1 }).lean();

    return NextResponse.json({ success: true, configs });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
