import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import VendorProfile from "@/models/VendorProfile";
import CreditAccount from "@/models/CreditAccount";
import { comparePassword } from "@/lib/auth/password";
import { signB2BToken, B2B_COOKIE_NAME } from "@/lib/auth/b2bSession";

// POST /api/b2b/:vendorCode/login — public. Only ACTIVE accounts (vendor-
// approved) can actually sign in; PENDING/REJECTED get a clear reason.
export async function POST(req: NextRequest, { params }: { params: Promise<{ vendorCode: string }> }) {
  try {
    const { vendorCode } = await params;
    await connectDB();

    const vendor = await VendorProfile.findOne({ vendorId: vendorCode }).select("_id businessId enableB2BOrdering");
    if (!vendor || !(vendor as any).enableB2BOrdering) {
      return NextResponse.json({ success: false, message: "B2B ordering isn't available for this vendor." }, { status: 404 });
    }

    const body = await req.json();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");

    const account = await CreditAccount.findOne({ vendorId: vendor._id, email }).select("+passwordHash");
    if (!account || !account.passwordHash || !(await comparePassword(password, account.passwordHash))) {
      return NextResponse.json({ success: false, message: "Invalid email or password." }, { status: 401 });
    }
    if (account.status === "PENDING") {
      return NextResponse.json({ success: false, message: "Your account is still pending vendor approval." }, { status: 403 });
    }
    if (account.status !== "ACTIVE") {
      return NextResponse.json({ success: false, message: "Your account isn't active. Contact the vendor." }, { status: 403 });
    }

    const token = signB2BToken({
      accountId: String(account._id),
      vendorId: String(vendor._id),
      businessId: String((vendor as any).businessId),
      type: account.type,
      name: account.name,
    });

    const res = NextResponse.json({ success: true, account: { name: account.name, type: account.type } });
    res.cookies.set(B2B_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
    });
    return res;
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
