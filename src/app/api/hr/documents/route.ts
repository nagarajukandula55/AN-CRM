/**
 * HR Documents API — backs src/app/admin/hr/documents/page.tsx, which
 * previously called these routes with no matching backend at all (same
 * gap pattern found and fixed for /admin/notifications).
 * GET  /api/hr/documents?businessId=
 * POST /api/hr/documents
 */
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import HrDocument from "@/models/HrDocument";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { logAction } from "@/lib/audit/logAction";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";

export async function GET(req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("hr_documents", "view"));
    } catch (err: any) {
      return NextResponse.json({ success: false, message: err.message }, { status: err.code === "FORBIDDEN" ? 403 : 401 });
    }

    await connectDB();
    const { searchParams } = new URL(req.url);
    const businessId = searchParams.get("businessId");
    if (!businessId) {
      return NextResponse.json({ success: false, message: "businessId is required" }, { status: 400 });
    }

    const documents = await HrDocument.find({ businessId }).sort({ uploadedAt: -1 }).lean();
    return NextResponse.json({ success: true, documents });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err?.message || "Failed to load documents" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("hr_documents", "create"));
    } catch (err: any) {
      return NextResponse.json({ success: false, message: err.message }, { status: err.code === "FORBIDDEN" ? 403 : 401 });
    }

    await connectDB();
    const body = await req.json();
    const { businessId, name, type, employeeName, fileUrl, fileSize, expiresAt } = body;

    if (!businessId || !name || !employeeName) {
      return NextResponse.json(
        { success: false, message: "businessId, name and employeeName are required" },
        { status: 400 }
      );
    }

    const document = await HrDocument.create({
      businessId,
      name,
      type: type || "Other",
      employeeName,
      fileUrl,
      fileSize,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
    });

    logAction({
      action: "CREATE",
      entity: "HrDocument",
      entityId: document._id?.toString(),
      after: document,
      req,
      actor: { id: session.user.id, businessId },
    });

    return NextResponse.json({ success: true, document }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err?.message || "Failed to create document" },
      { status: 500 }
    );
  }
}
