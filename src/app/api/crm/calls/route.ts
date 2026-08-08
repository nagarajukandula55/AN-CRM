/**
 * CRM Calls API — canonical call-entry endpoint for the CRM lifecycle
 * (call entry -> disposition -> job sheet -> invoice -> closure).
 *
 * GET  /api/crm/calls   — list calls (filter by status/priority/assignedTo/search)
 * POST /api/crm/calls   — create a new call entry
 *
 * Follows the same auth/business-scoping pattern as
 * app/api/sales/invoices/route.ts: reads x-user-id / x-active-business-id
 * from middleware-injected headers, generates the human-facing reference via
 * the canonical numbering engine (core/numbering/numberingService.ts), and
 * writes an audit log entry via lib/audit/logAction.ts on every write.
 */

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import CrmCall from "@/models/CrmCall";
import { generateDocumentNumber } from "@/core/numbering/numberingService";
import { logAction } from "@/lib/audit/logAction";
import { notify } from "@/lib/notify";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";
import { resolveAuthorizedBusinessId } from "@/lib/auth/resolveAuthorizedBusinessId";
// Required for .populate(...) below -- model must be registered before populate can resolve it.
import "@/models/User";
import "@/models/Brand";
import "@/models/DeviceModel";
import "@/models/VendorProfile";

