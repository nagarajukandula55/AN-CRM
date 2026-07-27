/**
 * GET  /api/fault-codes?businessId=...&search=...&isActive=...
 * POST /api/fault-codes
 *
 * Same permission-gating pattern as /api/brands: getEnrichedSession +
 * requirePermission(buildPermissionCode("fault_codes", action)). If
 * "fault_codes" isn't in the RBAC seed script, non-super-admin roles simply
 * won't have it granted yet -- requirePermission still lets super admins
 * through. Auto-seeds DEFAULT_FAULT_CODES (global, businessId=null) the
 * first time this is called and no fault codes exist at all yet, so the
 * Workorder-creation UI always has a usable starter list.
 */

import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Types } from "mongoose";
import FaultCode, { DEFAULT_FAULT_CODES } from "@/models/FaultCode";
import { buildBusinessScopeQuery } from "@/core/catalog/businessScopeFilter";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";
import { logAction } from "@/lib/audit/logAction";

function permissionErrorResponse(err: any) {
  return NextResponse.json(
    { success: false, error: err.message },
    { status: err.code === "FORBIDDEN" ? 403 : 401 }
  );
}

async function ensureSeeded() {
  const count = await FaultCode.countDocuments({});
  if (count === 0) {
    await FaultCode.insertMany(
      DEFAULT_FAULT_CODES.map((f) => ({ ...f, businessId: null, isActive: true }))
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("fault_codes", "view"));
    } catch (err: any) {
      return permissionErrorResponse(err);
    }

    const { searchParams } = new URL(req.url);
    const businessId = searchParams.get("businessId");
    const search = searchParams.get("search");
    const isActive = searchParams.get("isActive");
    const deviceCategory = searchParams.get("deviceCategory");

    await connectDB();
    await ensureSeeded();

    const query: Record<string, unknown> = {};
    if (businessId && Types.ObjectId.isValid(businessId)) {
      // Business-specific/shared/all-businesses codes + global (businessId:
      // null) fallback codes.
      query.$or = buildBusinessScopeQuery(businessId, { includeNullFallback: true }).$or;
    }
    if (isActive !== null) {
      query.isActive = isActive === "true";
    }
    if (deviceCategory) {
      query.deviceCategory = deviceCategory;
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

    const faultCodes = await FaultCode.find(query).sort({ category: 1, code: 1 }).lean();

    return NextResponse.json({ success: true, faultCodes });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("fault_codes", "create"));
    } catch (err: any) {
      return permissionErrorResponse(err);
    }

    const body = await req.json();
    const { code, description, category, deviceCategory, businessId, businessScope, businessIds, parentId } = body;

    if (!code?.trim() || !description?.trim()) {
      return NextResponse.json(
        { success: false, error: "code and description are required" },
        { status: 400 }
      );
    }

    await connectDB();

    const faultCode = await FaultCode.create({
      code: code.trim(),
      description: description.trim(),
      category: category?.trim(),
      deviceCategory: deviceCategory || null,
      businessId: businessId && Types.ObjectId.isValid(businessId) ? new Types.ObjectId(businessId) : null,
      businessScope: businessScope || "SINGLE",
      businessIds: Array.isArray(businessIds) ? businessIds : [],
      parentId: parentId && Types.ObjectId.isValid(parentId) ? new Types.ObjectId(parentId) : null,
    });

    logAction({
      action: "CREATE",
      entity: "FaultCode",
      entityId: faultCode?._id?.toString(),
      after: body,
      req,
    });

    return NextResponse.json({ success: true, faultCode }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("duplicate key") || message.includes("E11000")) {
      return NextResponse.json(
        { success: false, error: "A fault code with this code already exists" },
        { status: 409 }
      );
    }
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
