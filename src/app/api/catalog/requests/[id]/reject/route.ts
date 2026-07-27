import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/mongodb";
import CatalogChangeRequest from "@/models/CatalogChangeRequest";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { logAction } from "@/lib/audit/logAction";

// POST /api/catalog/requests/[id]/reject
// Same hardcoded session.isSuperAdmin gate as approve/route.ts -- see that
// file's top comment for why this is deliberately not a generic permission.
export async function POST(req: NextRequest, context: any) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    if (!session.isSuperAdmin) {
      return NextResponse.json(
        { success: false, message: "Only an AN Group Super Admin can reject a catalog change request." },
        { status: 403 }
      );
    }

    const { id } = await context.params;
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: "Invalid request id" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const reason = (body?.reason || "").trim();

    await connectDB();

    const request = await CatalogChangeRequest.findById(id);
    if (!request) {
      return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
    }
    if (request.status !== "PENDING") {
      return NextResponse.json({ success: false, message: "Only a pending request can be rejected" }, { status: 400 });
    }

    request.status = "REJECTED";
    request.rejectionReason = reason || undefined;
    request.reviewedBy = new Types.ObjectId(session.user.id) as any;
    request.reviewedAt = new Date();
    await request.save();

    logAction({
      action: "UPDATE",
      entity: "CatalogChangeRequest",
      entityId: id,
      after: { status: "REJECTED", rejectionReason: reason },
      req,
      actor: { id: session.user.id },
    });

    return NextResponse.json({ success: true, request });
  } catch (err: any) {
    console.error("Catalog request reject error:", err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
