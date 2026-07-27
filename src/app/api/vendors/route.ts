import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import VendorProfile from "@/models/VendorProfile";
import User from "@/models/User";
import { connectDB } from "@/lib/mongodb";
import { Types } from "mongoose";
import { generateGlobalDocumentNumber } from "@/core/numbering/numberingService";
import { logAction } from "@/lib/audit/logAction";
// Required for .populate(...) below -- model must be registered before populate can resolve it.
import "@/models/Business";

/* =========================================================
 * GET /api/vendors?businessId=...&search=...&page=&limit=
 * Vendors are always scoped to a business (multi-tenant).
 * =======================================================*/
export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const h = await headers();
    const userId = h.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    // Prefer the explicit query param, fall back to the active business
    // injected by the auth middleware.
    const businessId =
      searchParams.get("businessId") || h.get("x-active-business-id");
    const search = searchParams.get("search");
    const status = searchParams.get("status");
    const isSuperAdmin = h.get("x-is-super-admin") === "true";
    const isPlatformStaff = h.get("x-is-platform-staff") === "true";

    // Super admins (and AN Group platform staff holding a platform-wide
    // role -- see middleware.ts's x-is-platform-staff header) can request
    // every vendor across every business at once (businessId=ALL) --
    // without this, the admin Vendors page could only ever show whichever
    // ONE business happened to be active in the session, so a vendor
    // created under a different business silently never appeared in the
    // list even though it existed in the DB (it only showed up after
    // switching the active business to match).
    const wantsAll = (isSuperAdmin || isPlatformStaff) && businessId === "ALL";

    if (!wantsAll && (!businessId || !Types.ObjectId.isValid(businessId))) {
      return NextResponse.json(
        { success: false, error: "A valid businessId is required" },
        { status: 400 }
      );
    }

    const query: Record<string, unknown> = { isDeleted: false };
    if (!wantsAll) {
      query.businessId = new Types.ObjectId(businessId!);
    }

    if (status) query.status = status;

    if (search) {
      query.$or = [
        { companyName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { vendorId: { $regex: search, $options: "i" } },
      ];
    }

    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(
      200,
      Math.max(1, parseInt(searchParams.get("limit") || "100"))
    );

    const [vendors, total] = await Promise.all([
      VendorProfile.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        // Populate businessId so the vendor detail popup can show which
        // business this vendor is being onboarded into by name, not a raw
        // ObjectId — the list is already scoped to one business via the
        // query filter above, but confirming the tag in the UI still
        // matters (e.g. when the admin manages several businesses and
        // wants to double check they're looking at the right one).
        .populate("businessId", "name legalName brandName")
        .lean(),
      VendorProfile.countDocuments(query),
    ]);

    // `vendors` is what the admin vendors page reads; `data` kept for
    // any older consumers.
    return NextResponse.json({ success: true, vendors, data: vendors, total, page, limit });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

/* =========================================================
 * POST /api/vendors — onboard a vendor under a business
 * Accepts the full onboarding payload from the admin UI:
 * company, contact, compliance (GST/PAN), commercial terms,
 * address and bank details.
 * =======================================================*/
export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const h = await headers();
    const userId = h.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const businessId = body.businessId || h.get("x-active-business-id");
    const {
      companyName,
      businessType,
      contactPerson,
      email,
      phone,
      gstNumber,
      panNumber,
      category,
      paymentTerms,
      creditLimit,
      address,
      bankDetails,
      notes,
      ownerUserId,
      ownerEmail,
    } = body;

    if (!businessId || !Types.ObjectId.isValid(businessId)) {
      return NextResponse.json(
        { success: false, error: "A valid businessId is required — every vendor belongs to a business" },
        { status: 400 }
      );
    }
    if (!companyName || !String(companyName).trim()) {
      return NextResponse.json(
        { success: false, error: "companyName is required" },
        { status: 400 }
      );
    }

    // Prevent obvious duplicates within the same business
    if (email) {
      const dup = await VendorProfile.findOne({
        businessId: new Types.ObjectId(businessId),
        email: String(email).toLowerCase().trim(),
        isDeleted: false,
      }).lean();
      if (dup) {
        return NextResponse.json(
          { success: false, error: "A vendor with this email already exists in this business" },
          { status: 409 }
        );
      }
    }

    // Explicit owner pick -- take an existing REGISTERED user by id or
    // email, per the requirement that a vendor entity's Owner is a real,
    // already-registered account, never silently created here. Optional:
    // if neither is given, the vendor stays unlinked until finalize (the
    // legacy path, which still resolves by vendor.email at that step).
    let ownerUser = null as any;
    if (ownerUserId && Types.ObjectId.isValid(ownerUserId)) {
      ownerUser = await User.findOne({ _id: ownerUserId, isDeleted: false });
      if (!ownerUser) {
        return NextResponse.json(
          { success: false, error: "No registered user found with that user ID" },
          { status: 404 }
        );
      }
    } else if (ownerEmail && String(ownerEmail).trim()) {
      ownerUser = await User.findOne({ email: String(ownerEmail).toLowerCase().trim(), isDeleted: false });
      if (!ownerUser) {
        return NextResponse.json(
          { success: false, error: "No registered user found with that email — the owner must already have an account" },
          { status: 404 }
        );
      }
    }

    // vendorId is GLOBALLY unique in the schema (see VendorProfile.ts) —
    // was `countDocuments()`-based (race-prone under concurrent creates;
    // the comment here used to explain a real duplicate-key bug from an
    // earlier attempt at per-business counting). Now uses the canonical
    // numbering engine's global-scope variant (core/numbering/
    // numberingService.ts's generateGlobalDocumentNumber), which is
    // atomic and still lets this business's own DocumentNumberConfig
    // control the prefix/format if configured.
    const { value: vendorId } = await generateGlobalDocumentNumber("VENDOR", businessId);

    const vendor = await VendorProfile.create({
      businessId: new Types.ObjectId(businessId),
      vendorId,
      userId: ownerUser?._id,
      companyName: String(companyName).trim(),
      businessType,
      contactPerson,
      email: email ? String(email).toLowerCase().trim() : undefined,
      phone,
      gstNumber: gstNumber ? String(gstNumber).toUpperCase().trim() : undefined,
      panNumber: panNumber ? String(panNumber).toUpperCase().trim() : undefined,
      category,
      paymentTerms,
      creditLimit: typeof creditLimit === "number" ? creditLimit : undefined,
      address,
      bankDetails,
      notes,
      status: "PENDING",
      isApproved: false,
    });

    logAction({
      action: "CREATE",
      entity: "VendorProfile",
      entityId: vendor._id?.toString(),
      after: vendor,
      req,
      actor: { id: userId },
    });

    return NextResponse.json({ success: true, vendor, data: vendor }, { status: 201 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
