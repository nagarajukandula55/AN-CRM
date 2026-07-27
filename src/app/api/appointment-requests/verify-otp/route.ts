/**
 * POST /api/appointment-requests/verify-otp — PUBLIC. Second step: checks
 * the OTP, and on success issues a short-lived `verificationToken` the
 * client must include when actually submitting the appointment request
 * (POST /api/appointment-requests). This is what stops someone submitting
 * a request with an email they don't own but never actually completing
 * this step.
 */
import { NextRequest, NextResponse } from "next/server";
import bcryptjs from "bcryptjs";
import crypto from "crypto";
import { connectDB } from "@/lib/mongodb";
import PublicEmailVerification from "@/models/PublicEmailVerification";

const PURPOSE = "APPOINTMENT_REQUEST";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body?.email || "").toLowerCase().trim();
    const otp = String(body?.otp || "").trim();

    if (!email || !otp) {
      return NextResponse.json({ success: false, message: "email and otp are required" }, { status: 400 });
    }

    await connectDB();

    const record = await PublicEmailVerification.findOne({ email, purpose: PURPOSE });
    if (!record) {
      return NextResponse.json({ success: false, message: "No OTP was sent to this email. Request a new one." }, { status: 404 });
    }
    if (record.otpExpiresAt < new Date()) {
      return NextResponse.json({ success: false, message: "OTP expired. Request a new one." }, { status: 400 });
    }

    const isValid = await bcryptjs.compare(otp, record.otpHash);
    if (!isValid) {
      return NextResponse.json({ success: false, message: "Incorrect OTP" }, { status: 400 });
    }

    const token = crypto.randomBytes(24).toString("hex");
    record.verified = true;
    record.token = token;
    record.tokenExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await record.save();

    return NextResponse.json({ success: true, verificationToken: token });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
