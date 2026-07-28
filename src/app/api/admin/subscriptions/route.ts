/**
 * GET /api/admin/subscriptions — lists every business's subscription
 * status, for an AN-CRM super admin's own use. For the cross-app pull from
 * ANgroup's admin maintenance page, see the sibling
 * /api/admin/subscriptions/service route instead (service-token
 * authenticated, since ANgroup calls it without a session cookie).
 */
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Subscription from "@/models/Subscription";
import Business from "@/models/Business";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { listSubscriptionsForAdmin } from "@/core/subscriptions/adminList";

export async function GET(req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user || !session.isSuperAdmin) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    void Business; // registers the model so .populate("businessId") resolves

    const subscriptions = await listSubscriptionsForAdmin();
    return NextResponse.json({ success: true, subscriptions });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
