import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { BusinessService } from "@/services/business.service";
import { getOrCreateANGroupBusinessId } from "@/core/access/anGroupBusiness.service";
import { getEnrichedSession } from "@/lib/auth/session-enriched";

export async function GET(req: NextRequest) {
  await connectDB();

  // Ensures the real "AN Group" business record exists before any consumer
  // of this list (business switchers/dropdowns platform-wide) renders --
  // AN Group is meant to always appear as a real, selectable business, not
  // something that only shows up after some other feature happens to
  // create it first.
  await getOrCreateANGroupBusinessId();

  // ?includeInactive=true is super-admin only -- this route has no auth
  // guard on the default (active-only) path, matching every other public
  // business-switcher consumer, but inactive businesses (soft-deleted, or
  // seeded-inactive placeholders) shouldn't be enumerable by an
  // unauthenticated caller. Only the admin Businesses list page (managing
  // the activate/deactivate toggle) requests this.
  const wantsInactive = req.nextUrl.searchParams.get("includeInactive") === "true";
  let includeInactive = false;
  if (wantsInactive) {
    const session = await getEnrichedSession().catch(() => null);
    includeInactive = !!session?.isSuperAdmin;
  }

  const businesses = await BusinessService.listBusinesses(includeInactive);

  return NextResponse.json({
    success: true,
    businesses,
  });
}
