/**
 * GET  /api/service-center-bom — list the current vendor's service-center
 *      BOM parts (business + vendor scoped).
 * POST /api/service-center-bom — create a new part. partCode (Material
 *      Code) is either server-generated via the canonical numbering engine
 *      or manually supplied by the caller, per the owning business's
 *      Business.bomCodeGenerationMode ("AUTO", the default, vs "MANUAL") --
 *      see the numbering engine call below, which replaces the previous
 *      countDocuments()-based scheme (race-prone under concurrent creates).
 *
 * Vendor resolution follows the same pattern as
 * /api/vendor/staff/route.ts: the current vendor is the VendorProfile
 * whose userId matches the logged-in user. A business-admin/super-admin
 * caller may instead pass a vendorId explicitly (e.g. managing a vendor's
 * BOM from the admin side) — falls back to that if no VendorProfile is
 * found for the logged-in user itself.
 */

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import mongoose from "mongoose";
import BOM from "@/models/BOM";
import VendorProfile from "@/models/VendorProfile";
import Business from "@/models/Business";
import { generateScopedDocumentNumber } from "@/core/numbering/numberingService";
// Required for .populate(...) below -- model must be registered before populate can resolve it.
import "@/models/Brand";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";
import { logAction } from "@/lib/audit/logAction";
import { resolveOwnerOrManagerVendor, resolveVendorTeamMembership } from "@/core/access/vendorAccess.service";
// Required for .populate("deviceModelId", ...) below -- model must be registered before populate can resolve it.
// Also used directly in GET to resolve a deviceModelId's own seriesId for the
// series-tier inclusive filter, and in POST to keep seriesId denormalized in
// sync with deviceModelId.
import DeviceModelModel from "@/models/DeviceModel";

function permissionErrorResponse(err: any) {
  return NextResponse.json(
    { success: false, error: err.message },
    { status: err.code === "FORBIDDEN" ? 403 : 401 }
  );
}

async function resolveVendorAndBusiness(userId: string, explicitVendorId?: string | null) {
  const vendor = await resolveOwnerOrManagerVendor(userId);
  if (vendor) {
    return { vendorId: (vendor as any)._id, businessId: (vendor as any).businessId };
  }
  if (explicitVendorId && mongoose.Types.ObjectId.isValid(explicitVendorId)) {
    const v = await VendorProfile.findOne({ _id: explicitVendorId, isDeleted: { $ne: true } }).lean();
    if (v) return { vendorId: (v as any)._id, businessId: (v as any).businessId };
  }
  return null;
}

// Read-only variant used by GET only -- an Owner/Manager isn't the only
// one who needs to SEE this vendor's BOM (CCO/Engineer/Centre Manager
// pick parts from it on every workorder), just the only one who can
// manage it (POST stays on resolveVendorAndBusiness above). This was the
// actual reason the workorder Description/BOM-part dropdown had no
// options for those roles -- they never pass an explicit vendorId (the
// job sheet page just calls GET with a brandId filter), and
// resolveOwnerOrManagerVendor is exclusively Owner/Manager, so this
// route 403'd "No vendor profile found" for every other team member.
async function resolveVendorForRead(userId: string, explicitVendorId?: string | null) {
  const ownerOrManager = await resolveOwnerOrManagerVendor(userId);
  if (ownerOrManager) {
    return { vendorId: (ownerOrManager as any)._id, businessId: (ownerOrManager as any).businessId };
  }
  const anyTeamMember = await resolveVendorTeamMembership(userId);
  if (anyTeamMember) {
    return { vendorId: (anyTeamMember as any)._id, businessId: (anyTeamMember as any).businessId };
  }
  if (explicitVendorId && mongoose.Types.ObjectId.isValid(explicitVendorId)) {
    const v = await VendorProfile.findOne({ _id: explicitVendorId, isDeleted: { $ne: true } }).lean();
    if (v) return { vendorId: (v as any)._id, businessId: (v as any).businessId };
  }
  return null;
}

