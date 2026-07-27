import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Types } from "mongoose";
import Solution from "@/models/Solution";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";
import { logAction } from "@/lib/audit/logAction";
import { buildBusinessScopeQuery } from "@/core/catalog/businessScopeFilter";

function permissionErrorResponse(err: any) {
  return NextResponse.json(
    { success: false, error: err.message },
    { status: err.code === "FORBIDDEN" ? 403 : 401 }
  );
}

// GET /api/solutions?businessId=...&search=...&isActive=...
export async function GET(req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("solutions", "view"));
    } catch (err: any) {
      return permissionErrorResponse(err);
    }

    const { searchParams } = new URL(req.url);
    const businessId = searchParams.get("businessId");
    const search = searchParams.get("search");
    const isActive = searchParams.get("isActive");

    await connectDB();

    const query: Record<string, unknown> = {};
    if (businessId && Types.ObjectId.isValid(businessId)) {
      query.$or = buildBusinessScopeQuery(businessId, { includeNullFallback: true }).$or;
    }
    if (isActive !== null) {
      query.isActive = isActive === "true";
    }
    if (search) {
      const searchOr = [
        { code: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { category: { $regex: search, $options: "i" } },
      ];
      query.$and = query.$or ? [{ $or: query.$or }, { $or: searchOr }] : undefined;
      if (!query.$and) query.$or = searchOr;
      else delete query.$or;
    }

    const solutions = await Solution.find(query).sort({ category: 1, code: 1 }).lean();

    return NextResponse.json({ success: true, solutions });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// POST /api/solutions
export async function POST(req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("solutions", "create"));
    } catch (err: any) {
      return permissionErrorResponse(err);
    }

    const body = await req.json();
    const { code, description, category, businessId, businessScope, businessIds } = body;

    if (!code?.trim() || !description?.trim()) {
      return NextResponse.json(
        { success: false, error: "code and description are required" },
        { status: 400 }
      );
    }

    await connectDB();

    const solution = await Solution.create({
      code: code.trim(),
      description: description.trim(),
      category: category?.trim(),
      businessId: businessId && Types.ObjectId.isValid(businessId) ? new Types.ObjectId(businessId) : null,
      businessScope: businessScope || "SINGLE",
      businessIds: Array.isArray(businessIds) ? businessIds : [],
    });

    logAction({
      action: "CREATE",
      entity: "Solution",
      entityId: solution?._id?.toString(),
      after: body,
      req,
    });

    return NextResponse.json({ success: true, solution }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("duplicate key") || message.includes("E11000")) {
      return NextResponse.json(
        { success: false, error: "A solution with this code already exists" },
        { status: 409 }
      );
    }
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
