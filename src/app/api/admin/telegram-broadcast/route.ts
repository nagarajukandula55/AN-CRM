import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import VendorProfile from "@/models/VendorProfile";
import { getEnrichedSession } from "@/lib/auth/session-enriched";

/**
 * GET /api/admin/telegram-broadcast — super-admin view of every vendor's
 * Telegram connection status, so a broadcast reminder can be sent to
 * exactly the ones who haven't connected yet, and the admin can see the
 * result (per explicit direction: "we also can show them the results").
 */
export async function GET(_req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.isSuperAdmin) {
      return NextResponse.json({ success: false, message: "Super admin only" }, { status: 403 });
    }

    await connectDB();
    const vendors = await VendorProfile.find({ isDeleted: { $ne: true }, status: "ACTIVE" })
      .select("vendorId companyName email telegramPersonalChatId telegramChatId")
      .sort({ companyName: 1 })
      .lean();

    const rows = vendors.map((v: any) => ({
      vendorId: v.vendorId,
      companyName: v.companyName,
      email: v.email,
      personalConnected: !!v.telegramPersonalChatId,
      groupConnected: !!v.telegramChatId,
    }));
    const connected = rows.filter((r) => r.personalConnected).length;

    return NextResponse.json({ success: true, vendors: rows, total: rows.length, connected, notConnected: rows.length - connected });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
