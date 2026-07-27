import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { bootstrapBusiness } from "@/services/businessBootstrap.service";
import { validateGSTINAgainstState } from "@/lib/validation/gst";
import { logAction } from "@/lib/audit/logAction";
import { notifyUser } from "@/services/notification.service";

export async function POST(req: Request) {
  try {
    const userId = req.headers.get("x-user-id");
    if (!userId) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }
    // Only Super Admin creates businesses -- who the actual Owner is (not
    // necessarily the creator) is a separate, explicit assignment made
    // afterwards via /api/admin/users/[id]/businesses, same as how a
    // vendor's Owner is assigned rather than inferred from whoever clicked
    // the button.
    if (req.headers.get("x-is-super-admin") !== "true") {
      return NextResponse.json(
        { success: false, message: "Only Super Admin can create a business" },
        { status: 403 }
      );
    }

    await connectDB();

    const body = await req.json();

    if (!body?.name || !String(body.name).trim()) {
      return NextResponse.json(
        { success: false, message: "Business name is required" },
        { status: 400 }
      );
    }

    // Server-side GSTIN re-validation — the create form already validates
    // this client-side, but that's trivially bypassable (direct API call,
    // disabled JS, etc.), so the actual guarantee has to live here too.
    if (body?.gstNumber && String(body.gstNumber).trim()) {
      const gstResult = validateGSTINAgainstState(body.gstNumber, body.state);
      if (!gstResult.valid) {
        return NextResponse.json(
          { success: false, message: gstResult.reason || "Invalid GSTIN" },
          { status: 400 }
        );
      }
    }

    if (body?.pincode && !/^[1-9][0-9]{5}$/.test(String(body.pincode).trim())) {
      return NextResponse.json(
        { success: false, message: "Pincode must be a valid 6-digit Indian PIN code" },
        { status: 400 }
      );
    }

    const business = await bootstrapBusiness(body);

    // No auto-membership for the creator: creation is Super-Admin-only now
    // (enforced above), and /api/auth/me already returns every active
    // business to a super admin regardless of BusinessMember rows -- so no
    // membership row is needed for them to see/manage it. The actual
    // Owner is assigned explicitly and separately via
    // /api/admin/users/[id]/businesses.

    logAction({
      action: "CREATE",
      entity: "Business",
      entityId: business._id?.toString(),
      after: business,
      req,
    });

    notifyUser({
      userId,
      businessId: business._id?.toString(),
      title: "Business created",
      message: `"${business.name}" was created successfully.`,
      type: "success",
      link: `/admin/business/${business._id}`,
    });

    return NextResponse.json({
      success: true,
      business,
    });
  } catch (err: any) {
    // Duplicate key (businessCode / tenantKey) → friendly message instead
    // of a raw Mongo error.
    if (err?.code === 11000) {
      return NextResponse.json(
        {
          success: false,
          message:
            "A business with this code already exists — try a different name/code.",
        },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { success: false, message: err.message || "Failed to create business" },
      { status: 500 }
    );
  }
}
