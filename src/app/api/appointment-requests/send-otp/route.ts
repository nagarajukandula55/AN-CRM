/**
 * POST /api/appointment-requests/send-otp — PUBLIC. First step of the
 * public appointment-request flow: emails a 6-digit OTP to the address the
 * customer typed, before the actual request is accepted. Rate-limited only
 * by the fact that each call overwrites any prior unverified OTP for that
 * email+purpose (bcryptjs hash, 10-minute expiry) -- best-effort, not a
 * hardened auth surface, matching the rest of this app's OTP flows
 * (agreement signing).
 */
import { NextRequest, NextResponse } from "next/server";
import bcryptjs from "bcryptjs";
import { connectDB } from "@/lib/mongodb";
import PublicEmailVerification from "@/models/PublicEmailVerification";
import { sendVerificationOtpEmail } from "@/services/email/resend.service";

const PURPOSE = "APPOINTMENT_REQUEST";

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body?.email || "").toLowerCase().trim();
    const businessId = body?.businessId ? String(body.businessId) : undefined;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ success: false, message: "A valid email is required" }, { status: 400 });
    }

    await connectDB();

    const otp = generateOtp();
    const otpHash = await bcryptjs.hash(otp, 10);
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await PublicEmailVerification.findOneAndUpdate(
      { email, purpose: PURPOSE },
      { $set: { otpHash, otpExpiresAt, verified: false, token: undefined, tokenExpiresAt: undefined } },
      { upsert: true }
    );

    const emailResult = await sendVerificationOtpEmail({
      to: email,
      otp,
      purpose: "your appointment request",
      businessId,
    });

    return NextResponse.json({
      success: true,
      sent: emailResult.success,
      message: emailResult.success
        ? "OTP sent to your email."
        : "OTP generated but the email failed to send — check email integration configuration.",
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
