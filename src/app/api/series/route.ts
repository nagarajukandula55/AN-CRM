import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import { Types } from "mongoose";
import Series from "@/models/Series";
import { logAction } from "@/lib/audit/logAction";
import { buildBusinessScopeQuery } from "@/core/catalog/businessScopeFilter";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";

// GET /api/series?businessId=...&brandId=...&search=...&isActive=...
export async function GET(req: NextRequest) {
  try {
    const h = await headers();
    const userId = h.get("x-user-id");
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const session = await getEnrichedSession();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try {
      requirePermission(session as any, buildPermissionCode("device_models", "view"));
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: err.code === "FORBIDDEN" ? 403 : 401 });
    }

    const { searchParams } = new URL(req.url);
    const businessId = searchParams.get("businessId");
    const brandId = searchParams.get("brandId");
    const search = searchParams.get("search");
    const isActive = searchParams.get("isActive");
    const includeInactive = searchParams.get("includeInactive") === "true";

    if (!businessId) {
      return NextResponse.json({ error: "businessId is required" }, { status: 400 });
    }

    await connectDB();

    const scopeQuery = buildBusinessScopeQuery(businessId);
    const query: Record<string, unknown> = { ...scopeQuery };

    if (isActive !== null) {
      query.isActive = isActive === "true";
    } else if (!includeInactive) {
      query.isActive = true;
    }

    if (brandId && Types.ObjectId.isValid(brandId)) {
      query.brandId = brandId;
    }

    if (search) {
      query.$and = [
        { $or: scopeQuery.$or },
        { name: { $regex: search, $options: "i" } },
      ];
      delete query.$or;
    }

    // The Series dropdown only reads _id/name -- keep brandId/isActive too
    // since the masters UI may show/filter on them.
    const series = await Series.find(query)
      .select("name brandId isActive")
      .sort({ name: 1 })
      .lean();

    return NextResponse.json({ success: true, series });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// POST /api/series
export async function POST(req: NextRequest) {
  try {
    const h = await headers();
    const userId = h.get("x-user-id");
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const session = await getEnrichedSession();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try {
      requirePermission(session as any, buildPermissionCode("device_models", "create"));
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: err.code === "FORBIDDEN" ? 403 : 401 });
    }

    const body = await req.json();
    const { name, brandId, businessId, businessScope, businessIds } = body;

    if (!name?.trim() || !brandId || !businessId) {
      return NextResponse.json({ error: "name, brandId and businessId are required" }, { status: 400 });
    }
    if (!Types.ObjectId.isValid(brandId)) {
      return NextResponse.json({ error: "Invalid brandId" }, { status: 400 });
    }

    await connectDB();

    const series = await Series.create({
      name: name.trim(),
      brandId: new Types.ObjectId(brandId),
      businessId: new Types.ObjectId(businessId),
      businessScope: businessScope || "SINGLE",
      businessIds: Array.isArray(businessIds) ? businessIds : [],
    });

    logAction({
      action: "CREATE",
      entity: "Series",
      entityId: series?._id?.toString(),
      after: body,
      req,
    });

    return NextResponse.json({ success: true, series }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("duplicate key") || message.includes("E11000")) {
      return NextResponse.json({ success: false, error: "A series with this name already exists for this brand" }, { status: 409 });
    }
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
