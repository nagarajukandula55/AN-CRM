import { NextRequest, NextResponse } from "next/server";
import mongoose, { Types } from "mongoose";
import { connectDB } from "@/lib/mongodb";
import CatalogChangeRequest from "@/models/CatalogChangeRequest";
import Brand from "@/models/Brand";
import Series from "@/models/Series";
import DeviceModel from "@/models/DeviceModel";
import Variant from "@/models/Variant";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";
import { logAction } from "@/lib/audit/logAction";
import { sendTelegramMessage } from "@/lib/telegram";
import { notifySuperAdmins } from "@/services/notification.service";
import Business from "@/models/Business";
import { resolveAuthorizedBusinessId } from "@/lib/auth/resolveAuthorizedBusinessId";
// Required for .populate(...) below -- model must be registered before populate can resolve it.
import "@/models/User";
import "@/models/Business";

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function exactCI(name: string) {
  return new RegExp(`^${escapeRegex(name.trim())}$`, "i");
}

/**
 * GET /api/catalog/requests?businessId=...&status=...
 * POST /api/catalog/requests
 *
 * Backs the "Can't find it? Request to add" flow on the CRM call/jobsheet
 * creation forms -- a staff member proposes a new Brand/Series/DeviceModel/
 * Variant, which sits PENDING until a Super Admin approves/rejects it
 * (see [id]/approve and [id]/reject). Submitting is gated by a normal,
 * broadly-grantable CATALOG.CREATE permission -- approval deliberately is
 * NOT (see [id]/approve's top comment).
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("catalog", "create"));
    } catch (err: any) {
      return NextResponse.json({ success: false, message: err.message }, { status: err.code === "FORBIDDEN" ? 403 : 401 });
    }

    // SECURITY: businessId was required for a non-super-admin caller but
    // never actually VERIFIED against their real business -- any caller
    // holding the generic CATALOG.CREATE permission could pass another
    // business's id and read its pending catalog requests. Super Admin's
    // approval queue (admin/masters/catalog-requests) still sees every
    // business when businessId is omitted (unchanged); anyone else is
    // now locked to their own verified business regardless of what they
    // pass.
    const businessId = await resolveAuthorizedBusinessId(
      session.user.id,
      req.nextUrl.searchParams.get("businessId"),
      !!session.isSuperAdmin,
      session.business?.businessId || null
    );
    if (!businessId && !session.isSuperAdmin) {
      return NextResponse.json({ success: true, requests: [] });
    }
    const status = req.nextUrl.searchParams.get("status");

    await connectDB();

    const filter: any = {};
    if (businessId) filter.businessId = new Types.ObjectId(businessId);
    if (status && ["PENDING", "APPROVED", "REJECTED"].includes(status)) {
      filter.status = status;
    }

    const requests = await CatalogChangeRequest.find(filter)
      .sort({ createdAt: -1 })
      .populate("requestedBy", "name email")
      .populate("reviewedBy", "name email")
      .populate("businessId", "name")
      .populate("brandId", "name")
      .populate("seriesId", "name")
      .populate("modelId", "name")
      .lean();

    return NextResponse.json({ success: true, requests });
  } catch (err: any) {
    console.error("Catalog requests GET error:", err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("catalog", "create"));
    } catch (err: any) {
      return NextResponse.json({ success: false, message: err.message }, { status: err.code === "FORBIDDEN" ? 403 : 401 });
    }

    const body = await req.json();
    const { kind, name, category, brandId, seriesId, modelId } = body;
    // SECURITY: same ownership check as GET above -- otherwise any caller
    // with CATALOG.CREATE could submit (or, for an SC business, instantly
    // self-approve-create) a catalog entry under any business's id.
    const businessId = await resolveAuthorizedBusinessId(
      session.user.id,
      body.businessId,
      !!session.isSuperAdmin,
      session.business?.businessId || null
    );

    if (!businessId || !Types.ObjectId.isValid(businessId)) {
      return NextResponse.json({ success: false, message: "businessId is required" }, { status: 400 });
    }
    if (!["BRAND", "SERIES", "MODEL", "VARIANT"].includes(kind)) {
      return NextResponse.json({ success: false, message: "Invalid kind" }, { status: 400 });
    }
    if (!name?.trim()) {
      return NextResponse.json({ success: false, message: "name is required" }, { status: 400 });
    }

    if (kind === "BRAND" && !category) {
      return NextResponse.json({ success: false, message: "category is required to request a new Brand" }, { status: 400 });
    }
    if ((kind === "SERIES" || kind === "MODEL") && (!brandId || !Types.ObjectId.isValid(brandId))) {
      return NextResponse.json({ success: false, message: "brandId is required to request a new " + (kind === "SERIES" ? "Series" : "Model") }, { status: 400 });
    }
    if (kind === "VARIANT" && (!modelId || !Types.ObjectId.isValid(modelId))) {
      return NextResponse.json({ success: false, message: "modelId is required to request a new Variant" }, { status: 400 });
    }
    if (seriesId && !Types.ObjectId.isValid(seriesId)) {
      return NextResponse.json({ success: false, message: "Invalid seriesId" }, { status: 400 });
    }

    await connectDB();

    const bizObjectId = new Types.ObjectId(businessId);
    const trimmedName = name.trim();
    const nameRegex = exactCI(trimmedName);

    // (a) Already exists as a real catalog entity in this exact scope.
    let existingEntity: any = null;
    if (kind === "BRAND") {
      existingEntity = await Brand.findOne({ businessId: bizObjectId, category, name: nameRegex }).lean();
    } else if (kind === "SERIES") {
      existingEntity = await Series.findOne({ businessId: bizObjectId, brandId, name: nameRegex }).lean();
    } else if (kind === "MODEL") {
      existingEntity = await DeviceModel.findOne({ businessId: bizObjectId, brandId, name: nameRegex }).lean();
    } else if (kind === "VARIANT") {
      existingEntity = await Variant.findOne({ businessId: bizObjectId, modelId, name: nameRegex }).lean();
    }
    if (existingEntity) {
      return NextResponse.json(
        { success: false, message: `"${trimmedName}" already exists in the catalog — it doesn't need a request.` },
        { status: 409 }
      );
    }

    // (b) Already requested and still pending in this exact scope.
    const pendingFilter: any = { businessId: bizObjectId, kind, status: "PENDING", name: nameRegex };
    if (kind === "BRAND") pendingFilter.category = category;
    if (kind === "SERIES" || kind === "MODEL") pendingFilter.brandId = brandId;
    if (kind === "VARIANT") pendingFilter.modelId = modelId;
    const existingRequest = await CatalogChangeRequest.findOne(pendingFilter).lean();
    if (existingRequest) {
      return NextResponse.json(
        { success: false, message: `"${trimmedName}" has already been requested and is awaiting approval.` },
        { status: 409 }
      );
    }

    // SC businesses self-manage their own catalog additions -- no approval
    // queue, per explicit direction ("for SC we are allowing partner
    // maintain their own data ... no approval or no other processes"),
    // same self-service posture as FaultCode/SymptomCode/Solution already
    // have for a vendor's own list. Only SC skips the queue: Brand's
    // catalog is the shared, verified one (per the same direction), and
    // POS has no device/workorder catalog use for this at all.
    const business = await Business.findById(bizObjectId).select("operatingMode").lean();
    const selfManage = (business as any)?.operatingMode === "SC";

    let resultEntity: any = null;
    if (selfManage) {
      const entityData = { businessId: bizObjectId, businessScope: "SINGLE" as const };
      if (kind === "BRAND") {
        resultEntity = await Brand.create({ ...entityData, name: trimmedName, category });
      } else if (kind === "SERIES") {
        resultEntity = await Series.create({ ...entityData, name: trimmedName, brandId: new Types.ObjectId(brandId) });
      } else if (kind === "MODEL") {
        resultEntity = await DeviceModel.create({
          ...entityData,
          name: trimmedName,
          brandId: new Types.ObjectId(brandId),
          seriesId: seriesId ? new Types.ObjectId(seriesId) : null,
        });
      } else if (kind === "VARIANT") {
        resultEntity = await Variant.create({ ...entityData, name: trimmedName, modelId: new Types.ObjectId(modelId) });
      }
    }

    const request = await CatalogChangeRequest.create({
      businessId: bizObjectId,
      requestedBy: new Types.ObjectId(session.user.id),
      kind,
      name: trimmedName,
      category: kind === "BRAND" ? category : undefined,
      brandId: kind === "SERIES" || kind === "MODEL" ? new Types.ObjectId(brandId) : undefined,
      seriesId: kind === "MODEL" && seriesId ? new Types.ObjectId(seriesId) : undefined,
      modelId: kind === "VARIANT" ? new Types.ObjectId(modelId) : undefined,
      status: selfManage ? "APPROVED" : "PENDING",
      reviewedBy: selfManage ? new Types.ObjectId(session.user.id) : undefined,
      reviewedAt: selfManage ? new Date() : undefined,
      resultEntityId: selfManage && resultEntity ? resultEntity._id : undefined,
    });

    logAction({
      action: "CREATE",
      entity: "CatalogChangeRequest",
      entityId: request._id?.toString(),
      after: request,
      req,
      actor: { id: session.user.id, businessId },
    });

    if (selfManage) {
      return NextResponse.json(
        { success: true, message: `"${trimmedName}" added — no approval needed for a Service Center's own catalog.`, request, entity: resultEntity },
        { status: 201 }
      );
    }

    // Fire-and-forget -- a Telegram outage must never fail the request creation.
    sendTelegramMessage(
      `New catalog request: ${kind} "${trimmedName}" — review at /console/common/masters/catalog-requests`
    ).catch((err) => console.error("[catalog/requests] Telegram notify failed:", err));

    // Also raise a real in-app notification (shows up in ANu's bell/panel
    // for every super admin, not just whoever happens to be watching
    // Telegram) -- these were two disconnected channels before; this is
    // the first of several call sites getting wired to both.
    notifySuperAdmins({
      title: "New catalog request",
      message: `${kind} "${trimmedName}" needs approval.`,
      type: "info",
      link: "/console/common/masters/catalog-requests",
    }).catch(() => {});

    return NextResponse.json({ success: true, request }, { status: 201 });
  } catch (err: any) {
    console.error("Catalog requests POST error:", err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
