import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { submitFiling } from "@/core/gst/gstFilingService";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { logAction } from "@/lib/audit/logAction";

/* =========================================================
 * POST /api/gst/filings/[id]/submit
 * Actually push a queued/failed filing to the GST portal via the adapter
 * (core/gst/gstPortalAdapter.ts — currently a stub pending real GSP/ASP
 * credentials, see that file's top comment).
 * =======================================================*/
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    requirePermission(session as any, buildPermissionCode("gst", "approve"));

    const { id } = await context.params;
    const filing = await submitFiling(id);

    logAction({
      action: "SUBMIT",
      entity: "GstFiling",
      entityId: id,
      after: filing,
      req,
    });

    return NextResponse.json({ success: true, data: filing });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
