/**
 * GET /api/businesses/platform-id — PUBLIC. Returns the businessId a public
 * link without ?businessId=/?code= should submit against (e.g. the
 * homepage's plain "Book an Appointment" CTA), so it doesn't fail with
 * "missing business reference". Prefers whichever Business an admin has
 * explicitly designated via isDefaultPublicBusiness (e.g. a distinct
 * customer-facing service business, separate from AN Group's own platform
 * record) -- see getDefaultPublicBusinessId()'s own comment -- falling back
 * to AN Group's platform business if none has been designated.
 */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getDefaultPublicBusinessId } from "@/core/access/anGroupBusiness.service";

export async function GET() {
  try {
    await connectDB();
    const businessId = await getDefaultPublicBusinessId();
    return NextResponse.json({ success: true, businessId });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
