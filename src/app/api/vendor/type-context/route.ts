import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { resolveVendorContext } from "@/lib/auth/vendorContext";

/**
 * GET /api/vendor/type-context
 *
 * Tells a page whether the current session belongs to a vendor of a
 * specific type (BRAND/SC/POS), or is a super admin/platform staff
 * member overseeing on their behalf -- used by pages that need to be
 * vendor-type-aware (e.g. console/crm/jobsheets/sc, the SC-only
 * single-page workorder flow) instead of gated by Business.operatingMode,
 * since a single business (e.g. My Biz Flow) can host BRAND/SC/POS
 * vendors together.
 */
export async function GET() {
  try {
    await connectDB();
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ appliedAs: null, isSuperAdmin: false }, { status: 401 });
    }

    const vendorContext = await resolveVendorContext(session.user.id);

    return NextResponse.json({
      appliedAs: (vendorContext?.vendor as any)?.appliedAs || null,
      vendorId: vendorContext?.vendor?._id ? String(vendorContext.vendor._id) : null,
      vendorRole: vendorContext?.role || null,
      isSuperAdmin: !!session.isSuperAdmin,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
