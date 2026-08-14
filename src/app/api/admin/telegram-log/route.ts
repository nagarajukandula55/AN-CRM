/**
 * GET /api/admin/telegram-log — super-admin-only list of every automated
 * Telegram alert the system has attempted to send (models/TelegramLog.ts),
 * newest first. Optional ?businessId= / ?type= filters.
 */
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import TelegramLog from "@/models/TelegramLog";
import { getEnrichedSession } from "@/lib/auth/session-enriched";

export async function GET(req: NextRequest) {
  const session = await getEnrichedSession();
  if (!session?.user) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }
  if (!session.isSuperAdmin) {
    return NextResponse.json({ success: false, message: "Super admin only" }, { status: 403 });
  }

  await connectDB();
  const { searchParams } = new URL(req.url);
  const query: Record<string, unknown> = {};
  const businessId = searchParams.get("businessId");
  const type = searchParams.get("type");
  if (businessId) query.businessId = businessId;
  if (type) query.type = type;

  const limit = Math.min(Number(searchParams.get("limit")) || 100, 300);
  const logs = await TelegramLog.find(query).sort({ createdAt: -1 }).limit(limit).lean();

  return NextResponse.json({ success: true, logs });
}
