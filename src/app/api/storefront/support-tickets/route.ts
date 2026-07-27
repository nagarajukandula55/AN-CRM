import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Types } from "mongoose";
import SupportTicket from "@/models/SupportTicket";

// PUBLIC, unauthenticated -- any storefront visitor (logged in or not) can
// raise a ticket, matching guest checkout's own no-login-required design.
function generateTicketNumber() {
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `TKT-${Date.now().toString(36).toUpperCase()}-${rand}`;
}

// POST /api/storefront/support-tickets
// Body: { businessId, name, email?, phone?, orderId?, subject, message }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, email, phone, orderId, subject, message } = body;
    // an-sdk's client.ts attaches businessId as a query param on every
    // relative call automatically -- body.businessId as a fallback for any
    // caller that sends it explicitly instead.
    const businessId = req.nextUrl.searchParams.get("businessId") || body.businessId;

    if (!businessId || !Types.ObjectId.isValid(businessId)) {
      return NextResponse.json({ success: false, message: "businessId is required" }, { status: 400 });
    }
    if (!name?.trim() || !subject?.trim() || !message?.trim()) {
      return NextResponse.json({ success: false, message: "name, subject, and message are required" }, { status: 400 });
    }
    if (!email?.trim() && !phone?.trim()) {
      return NextResponse.json({ success: false, message: "email or phone is required so we can follow up" }, { status: 400 });
    }

    await connectDB();

    let ticketNumber = generateTicketNumber();
    // Vanishingly unlikely to collide, but retry once for safety since the
    // field is unique-indexed.
    while (await SupportTicket.exists({ ticketNumber })) {
      ticketNumber = generateTicketNumber();
    }

    const ticket = await SupportTicket.create({
      businessId,
      ticketNumber,
      name: name.trim(),
      email: email?.trim(),
      phone: phone?.trim(),
      orderId: orderId?.trim(),
      subject: subject.trim(),
      status: "OPEN",
      messages: [{ from: "CUSTOMER", message: message.trim(), authorName: name.trim(), createdAt: new Date() }],
    });

    return NextResponse.json({ success: true, ticketNumber: ticket.ticketNumber }, { status: 201 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}