/* ── GET /api/crm/calls ───────────────────────────────────────────── */
export async function GET(req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("crm_calls", "view"));
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

    // SECURITY: requestedBizId above was previously trusted outright --
    // whenever the caller's session had no x-active-business-id header
    // (a stale JWT predating a fresh login), this fell back to whatever
    // ?businessId= the client sent with ZERO ownership check, so one
    // vendor's account could see another vendor's calls just by knowing
    // (or guessing/reusing a stale cached value for) their businessId.
    // See lib/auth/resolveAuthorizedBusinessId.ts for the fix.
    const bizId = await resolveAuthorizedBusinessId(
      userId,
      requestedBizId,
      session.isSuperAdmin,
      session.business?.businessId || null
    );

    const filter: any = { isDeleted: false };
    if (bizId && mongoose.Types.ObjectId.isValid(bizId)) {
      filter.businessId = new mongoose.Types.ObjectId(bizId);
    } else if (!session.isSuperAdmin) {
      // No resolvable business for a non-super-admin caller -- return
      // nothing rather than an unscoped (every-tenant) result set.
      return NextResponse.json({ success: true, calls: [], total: 0, page: 1, totalPages: 0, statusCounts: {} });
    }

    const status = req.nextUrl.searchParams.get("status");
    if (status && status !== "ALL") filter.status = status;

    const priority = req.nextUrl.searchParams.get("priority");
    if (priority && priority !== "ALL") filter.priority = priority;

    const assignedTo = req.nextUrl.searchParams.get("assignedTo");
    if (assignedTo && mongoose.Types.ObjectId.isValid(assignedTo)) {
      filter.assignedTo = new mongoose.Types.ObjectId(assignedTo);
    }

    // Vendor CRM pages (see app/vendor/crm/calls) scope to a whole vendor
    // TEAM's assignments at once (not just one person), since these records
    // have no vendorId of their own -- only assignedTo. Comma-separated
    // list of userIds, same permission gate as the single-assignedTo form
    // above (crm_calls.view).
    const assignedToIn = req.nextUrl.searchParams.get("assignedToIn");
    if (assignedToIn) {
      const ids = assignedToIn.split(",").filter((id) => mongoose.Types.ObjectId.isValid(id));
      if (ids.length > 0) filter.assignedTo = { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) };
    }

    const source = req.nextUrl.searchParams.get("source");
    if (source) filter.source = source;

    const tag = req.nextUrl.searchParams.get("tag");
    if (tag) filter.tags = tag;

    const search = req.nextUrl.searchParams.get("search");
    if (search) {
      filter.$or = [
        { customerName: { $regex: search, $options: "i" } },
        { company: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { callNumber: { $regex: search, $options: "i" } },
      ];
    }

    const page = Math.max(1, parseInt(req.nextUrl.searchParams.get("page") || "1"));
    const limit = Math.min(100, parseInt(req.nextUrl.searchParams.get("limit") || "50"));

    const [calls, total, statusCounts] = await Promise.all([
      CrmCall.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("assignedTo", "name email")
        .populate("brandId", "name")
        .populate("deviceModelId", "name")
        .populate("routedVendorId", "companyName phone email")
        .lean(),
      CrmCall.countDocuments(filter),
      CrmCall.aggregate([
        { $match: { isDeleted: false, ...(filter.businessId ? { businessId: filter.businessId } : {}) } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
    ]);

    return NextResponse.json({
      success: true,
      calls,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      statusCounts: statusCounts.reduce((acc: any, s: any) => {
        acc[s._id] = s.count;
        return acc;
      }, {}),
    });
  } catch (err: any) {
    console.error("CRM calls GET error:", err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

/* ── POST /api/crm/calls ──────────────────────────────────────────── */
export async function POST(req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("crm_calls", "create"));
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
    // SECURITY: body.businessId (below) previously won outright over the
    // trusted header -- any authenticated caller could attribute a new
    // call record to ANY business just by putting that businessId in the
    // request body. Now validated the same way GET above is.
    await connectDB();
    const {
      customerName,
      company,
      phone,
      email,
      address,
      city,
      state,
      pincode,
      source,
      product,
      deviceCategory,
      brandId,
      pendingBrandName,
      deviceModel,
      deviceModelId,
      seriesId,
      variantId,
      faultCodeId,
      symptomCodeId,
      subject,
      description,
      priority,
      appointmentType,
      requestType,
      appointmentDate,
      assignedTo,
      estimatedValue,
      currency,
      tags,
    } = body;

    const effectiveBizId = await resolveAuthorizedBusinessId(
      userId,
      body.businessId || bizId,
      session.isSuperAdmin,
      session.business?.businessId || null
    );

    if (!customerName?.trim()) {
      return NextResponse.json({ success: false, message: "Customer name is required" }, { status: 400 });
    }
    if (!phone?.trim()) {
      return NextResponse.json({ success: false, message: "Phone number is required" }, { status: 400 });
    }
    if (!subject?.trim()) {
      return NextResponse.json({ success: false, message: "Call subject is required" }, { status: 400 });
    }
    if (!effectiveBizId) {
      return NextResponse.json({ success: false, message: "businessId is required" }, { status: 400 });
    }
    // Onsite means an engineer has to actually go somewhere -- a real
    // address is not optional for that appointment type.
    if (appointmentType === "ONSITE" && (!address?.trim() || !city?.trim() || !state?.trim() || !pincode?.trim())) {
      return NextResponse.json(
        { success: false, message: "Address, city, state, and pincode are required for an onsite appointment" },
        { status: 400 }
      );
    }

    await connectDB();

    const { value: callNumber } = await generateDocumentNumber(effectiveBizId, "CALL");

    const call = await CrmCall.create({
      businessId: new mongoose.Types.ObjectId(effectiveBizId),
      callNumber,
      customerName: customerName.trim(),
      company: company?.trim(),
      phone: phone.trim(),
      email: email?.toLowerCase()?.trim(),
      address,
      city,
      state,
      pincode,
      source,
      product,
      deviceCategory: deviceCategory || undefined,
      brandId: brandId && mongoose.Types.ObjectId.isValid(brandId) ? new mongoose.Types.ObjectId(brandId) : undefined,
      pendingBrandName: pendingBrandName?.trim() || undefined,
      deviceModel,
      deviceModelId: deviceModelId && mongoose.Types.ObjectId.isValid(deviceModelId) ? new mongoose.Types.ObjectId(deviceModelId) : undefined,
      seriesId: seriesId && mongoose.Types.ObjectId.isValid(seriesId) ? new mongoose.Types.ObjectId(seriesId) : undefined,
      variantId: variantId && mongoose.Types.ObjectId.isValid(variantId) ? new mongoose.Types.ObjectId(variantId) : undefined,
      faultCodeId: faultCodeId && mongoose.Types.ObjectId.isValid(faultCodeId) ? new mongoose.Types.ObjectId(faultCodeId) : undefined,
      symptomCodeId: symptomCodeId && mongoose.Types.ObjectId.isValid(symptomCodeId) ? new mongoose.Types.ObjectId(symptomCodeId) : undefined,
      subject: subject.trim(),
      description,
      priority: priority || "MEDIUM",
      appointmentType: appointmentType === "ONSITE" ? "ONSITE" : "WALKIN",
      requestType: requestType === "INSTALLATION" ? "INSTALLATION" : "REPAIR",
      appointmentDate: appointmentDate ? new Date(appointmentDate) : undefined,
      status: "NEW",
      assignedTo:
        assignedTo && mongoose.Types.ObjectId.isValid(assignedTo)
          ? new mongoose.Types.ObjectId(assignedTo)
          : undefined,
      estimatedValue: estimatedValue ? parseFloat(estimatedValue) : 0,
      currency: currency || "INR",
      tags: tags || [],
      createdBy: new mongoose.Types.ObjectId(userId),
      // CCO name snapshot -- see CrmCall.ts's field comment.
      createdByName: session.user.name || "",
    });

    logAction({
      action: "CREATE",
      entity: "CrmCall",
      entityId: call._id?.toString(),
      after: call,
      req,
      actor: { id: userId, businessId: effectiveBizId },
    });

    notify({
      event: "NEW_CRM_CALL",
      message: `📞 New call ${call.callNumber}\nCustomer: ${call.customerName}\nSubject: ${call.subject}`,
    }).catch(() => {});

    return NextResponse.json({ success: true, call }, { status: 201 });
  } catch (err: any) {
    console.error("CRM calls POST error:", err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
