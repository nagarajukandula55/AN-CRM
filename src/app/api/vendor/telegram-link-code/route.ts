import { NextResponse } from "next/server";
import { headers } from "next/headers";
import crypto from "crypto";
import { connectDB } from "@/lib/mongodb";
import { resolveVendorContext } from "@/lib/auth/vendorContext";

const CODE_TTL_MS = 15 * 60 * 1000; // 15 minutes
// Excludes visually-ambiguous characters (0/O, 1/I/L) -- this code gets
// typed or read off a phone screen, so a code that's easy to misread
// defeats the "easier than typing a Vendor ID" point of building this.
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function generateCode(length = 6): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

// POST /api/vendor/telegram-link-code — mints a fresh, single-use,
// 15-minute code for this vendor to link a Telegram chat with, via
// /api/telegram/webhook's `/start <code>` handler. Replaces linking by
// typing the vendor's own real Vendor ID (see that route's comment for
// why that was a real gap, not just a UX one) -- generating a new code
// here immediately invalidates any code generated before it, so only the
// most recent one is ever live.
export async function POST() {
  try {
    const headersList = await headers();
    const userId = headersList.get("x-user-id");
    if (!userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    await connectDB();
    const ctx = await resolveVendorContext(userId);
    if (!ctx) return NextResponse.json({ success: false, message: "Vendor profile not found" }, { status: 404 });

    const vendor = ctx.vendor as any;
    const code = generateCode();
    const expiresAt = new Date(Date.now() + CODE_TTL_MS);
    vendor.telegramLinkCode = code;
    vendor.telegramLinkCodeExpiresAt = expiresAt;
    await vendor.save();

    const botToken = process.env.ANOPS_TELEGRAM_BOT_TOKEN;
    let botUsername: string | null = null;
    if (botToken) {
      try {
        const res = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
        const data = await res.json();
        botUsername = data?.ok ? data.result?.username ?? null : null;
      } catch { /* leave botUsername null -- frontend shows the code alone */ }
    }

    return NextResponse.json({
      success: true,
      code,
      expiresAt: expiresAt.toISOString(),
      botUsername,
      deepLink: botUsername ? `https://t.me/${botUsername}?start=${code}` : null,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
