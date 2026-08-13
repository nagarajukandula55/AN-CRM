/**
 * GET /api/admin/page-column-config/[pageKey] — returns the saved override
 *     for one page, or 404 if none has ever been saved. This route never
 *     invents a default column set -- the CONSUMING vendor page always
 *     supplies its own hardcoded defaults as a fallback (via
 *     useColumnConfig), this is only what's been overridden from that.
 * PUT /api/admin/page-column-config/[pageKey] — upserts the full `columns`
 *     array for a page. Super-admin only.
 */
import { NextRequest, NextResponse } from "next/server";
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

export async function GET(req: NextRequest, { params }: { params: Promise<{ pageKey: string }> }) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { pageKey } = await params;
    await connectDB();
    const config = await PageColumnConfig.findOne({ pageKey }).lean();
    if (!config) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, config });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ pageKey: string }> }) {
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

    const { pageKey } = await params;
    const body = await req.json();
    const { columns } = body as { columns: Array<{ key: string; defaultLabel: string; label: string; visible: boolean; order: number }> };
    if (!Array.isArray(columns)) {
      return NextResponse.json({ success: false, error: "columns[] is required" }, { status: 400 });
    }

    await connectDB();
    const config = await PageColumnConfig.findOneAndUpdate(
      { pageKey },
      { $set: { columns } },
      { new: true, upsert: true, runValidators: true }
    );

    return NextResponse.json({ success: true, config });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
