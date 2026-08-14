/**
 * GET/PUT /api/admin/telegram-ids — super-admin-only list-and-edit of
 * every business's Group/Personal Telegram chat ID in one screen, instead
 * of having to open each vendor's own console/admin/vendors/[id]/telegram
 * page one at a time. Same underlying fields that page and the bot's
 * /link flow both read/write (Business.telegramChatId /
 * telegramPersonalChatId) -- this is just a faster bulk view/edit surface
 * on top of the same data, per explicit direction ("give me UI in super
 * admin to update or edit telegram IDs").
 */
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Business from "@/models/Business";
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
  const [businesses, vendors] = await Promise.all([
    Business.find({ isActive: true })
      .select("name brandName telegramChatId telegramPersonalChatId telegramReportFrequency")
      .sort({ name: 1 })
      .lean(),
    VendorProfile.find({ isDeleted: { $ne: true } }).select("vendorId businessId").lean(),
  ]);
  const vendorIdByBusiness = new Map(vendors.map((v: any) => [String(v.businessId), v.vendorId]));

  return NextResponse.json({
    success: true,
    businesses: businesses.map((b: any) => ({
      _id: String(b._id),
      name: b.brandName || b.name,
      vendorId: vendorIdByBusiness.get(String(b._id)) || null,
      telegramChatId: b.telegramChatId || "",
      telegramPersonalChatId: b.telegramPersonalChatId || "",
      telegramReportFrequency: b.telegramReportFrequency || "NONE",
    })),
  });
}

export async function PUT(req: NextRequest) {
  const auth = await requireSuperAdmin();
  if (!auth.ok) return auth.res;

  await connectDB();
  const body = await req.json().catch(() => ({}));
  const { businessId, telegramChatId, telegramPersonalChatId } = body as {
    businessId?: string;
    telegramChatId?: string;
    telegramPersonalChatId?: string;
  };
  if (!businessId) {
    return NextResponse.json({ success: false, message: "businessId is required" }, { status: 400 });
  }

  await Business.findByIdAndUpdate(businessId, {
    $set: {
      telegramChatId: (telegramChatId || "").trim(),
      telegramPersonalChatId: (telegramPersonalChatId || "").trim(),
    },
  });

  return NextResponse.json({ success: true });
}
