import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/mongodb";
import ContactMessage from "@/models/ContactMessage";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";

/**
 * PATCH /api/contact/[id] — admin-only status update (mark READ/RESOLVED)
 * for a ContactMessage. Deliberately NOT covered by middleware.ts's public
 * treatment of the base "/api/contact" path -- that entry is an EXACT match
 * (PUBLIC_EXACT), not a prefix, so "/api/contact/<id>" still requires a
 * real session before this handler even runs.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("contact_messages", "edit"));
    } catch (err: any) {
      return NextResponse.json({ success: false, message: err.message }, { status: err.code === "FORBIDDEN" ? 403 : 401 });
    }

    const { id } = await params;
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: "Invalid id" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const status = body?.status;
    if (!["NEW", "READ", "RESOLVED"].includes(status)) {
      return NextResponse.json({ success: false, message: "Invalid status" }, { status: 400 });
    }

    await connectDB();

    const updated = await ContactMessage.findByIdAndUpdate(id, { status }, { new: true }).lean();
    if (!updated) {
      return NextResponse.json({ success: false, message: "Message not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: updated });
  } catch (err: any) {
    console.error("Contact [id] PATCH error:", err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
