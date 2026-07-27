import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import CreditAccount from "@/models/CreditAccount";
import VendorProfile from "@/models/VendorProfile";
import { getB2BSession } from "@/lib/auth/b2bSession";
import { getDaysOverdue } from "@/core/credit/creditLedger";

export async function GET() {
  try {
    const session = await getB2BSession();
    if (!session) return NextResponse.json({ success: false, message: "Not logged in" }, { status: 401 });

    await connectDB();
    const [account, vendor] = await Promise.all([
      CreditAccount.findById(session.accountId).lean(),
      VendorProfile.findById(session.vendorId).select("vendorId companyName").lean(),
    ]);
    if (!account) return NextResponse.json({ success: false, message: "Account not found" }, { status: 404 });

    const daysOverdue = await getDaysOverdue(session.accountId);

    return NextResponse.json({
      success: true,
      account: { ...account, daysOverdue },
      vendor,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
