import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Types } from "mongoose";
import Solution from "@/models/Solution";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { logAction } from "@/lib/audit/logAction";
import { buildBusinessScopeQuery } from "@/core/catalog/businessScopeFilter";
import { resolveOwnerOrManagerVendor, resolveVendorTeamMembership } from "@/core/access/vendorAccess.service";
import { requireSolutionsPermission } from "@/core/access/solutionsAccess";

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
      requireSolutionsPermission(session as any, "view");
    } catch (err: any) {
      return permissionErrorResponse(err);
    }

    const { searchParams } = new URL(req.url);
    const businessId = searchParams.get("businessId");
    const search = searchParams.get("search");
    const isActive = searchParams.get("isActive");

    await connectDB();

    const query: Record<string, unknown> = {};
    const andClauses: Record<string, unknown>[] = [];
    if (businessId && Types.ObjectId.isValid(businessId)) {
      andClauses.push({ $or: buildBusinessScopeQuery(businessId, { includeNullFallback: true }).$or });
    }
    if (isActive !== null) {
      query.isActive = isActive === "true";
    }
    // Vendor self-managed lists, strictly private to that vendor -- EXCEPT
    // a solution a Super Admin added with no vendorId at all, which is a
    // shared platform default every vendor should see (and can still add
    // their own on top of, normally) -- see fault-codes/route.ts's
    // matching comment for the private-list rationale. Was previously an
    // AND on vendorId===own, which excluded vendorId:null entirely, so a
    // Super-Admin-added default never showed up for any vendor. Super
    // admin ("god mode") still sees across every vendor unfiltered.
    const ownerOrManager = await resolveOwnerOrManagerVendor(session.user.id).catch(() => null);
    const teamMembership = ownerOrManager || (await resolveVendorTeamMembership(session.user.id).catch(() => null));
    if (teamMembership && !session.isSuperAdmin) {
      andClauses.push({ $or: [{ vendorId: (teamMembership as any)._id }, { vendorId: null }] });
    }
    if (search) {
      andClauses.push({
        $or: [
          { code: { $regex: search, $options: "i" } },
          { description: { $regex: search, $options: "i" } },
          { category: { $regex: search, $options: "i" } },
        ],
      });
    }
    if (andClauses.length > 0) {
      (query as any).$and = andClauses;
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
      requireSolutionsPermission(session as any, "create");
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

    const ownerOrManagerVendor = await resolveOwnerOrManagerVendor(session.user.id).catch(() => null);

    const solution = await Solution.create({
      code: code.trim(),
      description: description.trim(),
      category: category?.trim(),
      businessId: businessId && Types.ObjectId.isValid(businessId) ? new Types.ObjectId(businessId) : null,
      vendorId: ownerOrManagerVendor ? (ownerOrManagerVendor as any)._id : null,
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
