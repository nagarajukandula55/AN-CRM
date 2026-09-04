import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { trackEvent } from "@/core/analytics/trackEvent";
import type { AnalyticsEventType } from "@/models/AnalyticsEvent";

// Client-triggerable events only -- server-side money events (checkout,
// payment, upgrade, renewal, trial signup) are logged directly from their
// own API routes, never trusted from the browser.
const CLIENT_ALLOWED_TYPES: AnalyticsEventType[] = ["PRICING_PAGE_VIEW", "PLAN_SELECTED"];

/**
 * POST /api/analytics/track — public, unauthenticated, fire-and-forget
 * beacon for the handful of funnel events only the browser can see
 * (a marketing page view, a plan pick before checkout even starts). See
 * models/AnalyticsEvent.ts's own comment on why this is separate from
 * vendor-facing analytics.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { type, planKey, billingPeriod, meta } = body as {
      type?: string;
      planKey?: string;
      billingPeriod?: string;
      meta?: Record<string, unknown>;
    };
    if (!type || !CLIENT_ALLOWED_TYPES.includes(type as AnalyticsEventType)) {
      return NextResponse.json({ success: false, message: "Invalid event type" }, { status: 400 });
    }
    await connectDB();
    trackEvent(type as AnalyticsEventType, { planKey, billingPeriod, meta });
    return NextResponse.json({ success: true });
  } catch {
    // Never let a tracking failure surface to the caller.
    return NextResponse.json({ success: true });
  }
}
