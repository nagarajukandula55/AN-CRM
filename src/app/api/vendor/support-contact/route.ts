import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import Business from "@/models/Business";
import { resolveVendorContext } from "@/lib/auth/vendorContext";

// GET /api/vendor/support-contact — WhatsApp/Telegram support contact
// details for the vendor portal's Contact widget (see components/
// ContactWidget.tsx). Admin-configured at Settings > Business Profile.
export async function GET() {
  try {
    const headersList = await headers();
    const userId = headersList.get("x-user-id");
    if (!userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    await connectDB();
    const ctx = await resolveVendorContext(userId);
    if (!ctx || !(ctx.vendor as any).businessId) {
      return NextResponse.json({ success: true, whatsAppNumber: "", telegramUsername: "" });
    }

    const business = await Business.findById((ctx.vendor as any).businessId)
      .select("supportWhatsAppNumber supportTelegramUsername")
      .lean<any>();

    return NextResponse.json({
      success: true,
      whatsAppNumber: business?.supportWhatsAppNumber || "",
      telegramUsername: business?.supportTelegramUsername || "",
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
