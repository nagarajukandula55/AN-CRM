/**
 * POST /api/businesses/:id/telegram-link-code — generates a short-lived
 * one-time code the admin sends to the bot as "/link <code>" instead of
 * copy-pasting a raw Telegram chat id into Settings (see
 * api/telegram/webhook's /link handler, which consumes this code and sets
 * telegramChatId itself). 15-minute expiry, single business per code at a
 * time -- generating a new one invalidates any earlier unclaimed code.
 */
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Business from "@/models/Business";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";

function generateCode(): string {
  // Excludes visually-ambiguous characters (0/O, 1/I/L) since this gets
  // typed by hand into a Telegram message.
  const alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  let code = "";
  for (let i = 0; i < 6; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("businesses", "edit"));
    } catch (err: any) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.code === "FORBIDDEN" ? 403 : 401 });
    }

    const { id } = await params;
    await connectDB();

    const code = generateCode();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    const business = await Business.findByIdAndUpdate(
      id,
      { $set: { telegramLinkCode: code, telegramLinkCodeExpiresAt: expiresAt } },
      { new: true }
    ).select("telegramLinkCode telegramLinkCodeExpiresAt");

    if (!business) {
      return NextResponse.json({ success: false, error: "Business not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, code, expiresAt });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
