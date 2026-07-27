import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import { Types } from "mongoose";
import GstFiling from "@/models/GstFiling";
import { queueFiling, listPendingFilings } from "@/core/gst/gstFilingService";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { logAction } from "@/lib/audit/logAction";

/* =========================================================
 * GET /api/gst/filings?businessId=&status=pending
 * List filings for a business. status=pending returns everything not yet
 * ACCEPTED (the "pendings" ANu is meant to help track/resolve).
 * =======================================================*/
export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    requirePermission(session as any, buildPermissionCode("gst", "view"));

    const { searchParams } = new URL(req.url);
    const businessId = searchParams.get("businessId");
    if (!businessId) {
      return NextResponse.json({ error: "businessId is required" }, { status: 400 });
    }

    if (searchParams.get("status") === "pending") {
      const data = await listPendingFilings(businessId);
      return NextResponse.json({ success: true, data });
    }

    const filings = await GstFiling.find({ businessId: new Types.ObjectId(businessId) })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    return NextResponse.json({ success: true, data: filings });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/* =========================================================
 * POST /api/gst/filings
 * Queue a filing for an invoice (status: PENDING). Does not push to the
 * portal yet — call POST /api/gst/filings/[id]/submit for that, so an
 * admin (or ANu on their behalf) can review before actually submitting.
 * Body: businessId, invoiceId, returnType, period
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
    const { businessId, invoiceId, returnType, period } = body;

    if (!businessId || !invoiceId || !returnType || !period) {
      return NextResponse.json(
        { error: "businessId, invoiceId, returnType, and period are required" },
        { status: 400 }
      );
    }

    const filing = await queueFiling({ businessId, invoiceId, returnType, period, submittedBy: userId });

    logAction({
      action: "CREATE",
      entity: "GstFiling",
      entityId: filing?._id?.toString(),
      after: filing,
      req,
    });

    return NextResponse.json({ success: true, data: filing }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
