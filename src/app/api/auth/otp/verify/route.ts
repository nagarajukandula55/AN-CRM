/**
 * POST /api/auth/otp/verify — PUBLIC. Second step of phone-OTP login:
 * checks the code against api/auth/otp/send's stored hash and, on
 * success, issues the exact same session buildAuthSession gives a
 * password login -- centralBusinessAccess passed as [] here, same as
 * api/auth/login's own local-bcrypt-fallback path already does when it
 * authenticates without a fresh central-api business-access fetch (see
 * that route's own comment); buildAuthSession resolves real memberships
 * from BusinessMember itself regardless.
 */
import { NextRequest, NextResponse } from "next/server";
import bcryptjs from "bcryptjs";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import PhoneOtpLogin from "@/models/PhoneOtpLogin";
import { buildAuthSession } from "@/lib/auth/buildAuthSession";

const MAX_ATTEMPTS = 5;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const phone = String(body?.phone || "").replace(/\D/g, "").slice(-10);
    const otp = String(body?.otp || "").trim();

    if (!/^[6-9]\d{9}$/.test(phone) || !/^\d{6}$/.test(otp)) {
      return NextResponse.json({ success: false, message: "Enter the phone number and 6-digit code" }, { status: 400 });
    }

    await connectDB();

    const record = await PhoneOtpLogin.findOne({ phone });
    if (!record || record.otpExpiresAt.getTime() < Date.now()) {
      return NextResponse.json({ success: false, message: "OTP expired or not requested. Please request a new one." }, { status: 400 });
    }
    if (record.attempts >= MAX_ATTEMPTS) {
      return NextResponse.json({ success: false, message: "Too many attempts. Please request a new OTP." }, { status: 429 });
    }

    const matches = await bcryptjs.compare(otp, record.otpHash);
    if (!matches) {
      record.attempts += 1;
      await record.save();
      return NextResponse.json({ success: false, message: "Incorrect OTP" }, { status: 401 });
    }

    // Consumed -- a verified OTP can't be replayed.
    await PhoneOtpLogin.deleteOne({ _id: record._id });

    const user = await User.findOne({ phone, isActive: { $ne: false }, isDeleted: { $ne: true } }).lean() as any;
    if (!user) {
      return NextResponse.json({ success: false, message: "No account found for this number" }, { status: 404 });
    }

    const { token, safeUser } = await buildAuthSession(user, []);

    const res = NextResponse.json({ success: true, token, user: safeUser });
    res.cookies.set("an_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });
    return res;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
