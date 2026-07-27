import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import { Types } from "mongoose";
import Variant from "@/models/Variant";
import { logAction } from "@/lib/audit/logAction";
import { buildBusinessScopeQuery } from "@/core/catalog/businessScopeFilter";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";

// GET /api/variants?businessId=...&modelId=...&search=...&isActive=...
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
    const modelId = searchParams.get("modelId");
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

    if (modelId && Types.ObjectId.isValid(modelId)) {
      query.modelId = modelId;
    }

    if (search) {
      query.$and = [
        { $or: scopeQuery.$or },
        { name: { $regex: search, $options: "i" } },
      ];
      delete query.$or;
    }

    // Variant dropdown only reads _id/name -- keep modelId/isActive too
    // since callers filter/group on them.
    const variants = await Variant.find(query)
      .select("name modelId isActive")
      .sort({ name: 1 })
      .lean();

    return NextResponse.json({ success: true, variants });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// POST /api/variants
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
    const { name, modelId, businessId, businessScope, businessIds } = body;

    if (!name?.trim() || !modelId || !businessId) {
      return NextResponse.json({ error: "name, modelId and businessId are required" }, { status: 400 });
    }
    if (!Types.ObjectId.isValid(modelId)) {
      return NextResponse.json({ error: "Invalid modelId" }, { status: 400 });
    }

    await connectDB();

    const variant = await Variant.create({
      name: name.trim(),
      modelId: new Types.ObjectId(modelId),
      businessId: new Types.ObjectId(businessId),
      businessScope: businessScope || "SINGLE",
      businessIds: Array.isArray(businessIds) ? businessIds : [],
    });

    logAction({
      action: "CREATE",
      entity: "Variant",
      entityId: variant?._id?.toString(),
      after: body,
      req,
    });

    return NextResponse.json({ success: true, variant }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("duplicate key") || message.includes("E11000")) {
      return NextResponse.json({ success: false, error: "A variant with this name already exists for this model" }, { status: 409 });
    }
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
