/**
 * GET  /api/symptom-codes?businessId=...&search=...&isActive=...
 * POST /api/symptom-codes
 *
 * Same shape as /api/fault-codes -- a separate master list for the repair
 * flow's "Symptom" field, distinct from Fault Code. Auto-seeds
 * DEFAULT_SYMPTOM_CODES (global, businessId=null) the first time this is
 * called and no symptom codes exist at all yet.
 */

import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Types } from "mongoose";
import SymptomCode, { DEFAULT_SYMPTOM_CODES } from "@/models/SymptomCode";
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
  const count = await SymptomCode.countDocuments({});
  if (count === 0) {
    await SymptomCode.insertMany(
      DEFAULT_SYMPTOM_CODES.map((s) => ({ ...s, businessId: null, isActive: true }))
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

    const symptomCodes = await SymptomCode.find(query).sort({ category: 1, code: 1 }).lean();

    return NextResponse.json({ success: true, symptomCodes });
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

    const symptomCode = await SymptomCode.create({
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
      entity: "SymptomCode",
      entityId: symptomCode?._id?.toString(),
      after: body,
      req,
    });

    return NextResponse.json({ success: true, symptomCode }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("duplicate key") || message.includes("E11000")) {
      return NextResponse.json(
        { success: false, error: "A symptom code with this code already exists" },
        { status: 409 }
      );
    }
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
