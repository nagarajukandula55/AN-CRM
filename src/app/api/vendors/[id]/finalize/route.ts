import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import { logAction } from "@/lib/audit/logAction";
import { activateVendorAfterAgreement } from "@/services/vendorActivation.service";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/vendors/[id]/finalize
 *
 * Manual fallback for step 4 of vendor onboarding (after the vendor and the
 * Super Admin/Owner have both signed the partner agreement). In the normal
 * flow this already happened automatically the instant the final signature
 * landed (see api/agreements/[id]/countersign/route.ts) -- this route stays
 * as an idempotent manual trigger for edge cases (e.g. the auto-activation
 * failed and needs a retry). See services/vendorActivation.service.ts for
 * the actual logic (create login, BusinessMember, default roles/staff
 * slots, credentials email) shared between both call sites.
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
    const result = await activateVendorAfterAgreement(id, adminId);
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status });
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
        email: result.vendor.email,
        // Shown exactly once — share it with the vendor over a secure channel.
        // Null when the user already existed (they keep their password).
        temporaryPassword: result.tempPassword,
        portalUrl: "/vendor",
      },
      message: result.tempPassword
        ? "Vendor approved and login created. Share the temporary password securely — it is shown only once."
        : "Vendor approved. An existing login with this email was linked to the vendor.",
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
