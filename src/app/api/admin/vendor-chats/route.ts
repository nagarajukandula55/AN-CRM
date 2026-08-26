/**
 * GET /api/admin/vendor-chats — super-admin/platform-staff inbox: every
 * vendor with a linked personal Telegram chat and/or an existing support
 * conversation, most-recently-active first, with the last message preview
 * and unread (inbound, unread) count.
 *
 * Before this route existed, VendorChatMessage was readable/writable ONLY
 * from the vendor's own side (api/vendor/chat, VendorTelegramChat) -- there
 * was no way for anyone at AN Group to even SEE an inbound message from a
 * vendor, let alone reply to it, despite the webhook already storing every
 * one correctly isolated per vendor.
 */
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import VendorChatMessage from "@/models/VendorChatMessage";
import VendorProfile from "@/models/VendorProfile";
import { getEnrichedSession } from "@/lib/auth/session-enriched";

export async function GET() {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    // Same x-is-super-admin/x-is-platform-staff headers console/admin/
    // layout.tsx gates the page on -- IEnrichedSession only carries
    // isSuperAdmin, not platform-staff, so that's read directly here too
    // (defense in depth for this route, not just the page).
    const h = await headers();
    const isSuperAdmin = session.isSuperAdmin || h.get("x-is-super-admin") === "true";
    const isPlatformStaff = h.get("x-is-platform-staff") === "true";
    if (!isSuperAdmin && !isPlatformStaff) {
      return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
    }

    await connectDB();

    const threads = await VendorChatMessage.aggregate([
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: "$vendorId",
          lastMessage: { $first: "$text" },
          lastDirection: { $first: "$direction" },
          lastAt: { $first: "$createdAt" },
          unreadCount: {
            $sum: { $cond: [{ $and: [{ $eq: ["$direction", "inbound"] }, { $eq: ["$isRead", false] }] }, 1, 0] },
          },
        },
      },
      { $sort: { lastAt: -1 } },
    ]);

    const vendorIds = threads.map((t) => t._id);
    const vendors = await VendorProfile.find({ _id: { $in: vendorIds } })
      .select("vendorId companyName contactPerson telegramPersonalChatId")
      .lean();
    const vendorById = new Map(vendors.map((v: any) => [String(v._id), v]));

    const rows = threads
      .map((t) => {
        const v = vendorById.get(String(t._id));
        if (!v) return null;
        return {
          vendorId: String(t._id),
          vendorCode: v.vendorId,
          companyName: v.companyName || "Vendor",
          contactPerson: v.contactPerson,
          hasTelegramLinked: !!v.telegramPersonalChatId,
          lastMessage: t.lastMessage,
          lastDirection: t.lastDirection,
          lastAt: t.lastAt,
          unreadCount: t.unreadCount,
        };
      })
      .filter(Boolean);

    return NextResponse.json({ success: true, threads: rows });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
