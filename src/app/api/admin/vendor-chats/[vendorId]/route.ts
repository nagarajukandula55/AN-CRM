/**
 * GET  /api/admin/vendor-chats/[vendorId] — one vendor's full support
 *      thread, most-recently-active last (chat reading order); marks every
 *      unread inbound message as read as a side effect of viewing it.
 * POST /api/admin/vendor-chats/[vendorId] — send a reply: stores it as an
 *      outbound VendorChatMessage (so the console side of this thread stays
 *      a complete record) AND delivers it through the same bot to that
 *      vendor's own linked personal Telegram chat -- the vendor sees it in
 *      their own Telegram app exactly like a message from a human, and it
 *      also shows up in their /vendor/telegram support-chat panel.
 */
import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import VendorChatMessage from "@/models/VendorChatMessage";
import VendorProfile from "@/models/VendorProfile";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { sendTelegramMessage } from "@/lib/telegram";

async function requireAdmin() {
  const session = await getEnrichedSession();
  if (!session?.user) return { error: NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 }) };
  // Same x-is-super-admin/x-is-platform-staff headers console/admin/
  // layout.tsx gates the page on -- IEnrichedSession only carries
  // isSuperAdmin, not platform-staff, so that's read directly here too.
  const h = await headers();
  const isSuperAdmin = session.isSuperAdmin || h.get("x-is-super-admin") === "true";
  const isPlatformStaff = h.get("x-is-platform-staff") === "true";
  if (!isSuperAdmin && !isPlatformStaff) {
    return { error: NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 }) };
  }
  return { session };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ vendorId: string }> }) {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const { vendorId } = await params;
    if (!mongoose.Types.ObjectId.isValid(vendorId)) {
      return NextResponse.json({ success: false, message: "Invalid vendor id" }, { status: 400 });
    }

    await connectDB();
    const vendor = await VendorProfile.findById(vendorId)
      .select("vendorId companyName contactPerson telegramPersonalChatId")
      .lean<any>();
    if (!vendor) {
      return NextResponse.json({ success: false, message: "Vendor not found" }, { status: 404 });
    }

    const messages = await VendorChatMessage.find({ vendorId }).sort({ createdAt: 1 }).lean();

    await VendorChatMessage.updateMany(
      { vendorId, direction: "inbound", isRead: false },
      { $set: { isRead: true } }
    );

    return NextResponse.json({
      success: true,
      vendor: {
        vendorId: String(vendor._id),
        vendorCode: vendor.vendorId,
        companyName: vendor.companyName,
        contactPerson: vendor.contactPerson,
        telegramLinked: !!vendor.telegramPersonalChatId,
      },
      messages,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ vendorId: string }> }) {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const { vendorId } = await params;
    if (!mongoose.Types.ObjectId.isValid(vendorId)) {
      return NextResponse.json({ success: false, message: "Invalid vendor id" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const text = String(body.text || "").trim();
    if (!text) {
      return NextResponse.json({ success: false, message: "Message text is required" }, { status: 400 });
    }

    await connectDB();
    const vendor = await VendorProfile.findById(vendorId).select("businessId telegramPersonalChatId").lean<any>();
    if (!vendor) {
      return NextResponse.json({ success: false, message: "Vendor not found" }, { status: 404 });
    }
    if (!vendor.telegramPersonalChatId) {
      return NextResponse.json(
        { success: false, message: "This vendor hasn't linked a personal Telegram chat yet" },
        { status: 400 }
      );
    }

    const sent = await sendTelegramMessage(text, { chatId: String(vendor.telegramPersonalChatId) }).catch(() => null);
    if (!sent) {
      return NextResponse.json({ success: false, message: "Failed to deliver via Telegram" }, { status: 502 });
    }

    const message = await VendorChatMessage.create({
      vendorId,
      businessId: vendor.businessId,
      direction: "outbound",
      text,
      isRead: true,
    });

    return NextResponse.json({ success: true, message });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
