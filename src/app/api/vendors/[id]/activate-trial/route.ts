import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import { logAction } from "@/lib/audit/logAction";
import VendorProfile from "@/models/VendorProfile";
import { activateVendorWithTrial } from "@/services/vendorActivation.service";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/vendors/[id]/activate-trial
 *
 * Manual admin trigger for the instant-trial activation path (the same
 * activateVendorWithTrial() the public apply endpoint calls automatically
 * when a business has skip-approval turned on) -- for a pending
 * application that should get the instant-trial treatment right now even
 * though the automatic trigger didn't fire (e.g. the business's
 * skip-approval setting wasn't on yet at the moment they applied, or the
 * central-api lookup failed at that moment). Idempotent-ish: rejects an
 * already-ACTIVE vendor rather than re-running activation.
 */
export async function POST(req: NextRequest, context: RouteContext) {
  try {
    await connectDB();
    const h = await headers();
    const adminId = h.get("x-user-id");
    if (!adminId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const vendor = await VendorProfile.findById(id);
    if (!vendor || vendor.isDeleted) {
      return NextResponse.json({ success: false, error: "Vendor not found" }, { status: 404 });
    }
    if (["ACTIVE", "APPROVED"].includes(vendor.status)) {
      return NextResponse.json({ success: false, error: "Vendor is already active" }, { status: 400 });
    }
    if (!vendor.businessId) {
      return NextResponse.json({ success: false, error: "This application has no business assigned yet" }, { status: 400 });
    }

    const result = await activateVendorWithTrial(vendor, String(vendor.businessId), { skipAgreement: true });
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    logAction({
      action: "APPROVE",
      entity: "VendorProfile",
      entityId: id,
      after: result.vendor,
      req,
      actor: { id: adminId },
    });

    return NextResponse.json({
      success: true,
      vendor: result.vendor,
      login: {
        vendorId: result.vendor.vendorId,
        email: result.vendor.email,
        temporaryPassword: result.tempPassword,
        portalUrl: "/vendor",
      },
      message: result.tempPassword
        ? "Vendor activated on a 7-day trial. Share the Vendor ID + temporary password securely — the password is shown only once."
        : "Vendor activated on a 7-day trial. Their existing login now signs in with their Vendor ID.",
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
