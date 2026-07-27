import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Notification from "@/models/Notification";
import { getEnrichedSession } from "@/lib/auth/session-enriched";

// DELETE /api/notifications/[id] — remove one of the signed-in user's own
// notifications. Scoped to userId so one user can never delete another's.
export async function DELETE(req: NextRequest, context: any) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const id = context?.params?.id;

    const result = await Notification.deleteOne({ _id: id, userId: session.user.id });
    if (result.deletedCount === 0) {
      return NextResponse.json({ success: false, message: "Notification not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err?.message || "Failed to delete notification" },
      { status: 500 }
    );
  }
}
