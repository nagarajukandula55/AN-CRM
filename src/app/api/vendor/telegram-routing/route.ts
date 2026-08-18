import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import VendorProfile from "@/models/VendorProfile";
import { getVendorTelegramMessageTypes } from "@/core/telegram/vendorMessageTypes";
import { sendVendorTelegramMessage } from "@/core/telegram/sendVendorTelegramMessage";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { resolveVendorContext } from "@/lib/auth/vendorContext";
import Business from "@/models/Business";
import { getActivePlanKey, getAllowedModuleKeys } from "@/core/pricing/planAccess";

/**
 * Vendor-facing Telegram chat/routing config -- resolved from the
 * caller's OWN VendorProfile (owner or staff, via resolveVendorContext),
 * never a URL param, so a vendor can only ever read/write their own
 * chat/routing, never another vendor's.
 *
 * BUG FIX (this pass): this used to resolve the caller's BUSINESS and
 * read/write Business.telegramChatId/telegramPersonalChatId/
 * telegramMessageRouting -- but the platform is now single-Business/
 * multi-vendor (every vendor's VendorProfile shares one Business), so a
 * business-level field let only ONE vendor's chat be configured at a
 * time, platform-wide, no matter which vendor was actually logged in.
 * Now resolves and writes the caller's own VendorProfile instead (see
 * models/VendorProfile.ts's telegram* fields).
 */
async function resolveOwnVendor() {
  const session = await getEnrichedSession();
  if (!session?.user) return null;
  const ctx = await resolveVendorContext(session.user.id);
  return ctx?.vendor || null;
}

export async function GET() {
  await connectDB();
  const vendor = await resolveOwnVendor();
  if (!vendor) {
    return NextResponse.json({ success: false, message: "Vendor profile not found" }, { status: 404 });
  }
  const messageTypes = await getVendorTelegramMessageTypes();
  return NextResponse.json({
    success: true,
    businessName: vendor.companyName,
    telegramChatId: vendor.telegramChatId || "",
    telegramPersonalChatId: vendor.telegramPersonalChatId || "",
    telegramMessageRouting: vendor.telegramMessageRouting || {},
    // The Daily/Weekly/Monthly automated business report's own schedule --
    // previously only ever written to Business.telegramReportFrequency
    // (dead field, nothing reads it since the report moved to
    // VendorProfile -- see resolveVendorChatConfig.ts), so a vendor had no
    // actual way to turn this on. Read/written here instead, same as every
    // other telegram* field on this vendor's own profile.
    telegramReportFrequency: vendor.telegramReportFrequency || "NONE",
    telegramReportTime: vendor.telegramReportTime || "09:00",
    messageTypes,
  });
}

export async function PUT(req: NextRequest) {
  await connectDB();
  const vendor = await resolveOwnVendor();
  if (!vendor) {
    return NextResponse.json({ success: false, message: "Vendor profile not found" }, { status: 404 });
  }
  const body = await req.json().catch(() => ({}));

  if (typeof body.telegramChatId === "string") vendor.telegramChatId = body.telegramChatId.trim();
  if (typeof body.telegramPersonalChatId === "string") vendor.telegramPersonalChatId = body.telegramPersonalChatId.trim();
  if (["NONE", "DAILY", "WEEKLY", "MONTHLY"].includes(body.telegramReportFrequency)) {
    // Server-side enforcement of the "telegram-reports" plan feature --
    // same check api/businesses/[id]/route.ts already does for the (dead)
    // Business-level field, now actually load-bearing here.
    if (body.telegramReportFrequency !== "NONE" && vendor.businessId) {
      const biz = await Business.findById(vendor.businessId).select("operatingMode").lean<any>();
      if (biz?.operatingMode) {
        const plan = await getActivePlanKey(String(vendor.businessId));
        const allowed = await getAllowedModuleKeys(biz.operatingMode, plan);
        if (allowed && !allowed.includes("telegram-reports")) {
          return NextResponse.json({ success: false, message: "Automatic Telegram reports aren't included in your current plan" }, { status: 403 });
        }
      }
    }
    vendor.telegramReportFrequency = body.telegramReportFrequency;
  }
  if (typeof body.telegramReportTime === "string" && /^\d{2}:\d{2}$/.test(body.telegramReportTime)) {
    vendor.telegramReportTime = body.telegramReportTime;
  }

  if (body.telegramMessageRouting && typeof body.telegramMessageRouting === "object") {
    const routing: Record<string, { group: boolean; personal: boolean }> = {};
    for (const [key, entry] of Object.entries(body.telegramMessageRouting)) {
      if (entry && typeof entry === "object") {
        routing[key] = { group: !!(entry as any).group, personal: !!(entry as any).personal };
      }
    }
    vendor.telegramMessageRouting = routing;
  }

  await vendor.save();
  return NextResponse.json({
    success: true,
    vendor: {
      telegramChatId: vendor.telegramChatId,
      telegramPersonalChatId: vendor.telegramPersonalChatId,
      telegramMessageRouting: vendor.telegramMessageRouting,
    },
  });
}

// Lets an Owner/Manager send a test message to verify their chat IDs are
// wired correctly, using whatever they've saved -- same underlying send as
// the admin panel's "Send Now", scoped to their own vendor.
export async function POST(req: NextRequest) {
  await connectDB();
  const vendor = await resolveOwnVendor();
  if (!vendor) {
    return NextResponse.json({ success: false, message: "Vendor profile not found" }, { status: 404 });
  }
  const body = await req.json().catch(() => ({}));
  const text: string = String(body.text || "Test message from your Telegram bot setup.").trim();
  const sent = await sendVendorTelegramMessage(String(vendor._id), "GENERAL_ANNOUNCEMENT", text);
  return NextResponse.json({ success: true, sent });
}
