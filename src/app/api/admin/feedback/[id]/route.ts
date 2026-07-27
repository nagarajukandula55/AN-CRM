import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Feedback from "@/models/Feedback";

const ALLOWED_STATUSES = ["NEW", "READ", "RESOLVED"];

/**
 * PATCH /api/admin/feedback/[id] — update status (mark read/resolved).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    const { id } = await params;

    const body = await req.json().catch(() => ({}));
    const status = String(body?.status || "");

    if (!ALLOWED_STATUSES.includes(status)) {
      return NextResponse.json({ success: false, message: "Invalid status" }, { status: 400 });
    }

    const updated = await Feedback.findByIdAndUpdate(id, { status }, { new: true }).lean();

    if (!updated) {
      return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, item: updated });
  } catch (err: any) {
    console.error("Admin feedback PATCH error:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
