import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import Business from "@/models/Business";
import { resolveVendorContext } from "@/lib/auth/vendorContext";
import { VENDOR_TELEGRAM_MESSAGE_TYPES, VENDOR_TELEGRAM_MESSAGE_TYPE_KEYS } from "@/core/telegram/vendorMessageTypes";
import { sendVendorTelegramMessage } from "@/core/telegram/sendVendorTelegramMessage";

/**
 * Vendor-facing version of /api/businesses/[id]/telegram-routing -- same
 * config (Business.telegramChatId/telegramPersonalChatId/
 * telegramMessageRouting), but the business id is resolved from the
 * caller's OWN vendor context (resolveVendorContext) instead of trusting a
 * URL param, so a vendor can only ever read/write their own business's
 * routing, never another vendor's. Lets an Owner/Manager set this up
 * themselves from console/admin/vendors/[id]/telegram's sibling at
 * /vendor/telegram, without needing AN Group staff to do it for them.
 */
async function resolveOwnBusinessId(): Promise<string | null> {
  const h = await headers();
  const userId = h.get("x-user-id");
  if (!userId) return null;
  const ctx = await resolveVendorContext(userId);
  const businessId = (ctx?.vendor as any)?.businessId;
  return businessId ? String(businessId) : null;
}

export async function GET() {
  await connectDB();
  const businessId = await resolveOwnBusinessId();
  if (!businessId) {
    return NextResponse.json({ success: false, message: "Vendor business not found" }, { status: 404 });
  }
  const business = await Business.findById(businessId)
    .select("name telegramChatId telegramPersonalChatId telegramMessageRouting")
    .lean<any>();
  if (!business) {
    return NextResponse.json({ success: false, message: "Business not found" }, { status: 404 });
  }
  return NextResponse.json({
    success: true,
    businessName: business.name,
    telegramChatId: business.telegramChatId || "",
    telegramPersonalChatId: business.telegramPersonalChatId || "",
    telegramMessageRouting: business.telegramMessageRouting || {},
    messageTypes: VENDOR_TELEGRAM_MESSAGE_TYPES,
  });
}

export async function PUT(req: NextRequest) {
  await connectDB();
  const businessId = await resolveOwnBusinessId();
  if (!businessId) {
    return NextResponse.json({ success: false, message: "Vendor business not found" }, { status: 404 });
  }
  const body = await req.json().catch(() => ({}));

  const update: Record<string, unknown> = {};
  if (typeof body.telegramChatId === "string") update.telegramChatId = body.telegramChatId.trim();
  if (typeof body.telegramPersonalChatId === "string") update.telegramPersonalChatId = body.telegramPersonalChatId.trim();

  if (body.telegramMessageRouting && typeof body.telegramMessageRouting === "object") {
    const routing: Record<string, { group: boolean; personal: boolean }> = {};
    for (const key of VENDOR_TELEGRAM_MESSAGE_TYPE_KEYS) {
      const entry = body.telegramMessageRouting[key];
      if (entry) routing[key] = { group: !!entry.group, personal: !!entry.personal };
    }
    update.telegramMessageRouting = routing;
  }

  const business = await Business.findByIdAndUpdate(businessId, { $set: update }, { new: true })
    .select("telegramChatId telegramPersonalChatId telegramMessageRouting")
    .lean<any>();
  return NextResponse.json({ success: true, business });
}

// Lets an Owner/Manager send a test message to verify their chat IDs are
// wired correctly, using whatever they've saved -- same underlying send as
// the admin panel's "Send Now", scoped to their own business.
export async function POST(req: NextRequest) {
  await connectDB();
  const businessId = await resolveOwnBusinessId();
  if (!businessId) {
    return NextResponse.json({ success: false, message: "Vendor business not found" }, { status: 404 });
  }
  const body = await req.json().catch(() => ({}));
  const text: string = String(body.text || "Test message from your Telegram bot setup.").trim();
  const sent = await sendVendorTelegramMessage(businessId, "GENERAL_ANNOUNCEMENT", text);
  return NextResponse.json({ success: true, sent });
}
