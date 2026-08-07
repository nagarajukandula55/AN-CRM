import { NextResponse } from "next/server";
import { resolveCentralBusinessId } from "@/lib/centralApiRead";

/**
 * Proxies central-api's vendor-onboarding-config skip-approval setting for
 * ONE business. Exists because /api/vendors/apply/route.ts's skip-approval
 * check reads central-api FIRST (see getVendorOnboardingConfig -- central,
 * once a business resolves there, always wins over the local
 * Business.marketplace.skipVendorApproval checkbox on this app's own
 * Business Settings page). Before today's businesses-sync fix, that central
 * lookup silently always returned null (nothing synced yet), so the local
 * checkbox alone happened to work by accident. Now that businesses
 * actually sync, the local checkbox needs a write-through to central-api
 * too, or it's silently overridden by central's default (false) -- this
 * route is that write-through. Business Settings' save handler calls this
 * in addition to its existing local PATCH.
 */

const CENTRAL_API_URL = process.env.CENTRAL_API_URL;
const CENTRAL_API_KEY = process.env.CENTRAL_API_KEY;

function centralHeaders() {
  return { "x-api-key": CENTRAL_API_KEY || "", "Content-Type": "application/json" };
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!CENTRAL_API_URL) {
    return NextResponse.json({ error: "CENTRAL_API_URL is not configured" }, { status: 503 });
  }

  const centralBusinessId = await resolveCentralBusinessId(id);
  if (!centralBusinessId) {
    return NextResponse.json({ error: "This business isn't synced to central-api yet." }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  try {
    const res = await fetch(
      `${CENTRAL_API_URL}/api/v1/vendor-onboarding-config/business/${centralBusinessId}/skip-approval`,
      { method: "PUT", headers: centralHeaders(), body: JSON.stringify({ skipVendorApproval: !!body.skipVendorApproval }) }
    );
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    console.error("[vendor-onboarding-config proxy] error:", err?.message || err);
    return NextResponse.json({ error: "central-api request failed" }, { status: 502 });
  }
}
