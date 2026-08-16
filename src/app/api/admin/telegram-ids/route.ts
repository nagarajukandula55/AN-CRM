/**
 * GET/PUT /api/admin/telegram-ids — super-admin-only list-and-edit of
 * every VENDOR's Group/Personal Telegram chat ID in one screen, instead
 * of having to open each vendor's own console/admin/vendors/[id]/telegram
 * page one at a time. Same underlying fields that page and the bot's
 * /link flow both read/write (VendorProfile.telegramChatId /
 * telegramPersonalChatId).
 *
 * BUG FIX (this pass): this used to list BUSINESSES with a vendorId
 * looked up via a Map keyed by businessId -- now that many vendors share
 * one Business, that Map silently collapsed to "whichever vendor was
 * iterated last" for every business with more than one vendor, so a row
 * shown as e.g. "My Biz Flow — VND0004" was actually a mislabeled shared
 * Business document, not that specific vendor's own data (the exact bug
 * reported). Lists VendorProfile rows directly now -- one row per real
 * vendor, each with its own independent chat fields.
 */
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import VendorProfile from "@/models/VendorProfile";
import { getEnrichedSession } from "@/lib/auth/session-enriched";

async function requireSuperAdmin(): Promise<{ ok: true } | { ok: false; res: NextResponse }> {
  const session = await getEnrichedSession();
  if (!session?.user) {
    return { ok: false, res: NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 }) };
  }
  if (!session.isSuperAdmin) {
    return { ok: false, res: NextResponse.json({ success: false, message: "Super admin only" }, { status: 403 }) };
  }
  return { ok: true };
}

export async function GET() {
  const auth = await requireSuperAdmin();
  if (!auth.ok) return auth.res;

  await connectDB();
  const vendors = await VendorProfile.find({ isDeleted: { $ne: true } })
    .select("vendorId companyName parentVendorId telegramChatId telegramPersonalChatId telegramReportFrequency")
    .sort({ companyName: 1 })
    .lean();

  return NextResponse.json({
    success: true,
    businesses: vendors.map((v: any) => ({
      _id: String(v._id),
      name: v.companyName,
      vendorId: v.vendorId || null,
      isSubVendor: !!v.parentVendorId,
      telegramChatId: v.telegramChatId || "",
      telegramPersonalChatId: v.telegramPersonalChatId || "",
      telegramReportFrequency: v.telegramReportFrequency || "NONE",
    })),
  });
}

export async function PUT(req: NextRequest) {
  const auth = await requireSuperAdmin();
  if (!auth.ok) return auth.res;

  await connectDB();
  const body = await req.json().catch(() => ({}));
  const { businessId: vendorObjectId, telegramChatId, telegramPersonalChatId } = body as {
    businessId?: string; // param name kept for the frontend contract; value is actually a VendorProfile._id now
    telegramChatId?: string;
    telegramPersonalChatId?: string;
  };
  if (!vendorObjectId) {
    return NextResponse.json({ success: false, message: "vendor id is required" }, { status: 400 });
  }

  await VendorProfile.findByIdAndUpdate(vendorObjectId, {
    $set: {
      telegramChatId: (telegramChatId || "").trim(),
      telegramPersonalChatId: (telegramPersonalChatId || "").trim(),
    },
  });

  return NextResponse.json({ success: true });
}
