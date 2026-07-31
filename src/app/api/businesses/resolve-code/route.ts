/**
 * GET /api/businesses/resolve-code?code=AB — PUBLIC. Resolves a business's
 * 2-character brandShortcut to its real businessId, so public links (e.g. the
 * customer appointment-request page) can use `?code=AB` instead of a full
 * ObjectId. Same "never trust blindly" shape as businesses/public — only
 * returns the id for an active business.
 *
 * Reads from central-api (Phase B of the Business/Vendor migration — see
 * src/lib/centralApiRead.ts) instead of local Mongo.
 */
import { NextRequest, NextResponse } from "next/server";
import { listBusinesses } from "@/lib/centralApiRead";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const code = (searchParams.get("code") || "").trim().toUpperCase();
    if (code.length !== 2) {
      return NextResponse.json({ success: false, message: "Invalid code" }, { status: 400 });
    }

    // central-api's search has no boolean-aware matching, so isActive is
    // filtered here rather than as a query filter — see centralApiRead.ts.
    const all = await listBusinesses();
    const business = all.find((b) => b.brandShortcut === code && b.isActive);
    if (!business) {
      return NextResponse.json({ success: false, message: "No business found for this code" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      businessId: String(business._id),
      name: business.brandName || business.name,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err?.message || "Internal Server Error" }, { status: 500 });
  }
}
