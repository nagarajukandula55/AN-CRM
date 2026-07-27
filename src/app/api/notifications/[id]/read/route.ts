import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Notification from "@/models/Notification";
import { getEnrichedSession } from "@/lib/auth/session-enriched";

// PATCH /api/notifications/[id]/read — mark one of the signed-in user's own
// notifications as read. Scoped to userId, same as DELETE.
export async function PATCH(req: NextRequest, context: any) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const id = context?.params?.id;

    const notification = await Notification.findOneAndUpdate(
      { _id: id, userId: session.user.id },
      { $set: { isRead: true } },
      { new: true }
    ).lean();

    if (!notification) {
      return NextResponse.json({ success: false, message: "Notification not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, notification });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err?.message || "Failed to update notification" },
      { status: 500 }
    );
  }
}
