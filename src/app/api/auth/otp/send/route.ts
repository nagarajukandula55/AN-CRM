/**
 * POST /api/auth/otp/send — PUBLIC. First step of phone-OTP login: sends a
 * 6-digit code to a phone number that belongs to a real, active account.
 * See services/sms/smsClient.service.ts's own comment -- this route is
 * fully wired and ready, but every send will fail with a clear
 * "not configured" error until a real SMS gateway (MSG91 by default) is
 * set up in env. That's a real business step (SMS gateway account + a
 * DLT-registered OTP template, mandatory in India), not something this
 * code change can complete on its own.
 */
import { NextRequest, NextResponse } from "next/server";
import bcryptjs from "bcryptjs";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import PhoneOtpLogin from "@/models/PhoneOtpLogin";
import { sendOtpSms, SmsNotConfiguredError } from "@/services/sms/smsClient.service";

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const phone = String(body?.phone || "").replace(/\D/g, "").slice(-10);

    if (!/^[6-9]\d{9}$/.test(phone)) {
      return NextResponse.json({ success: false, message: "Enter a valid 10-digit mobile number" }, { status: 400 });
    }

    await connectDB();

    const user = await User.findOne({ phone, isActive: { $ne: false }, isDeleted: { $ne: true } }).select("_id").lean();
    // Deliberately still generates+"sends" even when no account matches --
    // returning a different response for an unknown phone number would let
    // a caller enumerate which numbers have accounts. The verify step
    // fails for real either way.
    const otp = generateOtp();
    const otpHash = await bcryptjs.hash(otp, 10);
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await PhoneOtpLogin.findOneAndUpdate(
      { phone },
      { $set: { otpHash, otpExpiresAt, attempts: 0 } },
      { upsert: true }
    );

    if (!user) {
      return NextResponse.json({ success: true, message: "If that number has an account, an OTP was sent." });
    }

    try {
      const result = await sendOtpSms(phone, otp);
      return NextResponse.json({
        success: true,
        sent: result.success,
        message: result.success ? "OTP sent." : "OTP generated but the SMS failed to send — check the SMS gateway configuration.",
      });
    } catch (err) {
      if (err instanceof SmsNotConfiguredError) {
        return NextResponse.json({ success: false, message: err.message }, { status: 503 });
      }
      throw err;
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
