import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { listVendors } from "@/lib/centralApiRead";

/* =========================================================
 * GET /api/vendors/requests
 * Lists general (business-agnostic) vendor signup requests — VendorProfile
 * docs with no businessId assigned yet, i.e. status APPLIED and
 * businessId null. These never show up in /api/vendors' list (which is
 * always businessId-scoped, since vendors are normally viewed per
 * business), so this is the dedicated queue an admin uses to review
 * incoming requests and assign each to a business before/while approving
 * it (see /api/vendors/[id]/review's APPROVE handler, which accepts a
 * businessId for exactly this case).
 *
 * Only super admins see this today, since a request with no business yet
 * is platform-wide by definition, not owned by any one business's admins.
 *
 * Reads from central-api (see src/lib/centralApiRead.ts) instead of local
 * Mongo — central-api's search has no null/boolean-aware matching, so the
 * businessId-is-null and isDeleted-is-false filters are applied here in
 * application code instead of as a query filter.
 * =======================================================*/
export async function GET(req: NextRequest) {
  try {
    const h = await headers();
    const userId = h.get("x-user-id");
    const isSuperAdmin = h.get("x-is-super-admin") === "true";
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!isSuperAdmin) {
      return NextResponse.json(
        { success: false, error: "Only Super Admins can view unassigned vendor requests" },
        { status: 403 }
      );
    }

    const all = await listVendors();
    const requests = all
      .filter((v) => !v.businessId && !v.isDeleted)
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

    return NextResponse.json({ success: true, requests, data: requests, total: requests.length });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
