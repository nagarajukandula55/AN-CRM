import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import VendorProfile from "@/models/VendorProfile";
import Business from "@/models/Business";
import User from "@/models/User";
import { Types } from "mongoose";
import { generateGlobalDocumentNumber } from "@/core/numbering/numberingService";
import { logAction } from "@/lib/audit/logAction";
import { notifySuperAdmins } from "@/services/notification.service";

/**
 * POST /api/vendors/apply — PUBLIC vendor signup request.
 *
 * Previously required a businessId in the request (the admin had to share
 * a link like /vendor-apply?businessId=... pointed at one specific
 * business). That doesn't fit a general "raise a vendor signup request"
 * flow where the prospective vendor doesn't know or choose which business
 * they're being onboarded under — the admin now assigns that at approval
 * time (see /api/vendors/[id]/review's APPROVE handler, which accepts a
 * businessId in its body and sets it there for the first time).
 *
 * businessId is still ACCEPTED here (optional) so the existing
 * link-based flow (/vendor-apply?businessId=...) keeps working exactly as
 * before for admins who prefer to pre-target one business — this route
 * just no longer REQUIRES it.
 *
 * Every application gets a requestNumber immediately so the applicant has
 * something to reference/quote while waiting for review, independent of
 * vendorId (which historically doubles as the operational vendor ID and
 * needs a businessId-aware numbering config that may not exist yet for an
 * unassigned application).
 */
export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const body = await req.json();

    const {
      businessId,
      userId,
      companyName,
      contactPerson,
      email,
      phone,
      gstRegistered,
      gstNumber,
      panNumber,
      category,
      businessType,
      address,
      bankDetails,
      documents,
      notes,
    } = body;

    if (!companyName || !contactPerson || !email || !phone) {
      return NextResponse.json(
        { success: false, message: "Company name, contact person, email and phone are required" },
        { status: 400 }
      );
    }

    // A vendor application must be tied to an already-registered User
    // account (created via /register beforehand) rather than minting one
    // inline -- the applicant supplies that account's User ID here, and it
    // must actually exist. This also means finalize/route.ts's "create a
    // user with a temp password" branch is now the fallback path for
    // legacy applications, not the norm.
    if (!userId || !String(userId).trim()) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Please register an account first at /register, then enter your User ID here.",
        },
        { status: 400 }
      );
    }
    const normalizedUserId = String(userId).toLowerCase().trim();
    const applicantUser = await User.findOne({
      username: normalizedUserId,
      isDeleted: { $ne: true },
    })
      .select("_id email")
      .lean();
    if (!applicantUser) {
      return NextResponse.json(
        {
          success: false,
          message:
            "No registered account found with that User ID. Please register first at /register, then apply with the User ID you were given.",
        },
        { status: 404 }
      );
    }

    // GST rule: a GST-registered vendor must supply a GSTIN; a without-GST
    // vendor must supply PAN instead.
    if (gstRegistered && !gstNumber) {
      return NextResponse.json(
        { success: false, message: "GSTIN is required for GST-registered vendors" },
        { status: 400 }
      );
    }
    if (!gstRegistered && !panNumber) {
      return NextResponse.json(
        { success: false, message: "PAN is required for vendors without GST registration" },
        { status: 400 }
      );
    }

    let business: { _id: unknown; name?: string; brandName?: string } | null = null;
    if (businessId) {
      if (!Types.ObjectId.isValid(businessId)) {
        return NextResponse.json(
          { success: false, message: "Invalid businessId in link" },
          { status: 400 }
        );
      }
      business = await (Business as any)
        .findOne({ _id: businessId, isActive: true })
        .select("_id name brandName")
        .lean();
      if (!business) {
        return NextResponse.json(
          { success: false, message: "Business not found or inactive" },
          { status: 404 }
        );
      }
    }

    // One live application per email (scoped to the target business when
    // one was pre-selected via the link; otherwise scoped globally, since
    // an unassigned application has no business to scope to yet).
    const dupeQuery: Record<string, unknown> = {
      email: String(email).toLowerCase().trim(),
      isDeleted: false,
      status: { $nin: ["REJECTED", "INACTIVE"] },
    };
    if (business) dupeQuery.businessId = new Types.ObjectId(businessId);
    else dupeQuery.businessId = null;
    const existing = await VendorProfile.findOne(dupeQuery).lean();
    if (existing) {
      return NextResponse.json(
        { success: false, message: "An application with this email already exists" },
        { status: 409 }
      );
    }

    // requestNumber — always generated, independent of businessId.
    const { value: requestNumber } = await generateGlobalDocumentNumber("VENDOR_REQUEST", null);

    // vendorId — only generated now if a business was pre-selected (so the
    // existing link-based flow behaves exactly as before). For a general
    // unassigned application, vendorId is generated later at APPROVE time
    // once a business is actually chosen (see review/route.ts).
    let vendorId: string | undefined;
    if (business) {
      const generated = await generateGlobalDocumentNumber("VENDOR", businessId);
      vendorId = generated.value;
    }

    const vendor = await VendorProfile.create({
      businessId: business ? new Types.ObjectId(businessId) : null,
      userId: (applicantUser as any)._id,
      vendorId,
      requestNumber,
      companyName: String(companyName).trim(),
      contactPerson: String(contactPerson).trim(),
      email: String(email).toLowerCase().trim(),
      phone: String(phone).trim(),
      gstRegistered: !!gstRegistered,
      gstNumber: gstNumber ? String(gstNumber).toUpperCase().trim() : undefined,
      panNumber: panNumber ? String(panNumber).toUpperCase().trim() : undefined,
      category,
      businessType,
      address,
      bankDetails,
      documents,
      notes,
      status: "APPLIED",
      isApproved: false,
    });

    logAction({
      action: "CREATE",
      entity: "VendorProfile",
      entityId: vendor._id?.toString(),
      after: vendor,
      req,
    });

    await notifySuperAdmins({
      title: "New vendor application",
      message: `${String(companyName).trim()} applied (request ${requestNumber}) and needs review${business ? ` for ${business.brandName || business.name}` : ""}.`,
      type: "warning",
      link: "/admin/vendors",
    });

    return NextResponse.json(
      {
        success: true,
        message: business
          ? "Application submitted successfully. The team will review your details and contact you for the partner agreement."
          : `Application submitted successfully. Your request number is ${requestNumber} — please quote it in any follow-up. The team will review your documents, assign you to the appropriate business, and contact you for the partner agreement.`,
        applicationId: vendor.vendorId || requestNumber,
        requestNumber,
        business: business?.brandName || business?.name,
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}