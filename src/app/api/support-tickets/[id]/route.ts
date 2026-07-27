import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import SupportTicket from "@/models/SupportTicket";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";

// PATCH /api/support-tickets/[id] -- admin reply and/or status change.
// Body: { message?, status? }
export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("support_tickets", "edit"));
    } catch (err: any) {
      return NextResponse.json({ success: false, message: err.message }, { status: err.code === "FORBIDDEN" ? 403 : 401 });
    }

    await connectDB();
    const { id } = await context.params;
    const body = await req.json();

    const ticket = await SupportTicket.findById(id);
    if (!ticket) {
      return NextResponse.json({ success: false, message: "Ticket not found" }, { status: 404 });
    }

    if (body.message?.trim()) {
      ticket.messages.push({
        from: "ADMIN",
        message: body.message.trim(),
        authorName: session.user.name || "Support",
        createdAt: new Date(),
      });
    }
    if (body.status && ["OPEN", "IN_PROGRESS", "CLOSED"].includes(body.status)) {
      ticket.status = body.status;
    }
    await ticket.save();

    return NextResponse.json({ success: true, ticket });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}
