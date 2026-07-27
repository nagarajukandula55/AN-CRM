import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import SupportTicket from "@/models/SupportTicket";

// PUBLIC -- lookup by the ticket's own token (functions as the shared
// secret; nothing else identifies the caller, matching a guest-checkout
// order-tracking pattern already used elsewhere on the storefront).
export async function GET(req: NextRequest, context: { params: Promise<{ ticketNumber: string }> }) {
  try {
    await connectDB();
    const { ticketNumber } = await context.params;

    const ticket = await SupportTicket.findOne({ ticketNumber: ticketNumber.toUpperCase() })
      .select("ticketNumber subject status messages createdAt updatedAt")
      .lean();

    if (!ticket) {
      return NextResponse.json({ success: false, message: "Ticket not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, ticket });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}

// POST -- customer adds a follow-up message to their own ticket. Re-opens
// a closed ticket back to IN_PROGRESS so the admin queue actually surfaces
// it again instead of the update silently landing on a ticket no one's
// looking at anymore.
export async function POST(req: NextRequest, context: { params: Promise<{ ticketNumber: string }> }) {
  try {
    await connectDB();
    const { ticketNumber } = await context.params;
    const body = await req.json();

    if (!body.message?.trim()) {
      return NextResponse.json({ success: false, message: "message is required" }, { status: 400 });
    }

    const ticket = await SupportTicket.findOne({ ticketNumber: ticketNumber.toUpperCase() });
    if (!ticket) {
      return NextResponse.json({ success: false, message: "Ticket not found" }, { status: 404 });
    }

    ticket.messages.push({
      from: "CUSTOMER",
      message: body.message.trim(),
      authorName: ticket.name,
      createdAt: new Date(),
    });
    if (ticket.status === "CLOSED") ticket.status = "IN_PROGRESS";
    await ticket.save();

    return NextResponse.json({ success: true, ticket: { ticketNumber: ticket.ticketNumber, status: ticket.status, messages: ticket.messages } });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}