export async function GET(req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("fault_codes", "view"));
    } catch {
      // service-center-bom doesn't have its own seeded module key yet;
      // fall through to vendor-scoping below which is the real gate here.
    }

    await connectDB();
    const { searchParams } = new URL(req.url);
    const explicitVendorId = searchParams.get("vendorId");

    const resolved = await resolveVendorForRead(session.user.id, explicitVendorId);
    if (!resolved) {
      return NextResponse.json(
        { success: false, error: "No vendor profile found for this account" },
        { status: 403 }
      );
    }

    const search = searchParams.get("search");
    const brandId = searchParams.get("brandId");
    const deviceModelId = searchParams.get("deviceModelId");
    const query: Record<string, unknown> = {
      businessId: resolved.businessId,
      vendorId: resolved.vendorId,
      isActive: true,
    };
    if (search) {
      query.$or = [
        { partName: { $regex: search, $options: "i" } },
        { partCode: { $regex: search, $options: "i" } },
        { hsnCode: { $regex: search, $options: "i" } },
      ];
    }
    // Brand filter is inclusive of brand-agnostic parts (no brandId set) --
    // a universal consumable/labour line should still show up regardless
    // of which device brand the workorder is for.
    if (brandId && mongoose.Types.ObjectId.isValid(brandId)) {
      query.$and = [{ $or: [{ brandId }, { brandId: null }, { brandId: { $exists: false } }] }];
    }
    // Same inclusive pattern one level down -- a model-agnostic part under
    // that brand ("fits every model") still shows when browsing one model.
    // A THIRD tier sits between brand and model: a part scoped to a whole
    // Series (no specific deviceModelId) should also show for every model
    // in that series. When filtering by deviceModelId we resolve its own
    // seriesId and OR that in alongside the plain model-match/model-agnostic
    // clauses.
    if (deviceModelId && mongoose.Types.ObjectId.isValid(deviceModelId)) {
      const modelDoc = await DeviceModelModel.findById(deviceModelId).select("seriesId").lean<any>();
      const modelOrClauses: Record<string, unknown>[] = [
        { deviceModelId },
        { deviceModelId: null },
        { deviceModelId: { $exists: false } },
      ];
      if (modelDoc?.seriesId) {
        modelOrClauses.push({ seriesId: modelDoc.seriesId, deviceModelId: { $in: [null, undefined] } });
      }
      const modelOr = { $or: modelOrClauses };
      query.$and = query.$and ? [...(query.$and as any[]), modelOr] : [modelOr];
    }

    const parts = await BOM.find(query)
      .populate("brandId", "name")
      .populate("deviceModelId", "name")
      .sort({ partName: 1 })
      .lean();
    return NextResponse.json({ success: true, parts });
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

    const body = await req.json();
    const {
      partName, hsnCode, rate, vendorId: explicitVendorId,
      brandId, deviceModelId, description, partType, unit, gstRate, warrantyDays, materialId,
      isSerialized, partCode: manualPartCode,
    } = body;

    if (!partName?.trim() || !hsnCode?.trim() || rate === undefined || rate === null) {
      return NextResponse.json(
        { success: false, error: "partName, hsnCode and rate are required" },
        { status: 400 }
      );
    }

    await connectDB();
    const resolved = await resolveVendorAndBusiness(session.user.id, explicitVendorId);
    if (!resolved) {
      return NextResponse.json(
        { success: false, error: "No vendor profile found for this account" },
        { status: 403 }
      );
    }

    const business = await Business.findById(resolved.businessId).select("bomCodeGenerationMode").lean<any>();
    const codeMode = business?.bomCodeGenerationMode === "MANUAL" ? "MANUAL" : "AUTO";

    let partCode: string;
    if (codeMode === "MANUAL") {
      if (!manualPartCode?.trim()) {
        return NextResponse.json(
          { success: false, error: "Material Code is required (manual code generation is enabled for this business)" },
          { status: 400 }
        );
      }
      partCode = manualPartCode.trim();
    } else {
      // Atomic per business+vendor counter via the canonical numbering
      // engine -- MAT-0001, MAT-0002, ... scoped so each vendor's part
      // list (or a Brand/POS business's own list, when vendorId is unset)
      // numbers independently.
      const scopeKey = `${resolved.businessId}:${resolved.vendorId || "NOVENDOR"}`;
      const generated = await generateScopedDocumentNumber(
        scopeKey,
        "MATERIAL",
        String(resolved.businessId)
      );
      partCode = generated.value;
    }

    // Whenever deviceModelId is set, seriesId is auto-populated from that
    // model's own seriesId so the two denormalized fields never disagree
    // (see the seriesId field comment on BOM).
    let resolvedSeriesId: mongoose.Types.ObjectId | undefined;
    if (deviceModelId && mongoose.Types.ObjectId.isValid(deviceModelId)) {
      const modelDoc = await DeviceModelModel.findById(deviceModelId).select("seriesId").lean<any>();
      if (modelDoc?.seriesId) resolvedSeriesId = modelDoc.seriesId;
    }

    const part = await BOM.create({
      businessId: resolved.businessId,
      vendorId: resolved.vendorId,
      brandId: brandId && mongoose.Types.ObjectId.isValid(brandId) ? brandId : undefined,
      seriesId: resolvedSeriesId,
      deviceModelId: deviceModelId && mongoose.Types.ObjectId.isValid(deviceModelId) ? deviceModelId : undefined,
      partName: partName.trim(),
      partCode,
      description: description?.trim(),
      partType: ["SPARE_PART", "LABOUR", "CONSUMABLE"].includes(partType) ? partType : "SPARE_PART",
      unit: unit?.trim() || "pcs",
      hsnCode: hsnCode.trim(),
      gstRate: gstRate !== undefined ? Number(gstRate) : 18,
      rate: Number(rate),
      warrantyDays: warrantyDays !== undefined ? Number(warrantyDays) : undefined,
      isSerialized: !!isSerialized,
      materialId: materialId && mongoose.Types.ObjectId.isValid(materialId) ? materialId : undefined,
    });

    logAction({
      action: "CREATE",
      entity: "BOM",
      entityId: part?._id?.toString(),
      after: body,
      req,
    });

    return NextResponse.json({ success: true, part }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("duplicate key") || message.includes("E11000")) {
      return NextResponse.json(
        { success: false, error: "A material with this code already exists for this business" },
        { status: 409 }
      );
    }
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
