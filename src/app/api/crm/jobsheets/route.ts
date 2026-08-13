/**
 * CRM Job Sheets API
 * GET  /api/crm/jobsheets — list job sheets (filter by status/assignedTo/search)
 * POST /api/crm/jobsheets — create a job sheet (walk-in / direct service request).
 */

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import CrmJobSheet from "@/models/CrmJobSheet";
import { validateGSTIN } from "@/lib/validation/gst";
import { generateDocumentNumber } from "@/core/numbering/numberingService";
import { logAction } from "@/lib/audit/logAction";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";
import { resolveAuthorizedVendorScope } from "@/lib/auth/resolveAuthorizedBusinessId";
import { notifyJobSheetStatusChange } from "@/lib/customerNotify";
import { captureCustomer } from "@/services/customer.service";
import { sendVendorTelegramMessage } from "@/core/telegram/sendVendorTelegramMessage";
// Required for .populate(...) below -- model must be registered before populate can resolve it.
import "@/models/User";
import "@/models/Brand";

export async function GET(req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("crm_jobsheets", "view"));
    } catch (err: any) {
      return NextResponse.json(
        { success: false, message: err.message },
        { status: err.code === "FORBIDDEN" ? 403 : 401 }
      );
    }

    const userId = session.user.id;
    const h = await headers();
    const requestedBizId = h.get("x-active-business-id") || req.nextUrl.searchParams.get("businessId");

    await connectDB();

    // SECURITY: same cross-tenant leak as crm/calls (see
    // lib/auth/resolveAuthorizedBusinessId.ts) -- an unset
    // x-active-business-id header (stale JWT) used to fall through to
    // trusting a raw ?businessId= from the client with no ownership
    // check at all.
    const scope = await resolveAuthorizedVendorScope(
      userId,
      requestedBizId,
      session.isSuperAdmin,
      session.business?.businessId || null
    );
    const bizId = scope?.businessId || null;

    const filter: any = { isDeleted: false };
    if (bizId && mongoose.Types.ObjectId.isValid(bizId)) {
      filter.businessId = new mongoose.Types.ObjectId(bizId);
      if (scope?.vendorId) {
        filter.vendorId = new mongoose.Types.ObjectId(scope.vendorId);
      }
    } else if (!session.isSuperAdmin) {
      return NextResponse.json({ success: true, jobSheets: [], total: 0, page: 1, totalPages: 0 });
    }

    const status = req.nextUrl.searchParams.get("status");
    if (status && status !== "ALL") filter.status = status;

    const assignedTo = req.nextUrl.searchParams.get("assignedTo");
    if (assignedTo && mongoose.Types.ObjectId.isValid(assignedTo)) {
      filter.assignedTo = new mongoose.Types.ObjectId(assignedTo);
    }

    // Vendor CRM pages (see app/vendor/crm/jobsheets) scope to a whole
    // vendor TEAM's assignments at once -- same reasoning as calls/route.ts.
    const assignedToIn = req.nextUrl.searchParams.get("assignedToIn");
    if (assignedToIn) {
      const ids = assignedToIn.split(",").filter((id) => mongoose.Types.ObjectId.isValid(id));
      if (ids.length > 0) filter.assignedTo = { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) };
    }

    const search = req.nextUrl.searchParams.get("search");
    if (search) {
      filter.$or = [
        { customerName: { $regex: search, $options: "i" } },
        { jobSheetNumber: { $regex: search, $options: "i" } },
        { title: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
        { imeiOrSerialNumber: { $regex: search, $options: "i" } },
      ];
    }

    const page = Math.max(1, parseInt(req.nextUrl.searchParams.get("page") || "1"));
    const limit = Math.min(100, parseInt(req.nextUrl.searchParams.get("limit") || "50"));

    const [jobSheets, total] = await Promise.all([
      CrmJobSheet.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("assignedTo", "name email")
        .populate("brandId", "name logoUrl")
        .lean(),
      CrmJobSheet.countDocuments(filter),
    ]);

    return NextResponse.json({
      success: true,
      jobSheets,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err: any) {
    console.error("CRM jobsheets GET error:", err);
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
      requirePermission(session as any, buildPermissionCode("crm_jobsheets", "create"));
    } catch (err: any) {
      return NextResponse.json(
        { success: false, message: err.message },
        { status: err.code === "FORBIDDEN" ? 403 : 401 }
      );
    }

    const userId = session.user.id;
    const h = await headers();
    const bizId = h.get("x-active-business-id");

    const body = await req.json();
    const {
      customerName,
      company,
      gstin,
      ccoName: ccoNameOverride,
      phone,
      email,
      address,
      city,
      state,
      pincode,
      product,
      deviceCategory,
      brandId,
      pendingBrandName,
      deviceModel,
      deviceModelId,
      seriesId,
      variantId,
      imeiOrSerialNumber,
      issueDescription,
      faultCodeId,
      symptomCodeId,
      remark,
      warrantyStatus,
      deviceAppearance,
      fileBackupDescription,
      standardAccessories,
      specialDescription,
      appointmentType,
      requestType,
      brandJobNoForPartOrder,
      warehouseId,
      title,
      description,
      scheduledAt,
      assignedTo,
      lineItems,
    } = body;

    // SECURITY: body.businessId used to win outright over the trusted
    // header -- see the matching GET fix above / resolveAuthorizedBusinessId's
    // own comment. Any authenticated caller could otherwise attribute a
    // new job sheet to any business just by putting that businessId in
    // the request body.
    await connectDB();
    const createScope = await resolveAuthorizedVendorScope(
      userId,
      body.businessId || bizId,
      session.isSuperAdmin,
      session.business?.businessId || null
    );
    const effectiveBizId = createScope?.businessId || null;
    const effectiveVendorId = createScope?.vendorId || null;

    if (!customerName?.trim()) {
      return NextResponse.json({ success: false, message: "Customer name is required" }, { status: 400 });
    }
    if (!phone?.trim()) {
      return NextResponse.json({ success: false, message: "Phone number is required" }, { status: 400 });
    }
    if (!title?.trim()) {
      return NextResponse.json({ success: false, message: "Job title is required" }, { status: 400 });
    }
    if (gstin?.trim()) {
      const gstResult = validateGSTIN(gstin);
      if (!gstResult.valid) {
        return NextResponse.json({ success: false, message: `GSTIN: ${gstResult.reason}` }, { status: 400 });
      }
    }
    if (!effectiveBizId) {
      return NextResponse.json({ success: false, message: "businessId is required" }, { status: 400 });
    }

    await connectDB();

    const { value: jobSheetNumber } = await generateDocumentNumber(effectiveBizId, "JOB_SHEET");

    const jobSheet = await CrmJobSheet.create({
      businessId: new mongoose.Types.ObjectId(effectiveBizId),
      vendorId: effectiveVendorId ? new mongoose.Types.ObjectId(effectiveVendorId) : null,
      jobSheetNumber,
      customerName: customerName.trim(),
      company: company?.trim(),
      gstin: gstin?.trim()?.toUpperCase(),
      phone: phone.trim(),
      email: email?.toLowerCase()?.trim(),
      address,
      city,
      state,
      pincode,
      product,
      deviceCategory: deviceCategory || undefined,
      brandId:
        brandId && mongoose.Types.ObjectId.isValid(brandId)
          ? new mongoose.Types.ObjectId(brandId)
          : undefined,
      pendingBrandName: pendingBrandName?.trim() || undefined,
      deviceModel,
      deviceModelId:
        deviceModelId && mongoose.Types.ObjectId.isValid(deviceModelId)
          ? new mongoose.Types.ObjectId(deviceModelId)
          : undefined,
      seriesId:
        seriesId && mongoose.Types.ObjectId.isValid(seriesId)
          ? new mongoose.Types.ObjectId(seriesId)
          : undefined,
      variantId:
        variantId && mongoose.Types.ObjectId.isValid(variantId)
          ? new mongoose.Types.ObjectId(variantId)
          : undefined,
      imeiOrSerialNumber,
      issueDescription,
      faultCodeId:
        faultCodeId && mongoose.Types.ObjectId.isValid(faultCodeId)
          ? new mongoose.Types.ObjectId(faultCodeId)
          : undefined,
      symptomCodeId:
        symptomCodeId && mongoose.Types.ObjectId.isValid(symptomCodeId)
          ? new mongoose.Types.ObjectId(symptomCodeId)
          : undefined,
      remark,
      warrantyStatus: ["IW", "OOW"].includes(warrantyStatus) ? warrantyStatus : undefined,
      deviceAppearance: ["GOOD", "USED", "DENTS", "BROKEN"].includes(deviceAppearance) ? deviceAppearance : undefined,
      fileBackupDescription: ["YES", "NO"].includes(fileBackupDescription) ? fileBackupDescription : undefined,
      standardAccessories,
      specialDescription,
      appointmentType: ["ONSITE", "WALKIN"].includes(appointmentType) ? appointmentType : undefined,
      requestType: ["REPAIR", "INSTALLATION"].includes(requestType) ? requestType : undefined,
      brandJobNoForPartOrder,
      warehouseId:
        warehouseId && mongoose.Types.ObjectId.isValid(warehouseId)
          ? new mongoose.Types.ObjectId(warehouseId)
          : undefined,
      title: title.trim(),
      description,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
      assignedTo:
        assignedTo && mongoose.Types.ObjectId.isValid(assignedTo)
          ? new mongoose.Types.ObjectId(assignedTo)
          : undefined,
      status: "CREATED",
      lineItems: Array.isArray(lineItems) ? lineItems : [],
      createdBy: new mongoose.Types.ObjectId(userId),
      // CCO name snapshot -- this creating user's own name for the
      // walk-in job sheet. See CrmJobSheet.ts's field comment.
      // Editable at intake (see console/crm/jobsheets/sc's CCO Name field) --
      // defaults to the session-derived name when the caller doesn't override it.
      ccoName: ccoNameOverride?.trim() || session.user.name || "",
    });

    captureCustomer({
      businessId: effectiveBizId,
      name: jobSheet.customerName,
      phone: jobSheet.phone,
      email: jobSheet.email,
      address: jobSheet.address,
      city: jobSheet.city,
      state: jobSheet.state,
      pincode: jobSheet.pincode,
      sourceModule: "CRM_JOBSHEET",
      imeiOrSerialNumber: jobSheet.imeiOrSerialNumber,
    });

    notifyJobSheetStatusChange(effectiveBizId, jobSheet.phone, jobSheet.jobSheetNumber, jobSheet.status);

    sendVendorTelegramMessage(
      effectiveBizId,
      "NEW_WORKORDER",
      `New workorder ${jobSheet.jobSheetNumber} created for ${jobSheet.customerName} (${jobSheet.phone}).`,
      {
        workorderNumber: jobSheet.jobSheetNumber || "",
        customerName: jobSheet.customerName || "",
        phone: jobSheet.phone || "",
      }
    ).catch(() => {});

    logAction({
      action: "CREATE",
      entity: "CrmJobSheet",
      entityId: jobSheet._id?.toString(),
      after: jobSheet,
      req,
      actor: { id: userId, businessId: effectiveBizId },
    });

    return NextResponse.json({ success: true, jobSheet }, { status: 201 });
  } catch (err: any) {
    console.error("CRM jobsheets POST error:", err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
