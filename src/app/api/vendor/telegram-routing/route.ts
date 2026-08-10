import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Business from "@/models/Business";
import { getVendorTelegramMessageTypes } from "@/core/telegram/vendorMessageTypes";
import { sendVendorTelegramMessage } from "@/core/telegram/sendVendorTelegramMessage";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { resolveAuthorizedBusinessId } from "@/lib/auth/resolveAuthorizedBusinessId";

/**
 * Vendor-facing version of /api/businesses/[id]/telegram-routing -- same
 * config (Business.telegramChatId/telegramPersonalChatId/
 * telegramMessageRouting), but the business id is resolved from the
 * caller's OWN verified business instead of trusting a URL param, so a
 * vendor can only ever read/write their own business's routing, never
 * another vendor's. Lets an Owner/Manager set this up themselves from
 * console/admin/vendors/[id]/telegram's sibling at /vendor/telegram,
 * without needing AN Group staff to do it for them.
 *
 * BUG FIX: this used to resolve the business ONLY via resolveVendorContext
 * (VendorProfile ownership, or BusinessMember.vendorId-linked staff) --
 * plain business staff/owners with a real BusinessMember row but no
 * vendorId link (the common case outside the vendor-onboarding signup
 * flow) got null back, a silent 404, and an empty message-type list on
 * the page with no explanation. Now goes through the same
 * resolveAuthorizedBusinessId every other authenticated route uses,
 * which checks the session's own verified business first and only falls
 * back to resolveVendorContext for vendor Owners who have no
 * BusinessMember row at all.
 *
 * BUG FIX 2: resolveAuthorizedBusinessId's super-admin branch trusts
 * ONLY its `requestedBusinessId` argument (never the session-business
 * fallback) -- this was always calling it with `null` as that argument,
 * so a super admin viewing THEIR OWN business (Settings > This Business,
 * e.g. the AN-CRM Platform business itself) always got a 404 and an
 * empty Alert Routing / message-template list, even though their own
 * session.business.businessId was right there. Super admins are exactly
 * the account meant to configure their own platform-wide Telegram setup
 * here too, not just view/manage other vendors' -- now passes the
 * session's own active business through as the "requested" id so a
 * super admin resolves to their own business the same way anyone else
 * does.
 */
async function resolveOwnBusinessId(): Promise<string | null> {
  const session = await getEnrichedSession();
  if (!session?.user) return null;
  return resolveAuthorizedBusinessId(
    session.user.id,
    session.business?.businessId || null,
    !!session.isSuperAdmin,
    session.business?.businessId || null
  );
}

export async function GET() {
  await connectDB();
  const businessId = await resolveOwnBusinessId();
  if (!businessId) {
    return NextResponse.json({ success: false, message: "Vendor business not found" }, { status: 404 });
  }
  const [business, messageTypes] = await Promise.all([
    Business.findById(businessId).select("name telegramChatId telegramPersonalChatId telegramMessageRouting").lean<any>(),
    getVendorTelegramMessageTypes(),
  ]);
  if (!business) {
    return NextResponse.json({ success: false, message: "Business not found" }, { status: 404 });
  }
  return NextResponse.json({
    success: true,
    businessName: business.name,
    telegramChatId: business.telegramChatId || "",
    telegramPersonalChatId: business.telegramPersonalChatId || "",
    telegramMessageRouting: business.telegramMessageRouting || {},
    messageTypes,
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
    for (const [key, entry] of Object.entries(body.telegramMessageRouting)) {
      if (entry && typeof entry === "object") {
        routing[key] = { group: !!(entry as any).group, personal: !!(entry as any).personal };
      }
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
