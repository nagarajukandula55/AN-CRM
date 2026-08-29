import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { connectDB } from "@/lib/mongodb";
import VendorProfile from "@/models/VendorProfile";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { sendGenericEmail } from "@/services/email/resend.service";
import { renderEmailShell, emailButton } from "@/services/email/emailShell";

const CODE_TTL_MS = 15 * 60 * 1000;
// Same alphabet as /api/vendor/telegram-link-code -- excludes visually
// ambiguous characters (0/O, 1/I/L), since this gets read off an email.
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function generateCode(length = 6): string {
  let code = "";
  for (let i = 0; i < length; i++) code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return code;
}

/**
 * POST /api/admin/telegram-broadcast/send — reminds every vendor who
 * hasn't connected their personal Telegram chat yet, by EMAIL (the only
 * channel that reaches someone who isn't on Telegram yet at all). Mints
 * each vendor their own fresh, single-use link code server-side (same
 * mechanism /api/vendor/telegram-link-code uses for a logged-in vendor
 * clicking the button themselves) so the email's button is a genuine
 * one-tap deep link straight into Telegram with /start prefilled -- no
 * login or manual code-typing required. Per explicit direction ("i want
 * to ask all signed up users to connect their telegram to bot and add to
 * group as well that is still pending from all if we send that they can
 * add it and we also can show them the results").
 */
export async function POST(_req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.isSuperAdmin) {
      return NextResponse.json({ success: false, message: "Super admin only" }, { status: 403 });
    }

    await connectDB();

    const botToken = process.env.ANOPS_TELEGRAM_BOT_TOKEN;
    let botUsername: string | null = null;
    if (botToken) {
      try {
        const res = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
        const data = await res.json();
        botUsername = data?.ok ? data.result?.username ?? null : null;
      } catch {
        // leave null -- email still sends with a fallback "log in and connect" link
      }
    }

    const vendors = await VendorProfile.find({
      isDeleted: { $ne: true },
      status: "ACTIVE",
      telegramPersonalChatId: { $in: [null, ""] },
      email: { $exists: true, $ne: "" },
    });

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://crm.angroup.in";
    let sentCount = 0;
    const failures: string[] = [];

    for (const vendor of vendors) {
      if (!vendor.email) continue;
      try {
        const code = generateCode();
        vendor.telegramLinkCode = code;
        vendor.telegramLinkCodeExpiresAt = new Date(Date.now() + CODE_TTL_MS);
        await vendor.save();

        const deepLink = botUsername ? `https://t.me/${botUsername}?start=${code}` : `${baseUrl}/vendor/telegram`;

        const result = await sendGenericEmail({
          to: vendor.email,
          subject: "Connect your Telegram — support, alerts & reports in one place",
          html: renderEmailShell({
            heading: "Connect your Telegram",
            previewText: "One tap to link your account — support, alerts, and business reports all in one place.",
            bodyHtml: `
              <p>Hi ${vendor.contactPerson || vendor.companyName},</p>
              <p>Telegram is how we reach you for support, account alerts, and your <strong>daily business report</strong> (included in your plan) — and it only takes one tap to connect.</p>
              <div style="text-align:center;margin:24px 0;">${emailButton("Connect Telegram", deepLink)}</div>
              <p style="font-size:13px;color:#8B8F94;">This link is valid for 15 minutes. Once connected, also link your shop's own Telegram group from Telegram Alerts in your portal, so your whole team gets alerts and reports too.</p>
              <p style="font-size:13px;color:#8B8F94;">Link not working? Log in and open Telegram Alerts in your portal to connect manually: <a href="${baseUrl}/vendor/telegram">${baseUrl}/vendor/telegram</a></p>
            `,
          }),
          businessId: vendor.businessId ? String(vendor.businessId) : undefined,
        });

        if (result.success) sentCount++;
        else failures.push(`${vendor.vendorId || vendor._id}: ${result.error || "unknown"}`);
      } catch (err: any) {
        failures.push(`${vendor.vendorId || vendor._id}: ${err?.message || "unknown"}`);
      }
    }

    return NextResponse.json({ success: true, targeted: vendors.length, sentCount, failures });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
