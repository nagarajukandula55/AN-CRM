import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import AnuIssue from "@/models/AnuIssue";
import { getEnrichedSession } from "@/lib/auth/session-enriched";

const ALLOWED_STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED"];

/**
 * PATCH /api/anu/issues/[id] — admin action on a reported issue: change
 * status, and optionally attach resolutionNotes when closing it out.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const { id } = await params;

    const body = await req.json().catch(() => ({}));
    const status = String(body?.status || "");
    const resolutionNotes = body?.resolutionNotes ? String(body.resolutionNotes).trim() : undefined;

    if (!ALLOWED_STATUSES.includes(status)) {
      return NextResponse.json({ success: false, message: "Invalid status" }, { status: 400 });
    }

    const update: Record<string, unknown> = { status };
    if (resolutionNotes !== undefined) update.resolutionNotes = resolutionNotes;
    if (status === "RESOLVED") {
      update.resolvedAt = new Date();
      update.resolvedBy = session.user.id;
    }

    const updated = await AnuIssue.findByIdAndUpdate(id, update, { new: true }).lean();

    if (!updated) {
      return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, item: updated });
  } catch (err: any) {
    console.error("ANu issue PATCH error:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
