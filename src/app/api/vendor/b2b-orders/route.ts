import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import B2BOrder from "@/models/B2BOrder";
import CreditAccount from "@/models/CreditAccount";
import { resolveVendorContext } from "@/lib/auth/vendorContext";

// GET /api/vendor/b2b-orders — every order placed against this vendor
// through the B2B portal, across all their Distributor/Retailer accounts.
export async function GET() {
  try {
    const headersList = await headers();
    const userId = headersList.get("x-user-id");
    if (!userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    await connectDB();
    const ctx = await resolveVendorContext(userId);
    if (!ctx) return NextResponse.json({ success: false, message: "Vendor profile not found" }, { status: 404 });
    const vendor = ctx.vendor as any;

    const orders = await B2BOrder.find({ vendorId: vendor._id }).sort({ createdAt: -1 }).lean();
    const accountIds = Array.from(new Set(orders.map((o: any) => String(o.accountId))));
    const accounts = await CreditAccount.find({ _id: { $in: accountIds } }).select("name type").lean();
    const nameById = new Map(accounts.map((a: any) => [String(a._id), a]));

    const enriched = orders.map((o: any) => ({ ...o, account: nameById.get(String(o.accountId)) || null }));
    return NextResponse.json({ success: true, data: enriched });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
