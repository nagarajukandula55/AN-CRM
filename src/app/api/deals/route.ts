import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Types } from "mongoose";
import Deal, { DEAL_STAGES } from "@/models/Deal";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";
import { logAction } from "@/lib/audit/logAction";
import { resolveAuthorizedBusinessId } from "@/lib/auth/resolveAuthorizedBusinessId";

function permissionErrorResponse(err: any) {
  return NextResponse.json(
    { success: false, error: err.message },
    { status: err.code === "FORBIDDEN" ? 403 : 401 }
  );
}

// GET /api/deals?businessId=...&search=...&stage=...
export async function GET(req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("deals", "view"));
    } catch (err: any) {
      return permissionErrorResponse(err);
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search");
    const stage = searchParams.get("stage");

    await connectDB();

    // SECURITY: businessId was trusted straight from the query param with
    // no ownership check -- see customers/route.ts's matching fix.
    const businessId = await resolveAuthorizedBusinessId(
      session.user.id,
      searchParams.get("businessId"),
      session.isSuperAdmin,
      session.business?.businessId || null
    );
    const query: Record<string, unknown> = {};
    if (businessId && Types.ObjectId.isValid(businessId)) {
      query.businessId = new Types.ObjectId(businessId);
    }
    if (stage && (DEAL_STAGES as readonly string[]).includes(stage)) {
      query.stage = stage;
    }
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { companyName: { $regex: search, $options: "i" } },
      ];
    }

    const deals = await Deal.find(query)
      .populate("customerId", "name phone email")
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();

    return NextResponse.json({ success: true, deals, total: deals.length });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// POST /api/deals
export async function POST(req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("deals", "create"));
    } catch (err: any) {
      return permissionErrorResponse(err);
    }

    const body = await req.json();
    const { title, customerId, companyName, value, currency, stage, probability, expectedCloseDate, source, notes } = body;

    if (!title?.trim()) {
      return NextResponse.json({ success: false, error: "title is required" }, { status: 400 });
    }

    await connectDB();

    const businessId = await resolveAuthorizedBusinessId(
      session.user.id,
      body.businessId,
      session.isSuperAdmin,
      session.business?.businessId || null
    );

    const deal = await Deal.create({
      businessId: businessId && Types.ObjectId.isValid(businessId) ? new Types.ObjectId(businessId) : null,
      title: title.trim(),
      customerId: customerId && Types.ObjectId.isValid(customerId) ? new Types.ObjectId(customerId) : null,
      companyName: companyName?.trim(),
      value: Number(value) || 0,
      currency: currency?.trim() || "INR",
      stage: (DEAL_STAGES as readonly string[]).includes(stage) ? stage : "NEW",
      probability: probability !== undefined ? Number(probability) : 20,
      expectedCloseDate: expectedCloseDate ? new Date(expectedCloseDate) : null,
      ownerId: session.user.id && Types.ObjectId.isValid(session.user.id) ? new Types.ObjectId(session.user.id) : null,
      source: source?.trim(),
      notes: notes?.trim(),
    });

    logAction({
      action: "CREATE",
      entity: "Deal",
      entityId: deal?._id?.toString(),
      after: body,
      req,
      actor: { id: session.user.id },
    });

    return NextResponse.json({ success: true, deal }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
