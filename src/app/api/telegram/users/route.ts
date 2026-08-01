/**
 * GET /api/telegram/users — Super-Admin-only listing of every chat
 * (personal or group) that has ever messaged the bot, per TelegramUser
 * (see that model's top comment). Backs the admin directory page; the
 * same records are also dual-written to central-api's "telegram-users"
 * dataset (see lib/telegramUsers.ts) for cross-property reuse, so this
 * endpoint is the local read path, not the only one.
 */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import TelegramUser from "@/models/TelegramUser";
import { getEnrichedSession } from "@/lib/auth/session-enriched";

export async function GET() {
  const session = await getEnrichedSession();
  if (!session?.isSuperAdmin) {
    return NextResponse.json({ success: false, error: "Super Admin only" }, { status: 403 });
  }

  await connectDB();
  const users = await TelegramUser.find({})
    .populate("linkedBusinessIds", "name")
    .sort({ lastSeenAt: -1 })
    .limit(500)
    .lean();

  return NextResponse.json({ success: true, users });
}
