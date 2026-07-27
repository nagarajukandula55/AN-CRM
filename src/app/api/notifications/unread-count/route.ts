import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Notification from "@/models/Notification";
import { getEnrichedSession } from "@/lib/auth/session-enriched";

// GET /api/notifications/unread-count — lightweight poll target for the
// sidebar's bell badge, so it doesn't have to fetch (and re-render) the
// full notification list just to show a number.
export async function GET() {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const count = await Notification.countDocuments({ userId: session.user.id, isRead: false });

    return NextResponse.json({ success: true, count });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err?.message || "Failed to load unread count" },
      { status: 500 }
    );
  }
}
