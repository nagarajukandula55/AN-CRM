/**
 * POST /api/auth/telegram/verify — completes "Login with Telegram" (the
 * official Telegram Login Widget, https://core.telegram.org/widgets/login).
 * The widget's JS callback hands the browser a signed payload
 * ({id, first_name, username, photo_url, auth_date, hash}); this route
 * re-derives that signature server-side (HMAC-SHA256 keyed on
 * SHA256(bot token), per Telegram's documented algorithm) and rejects
 * anything that doesn't match byte-for-byte -- the ONLY thing that proves
 * this data actually came from Telegram and wasn't forged by the caller.
 *
 * Matches the verified Telegram user id against VendorProfile.
 * telegramPersonalChatId (the same value webhook.ts stores when a vendor
 * links their personal chat via /start -- a private chat's id IS the
 * user's own Telegram id, same value space), then issues the exact same
 * session buildAuthSession gives password/OTP/Google login -- see
 * api/auth/otp/verify/route.ts's identical pattern.
 *
 * LOGIN only, not signup: a Telegram id with no linked vendor is
 * rejected with a clear message -- same reasoning as Google login (see
 * that route's own comment).
 */
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import VendorProfile from "@/models/VendorProfile";
import { buildAuthSession } from "@/lib/auth/buildAuthSession";
import { resolveLandingPath } from "@/core/access/vendorAccess.service";

const AUTH_DATE_MAX_AGE_SECONDS = 24 * 60 * 60; // Telegram's own recommended replay window

function verifyTelegramHash(data: Record<string, any>, botToken: string): boolean {
  const { hash, ...rest } = data;
  if (!hash) return false;
  const checkString = Object.keys(rest)
    .sort()
    .map((k) => `${k}=${rest[k]}`)
    .join("\n");
  const secretKey = crypto.createHash("sha256").update(botToken).digest();
  const computedHash = crypto.createHmac("sha256", secretKey).update(checkString).digest("hex");
  return computedHash === hash;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const botToken = process.env.ANOPS_TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      return NextResponse.json({ success: false, message: "Telegram login isn't set up yet." }, { status: 503 });
    }

    if (!body?.id || !body?.hash || !body?.auth_date) {
      return NextResponse.json({ success: false, message: "Invalid Telegram login payload" }, { status: 400 });
    }
    if (!verifyTelegramHash(body, botToken)) {
      return NextResponse.json({ success: false, message: "Could not verify Telegram login — please try again." }, { status: 401 });
    }
    const authAgeSeconds = Math.floor(Date.now() / 1000) - Number(body.auth_date);
    if (authAgeSeconds > AUTH_DATE_MAX_AGE_SECONDS || authAgeSeconds < -60) {
      return NextResponse.json({ success: false, message: "This Telegram login has expired — please try again." }, { status: 401 });
    }

    await connectDB();

    const telegramId = String(body.id);
    const vendor = await VendorProfile.findOne({ telegramPersonalChatId: telegramId, isDeleted: { $ne: true } }).lean() as any;
    if (!vendor?.userId) {
      return NextResponse.json(
        { success: false, message: "This Telegram account isn't linked to a My Biz Flow account yet. Connect Telegram from your portal first, or sign in with your password." },
        { status: 404 }
      );
    }

    const user = await User.findOne({ _id: vendor.userId, isDeleted: { $ne: true } }).lean() as any;
    if (!user) {
      return NextResponse.json({ success: false, message: "Account not found" }, { status: 404 });
    }
    if (user.isActive === false) {
      return NextResponse.json({ success: false, message: "This account has been deactivated. Contact your administrator." }, { status: 403 });
    }

    const { token, safeUser } = await buildAuthSession(user, []);
    const isSuperAdmin = user.role === "SUPER_ADMIN";
    const landingPath = (safeUser as any)?.mustChangePassword
      ? "/update-password"
      : await resolveLandingPath(String(user._id), isSuperAdmin).catch(() => "/console");

    const res = NextResponse.json({ success: true, token, user: safeUser, landingPath });
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
