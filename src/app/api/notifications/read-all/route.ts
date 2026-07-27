import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Notification from "@/models/Notification";
import { getEnrichedSession } from "@/lib/auth/session-enriched";

// PATCH /api/notifications/read-all — mark all of the signed-in user's
// notifications as read, optionally scoped to one business.
export async function PATCH(req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const body = await req.json().catch(() => ({}));
    const businessId = body?.businessId;

    const query: Record<string, unknown> = { userId: session.user.id, isRead: false };
    if (businessId) query.businessId = businessId;

    await Notification.updateMany(query, { $set: { isRead: true } });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err?.message || "Failed to update notifications" },
      { status: 500 }
    );
  }
}
