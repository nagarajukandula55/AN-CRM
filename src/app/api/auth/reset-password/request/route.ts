import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import { sendPasswordResetEmail } from "@/services/email/resend.service";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { logAction } from "@/lib/audit/logAction";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes

// Generous but real caps: 5 requests / 15 min per email, 20 / 15 min per IP
// — slows down both "spam one victim's inbox" and "enumerate many emails
// from one source" without needing shared infra (see rateLimit.ts).
const EMAIL_LIMIT = 5;
const IP_LIMIT = 20;
const WINDOW_MS = 15 * 60 * 1000;

/**
 * POST /api/auth/reset-password/request — PUBLIC. Body: { email }.
 *
 * Always responds with the same generic message regardless of whether the
 * account exists, is SSO-only, or the email failed to send — this
 * intentionally does not leak account existence to the caller.
 */
export async function POST(req: NextRequest) {
  const genericResponse = NextResponse.json({
    success: true,
    message: "If an account with that email exists, a reset link has been sent.",
  });

  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body?.email || "").toLowerCase().trim();

    if (!email || !EMAIL_REGEX.test(email)) {
      return NextResponse.json({ success: false, message: "Valid email is required" }, { status: 400 });
    }

    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";

    if (!checkRateLimit(`reset-req:email:${email}`, EMAIL_LIMIT, WINDOW_MS)) {
      return genericResponse; // don't reveal that a limit was hit
    }
    if (!checkRateLimit(`reset-req:ip:${ip}`, IP_LIMIT, WINDOW_MS)) {
      return genericResponse;
    }

    await connectDB();

    // password has select:false — must explicitly request it, otherwise
    // every account looks passwordless and this always takes the
    // generic-response early-exit below without ever sending an email.
    const user = await User.findOne({ email, isDeleted: { $ne: true }, isActive: true }).select("+password");

    // No account, or SSO-only (no password to reset) — respond identically.
    if (!user || !user.password) {
      return genericResponse;
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    user.resetPasswordTokenHash = tokenHash;
    user.resetPasswordExpires = new Date(Date.now() + TOKEN_TTL_MS);
    await user.save();

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const resetUrl = `${appUrl}/reset-password?token=${rawToken}`;

    try {
      await sendPasswordResetEmail({
        to: user.email,
        resetUrl,
        businessId: user.defaultBusinessId?.toString(),
      });
    } catch (emailErr) {
      console.error("RESET PASSWORD EMAIL ERROR", emailErr);
      // Still respond generically — don't leak whether the send failed.
    }

    logAction({
      action: "REQUEST_PASSWORD_RESET",
      entity: "User",
      entityId: user._id.toString(),
      req,
      actor: { id: user._id.toString() },
    });

    return genericResponse;
  } catch (err) {
    console.error("Password reset request error:", err);
    // Even on unexpected error, don't leak internals via a generic auth flow.
    return genericResponse;
  }
}
