import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { logAction } from "@/lib/audit/logAction";

const SALT_ROUNDS = 12;
const MIN_LENGTH = 8;
const IP_LIMIT = 20;
const WINDOW_MS = 15 * 60 * 1000;

/**
 * POST /api/auth/reset-password — PUBLIC. Body: { token, newPassword }.
 *
 * The token is single-use (cleared immediately on success) and time-boxed
 * (resetPasswordExpires, checked server-side — never trust a client-side
 * expiry check). Looked up by the sha256 hash of the raw token, since only
 * the hash is ever persisted.
 */
export async function POST(req: NextRequest) {
  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    if (!checkRateLimit(`reset-confirm:ip:${ip}`, IP_LIMIT, WINDOW_MS)) {
      return NextResponse.json(
        { success: false, message: "Too many attempts. Please try again later." },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { token, newPassword } = body ?? {};

    if (!token || typeof token !== "string") {
      return NextResponse.json({ success: false, message: "Reset token is required" }, { status: 400 });
    }
    if (!newPassword || newPassword.length < MIN_LENGTH) {
      return NextResponse.json(
        { success: false, message: `New password must be at least ${MIN_LENGTH} characters` },
        { status: 400 }
      );
    }

    await connectDB();

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const user = await User.findOne({
      resetPasswordTokenHash: tokenHash,
      resetPasswordExpires: { $gt: new Date() },
      isDeleted: { $ne: true },
      isActive: true,
    }).select("+resetPasswordTokenHash +resetPasswordExpires");

    if (!user) {
      return NextResponse.json(
        { success: false, message: "This reset link is invalid or has expired" },
        { status: 400 }
      );
    }

    user.password = await bcrypt.hash(newPassword, SALT_ROUNDS);
    user.passwordChangedAt = new Date();
    // Single-use: clear the token immediately so it can never be replayed.
    user.resetPasswordTokenHash = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    logAction({
      action: "RESET_PASSWORD",
      entity: "User",
      entityId: user._id.toString(),
      req,
      actor: { id: user._id.toString(), email: user.email },
    });

    return NextResponse.json({
      success: true,
      message: "Password reset successfully. Please sign in with your new password.",
    });
  } catch (error: any) {
    console.error("Reset password error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
