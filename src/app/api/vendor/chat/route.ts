import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import VendorChatMessage from "@/models/VendorChatMessage";
import { resolveVendorContext } from "@/lib/auth/vendorContext";
import { sendTelegramMessage } from "@/lib/telegram";

// GET /api/vendor/chat — this vendor's own support chat history, oldest
// first. Scoped by vendorId via resolveVendorContext (owner or staff of
// THIS vendor only) -- never any other vendor's messages.
export async function GET() {
  try {
    const headersList = await headers();
    const userId = headersList.get("x-user-id");
    if (!userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    await connectDB();
    const ctx = await resolveVendorContext(userId);
    if (!ctx) return NextResponse.json({ success: false, message: "Vendor profile not found" }, { status: 404 });

    const vendor = ctx.vendor as any;
    const messages = await VendorChatMessage.find({ vendorId: vendor._id }).sort({ createdAt: 1 }).limit(200).lean();

    // Mark inbound messages read the moment the vendor actually opens the
    // chat (this GET), not on every poll -- callers that just poll for
    // new messages in the background shouldn't silently mark them read
    // before the vendor has seen them, but this route IS "the vendor
    // opened the chat", so it's the right place for it.
    await VendorChatMessage.updateMany(
      { vendorId: vendor._id, direction: "inbound", isRead: false },
      { $set: { isRead: true } }
    );

    return NextResponse.json({
      success: true,
      messages,
      telegramLinked: !!vendor.telegramPersonalChatId,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

// POST /api/vendor/chat — send a message from the vendor to their linked
// personal Telegram chat. Requires telegramPersonalChatId to already be
// linked (see api/vendor/telegram-link-code) -- there's no "chat" without
// a real Telegram destination to send to.
export async function POST(req: NextRequest) {
  try {
    const headersList = await headers();
    const userId = headersList.get("x-user-id");
    if (!userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const text = String(body?.text || "").trim();
    if (!text) return NextResponse.json({ success: false, message: "Message text is required" }, { status: 400 });
    if (text.length > 4000) return NextResponse.json({ success: false, message: "Message is too long" }, { status: 400 });

    await connectDB();
    const ctx = await resolveVendorContext(userId);
    if (!ctx) return NextResponse.json({ success: false, message: "Vendor profile not found" }, { status: 404 });

    const vendor = ctx.vendor as any;
    if (!vendor.telegramPersonalChatId) {
      return NextResponse.json(
        { success: false, message: "Link your personal Telegram chat first (Telegram Alerts page) before starting a chat." },
        { status: 400 }
      );
    }

    const sent = await sendTelegramMessage(text, { chatId: vendor.telegramPersonalChatId });
    if (!sent) {
      return NextResponse.json({ success: false, message: "Failed to send -- Telegram may be unreachable, try again." }, { status: 502 });
    }

    const message = await VendorChatMessage.create({
      vendorId: vendor._id,
      businessId: vendor.businessId,
      direction: "outbound",
      text,
    });

    return NextResponse.json({ success: true, message });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
