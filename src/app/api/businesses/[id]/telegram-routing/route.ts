import { NextResponse } from "next/server";
import { connectDB } from "@/core/db/mongodb";
import Business from "@/models/Business";
import { getVendorTelegramMessageTypes } from "@/core/telegram/vendorMessageTypes";
import { sendVendorTelegramMessage } from "@/core/telegram/sendVendorTelegramMessage";
import { logAiChange } from "@/core/changelog/logAiChange";

/**
 * Reads/writes ONE business's Telegram routing config -- their group chat
 * id, personal chat id, and which of the two each message type goes to
 * (Business.telegramMessageRouting). Authorization is this app's own --
 * callers must already be authenticated via middleware; only reachable
 * from console/admin/vendors/[id]/telegram, itself Admin-only nav.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await connectDB();
  const { id } = await params;
  const [business, messageTypes] = await Promise.all([
    Business.findById(id).select("name telegramChatId telegramPersonalChatId telegramMessageRouting").lean<any>(),
    getVendorTelegramMessageTypes(),
  ]);
  if (!business) {
    return NextResponse.json({ success: false, message: "Business not found" }, { status: 404 });
  }
  return NextResponse.json({
    success: true,
    businessName: business.name,
    telegramChatId: business.telegramChatId || "",
    telegramPersonalChatId: business.telegramPersonalChatId || "",
    telegramMessageRouting: business.telegramMessageRouting || {},
    messageTypes,
  });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await connectDB();
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const update: Record<string, unknown> = {};
  if (typeof body.telegramChatId === "string") update.telegramChatId = body.telegramChatId.trim();
  if (typeof body.telegramPersonalChatId === "string") update.telegramPersonalChatId = body.telegramPersonalChatId.trim();

  if (body.telegramMessageRouting && typeof body.telegramMessageRouting === "object") {
    // Any key the caller sends is accepted here (not just the hardcoded
    // fallback list) -- a trigger type created live in central-api's AN
    // CRM Admin panel needs to be routable immediately, not only after
    // this list is redeployed.
    const routing: Record<string, { group: boolean; personal: boolean }> = {};
    for (const [key, entry] of Object.entries(body.telegramMessageRouting)) {
      if (entry && typeof entry === "object") {
        routing[key] = { group: !!(entry as any).group, personal: !!(entry as any).personal };
      }
    }
    update.telegramMessageRouting = routing;
  }

  const business = await Business.findByIdAndUpdate(id, { $set: update }, { new: true })
    .select("telegramChatId telegramPersonalChatId telegramMessageRouting")
    .lean<any>();
  if (!business) {
    return NextResponse.json({ success: false, message: "Business not found" }, { status: 404 });
  }
  await logAiChange({
    summary: `Telegram routing updated for business ${id}`,
    details: `Fields changed: ${Object.keys(update).join(", ") || "(none)"}`,
    filesChanged: [`Business(${id}).telegramMessageRouting`],
    author: "AN-CRM Admin Console",
    tags: ["telegram", "config"],
  });
  return NextResponse.json({ success: true, business });
}

/**
 * Manual/adhoc send -- lets AN Group staff push a one-off message to a
 * vendor's group, personal chat, or both right now, either under one of
 * the catalog message types (uses that type's configured routing) or as
 * an explicit override of destination.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const text: string = String(body.text || "").trim();
  const type: string = String(body.type || "GENERAL_ANNOUNCEMENT").toUpperCase();

  if (!text) {
    return NextResponse.json({ success: false, message: "Message text is required" }, { status: 400 });
  }

  await connectDB();

  // Explicit destination override (from the "Send Now" panel's Group/
  // Personal/Both radio) bypasses the saved routing config for this one
  // send only -- doesn't touch telegramMessageRouting.
  if (body.destination === "GROUP" || body.destination === "PERSONAL" || body.destination === "BOTH") {
    const business = await Business.findById(id).select("telegramChatId telegramPersonalChatId").lean<any>();
    if (!business) return NextResponse.json({ success: false, message: "Business not found" }, { status: 404 });
    const { sendTelegramMessage } = await import("@/lib/telegram");
    let group = false, personal = false;
    if ((body.destination === "GROUP" || body.destination === "BOTH") && business.telegramChatId) {
      group = await sendTelegramMessage(text, { chatId: business.telegramChatId });
    }
    if ((body.destination === "PERSONAL" || body.destination === "BOTH") && business.telegramPersonalChatId) {
      personal = await sendTelegramMessage(text, { chatId: business.telegramPersonalChatId });
    }
    return NextResponse.json({ success: true, sent: { group, personal } });
  }

  const sent = await sendVendorTelegramMessage(id, type, text);
  return NextResponse.json({ success: true, sent });
}
