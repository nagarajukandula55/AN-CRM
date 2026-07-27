/**
 * Notifications API
 * GET  /api/notifications?businessId= — list the signed-in user's notifications
 *      (optionally scoped further to one business), newest first.
 * POST /api/notifications             — create a notification for a user.
 *      Not a user-facing endpoint; called server-side by other routes/services
 *      (e.g. sendNotification() helper) to surface "your action happened"
 *      feedback in the persistent notification center.
 */
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Notification from "@/models/Notification";
import { getEnrichedSession } from "@/lib/auth/session-enriched";

export async function GET(req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const { searchParams } = new URL(req.url);
    const businessId = searchParams.get("businessId");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10) || 50, 200);

    // Global notifications (no businessId -- e.g. super-admin approval
    // alerts from notifySuperAdmins()) must always show regardless of
    // which business is currently selected, so a plain `businessId`
    // filter would silently hide them the moment a business is active.
    // Match either the selected business or a notification with none.
    const query: Record<string, unknown> = { userId: session.user.id };
    if (businessId) {
      query.$or = [{ businessId }, { businessId: null }, { businessId: { $exists: false } }];
    }

    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return NextResponse.json({ success: true, notifications });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err?.message || "Failed to load notifications" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const body = await req.json();
    const { userId, businessId, title, message, type, link } = body;

    if (!userId || !title || !message) {
      return NextResponse.json(
        { success: false, message: "userId, title and message are required" },
        { status: 400 }
      );
    }

    const notification = await Notification.create({
      userId,
      businessId: businessId || undefined,
      title,
      message,
      type: ["info", "success", "warning", "error"].includes(type) ? type : "info",
      link: link || undefined,
    });

    return NextResponse.json({ success: true, notification }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err?.message || "Failed to create notification" },
      { status: 500 }
    );
  }
}
