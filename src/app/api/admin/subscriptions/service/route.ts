/**
 * GET /api/admin/subscriptions/service — same data as
 * /api/admin/subscriptions, but authenticated via `x-service-token`
 * (matching AN_CRM_SERVICE_TOKEN) instead of a session cookie, for the
 * cross-app pull from ANgroup's admin maintenance page (per explicit
 * direction: "Admin side maintenance page for me required in ANgroup
 * about this"). Set AN_CRM_SERVICE_TOKEN to the SAME value in both apps'
 * env vars post-deploy -- until that's configured, this 401s (fails
 * closed, never open).
 */
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Business from "@/models/Business";
import { listSubscriptionsForAdmin } from "@/core/subscriptions/adminList";

export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get("x-service-token");
    if (!process.env.AN_CRM_SERVICE_TOKEN || token !== process.env.AN_CRM_SERVICE_TOKEN) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    void Business;

    const subscriptions = await listSubscriptionsForAdmin();
    return NextResponse.json({ success: true, subscriptions });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
