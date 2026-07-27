import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import { pushInvoicesForRange } from "@/core/gst/gstFilingService";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { logAction } from "@/lib/audit/logAction";

/* =========================================================
 * POST /api/gst/push-range
 * "Push Invoices to GST" for a date range — queues + submits a GstFiling
 * for every SalesInvoice issued in [from, to] for this business. Backs
 * both the GST page's date-range push action and the Reports page's
 * "Push to GST" button.
 * Body: businessId, from (ISO date), to (ISO date), returnType, period
 * =======================================================*/
export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const h = await headers();
    const userId = h.get("x-user-id");
    const session = await getEnrichedSession();
    if (!session?.user || !userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    requirePermission(session as any, buildPermissionCode("gst", "create"));

    const body = await req.json();
    const { businessId, from, to, returnType, period } = body;

    if (!businessId || !from || !to || !returnType || !period) {
      return NextResponse.json(
        { error: "businessId, from, to, returnType, and period are required" },
        { status: 400 }
      );
    }

    const results = await pushInvoicesForRange({ businessId, from, to, returnType, period, submittedBy: userId });

    logAction({
      action: "CREATE",
      entity: "GstPushRange",
      entityId: businessId,
      after: { from, to, returnType, period, count: results.length },
      req,
    });

    const summary = {
      total: results.length,
      submitted: results.filter((r) => r.status === "SUBMITTED" || r.status === "ACCEPTED").length,
      failed: results.filter((r) => r.status === "FAILED").length,
    };

    return NextResponse.json({ success: true, summary, data: results });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
