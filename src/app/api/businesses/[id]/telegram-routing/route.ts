import { NextResponse } from "next/server";
import { connectDB } from "@/core/db/mongodb";
import VendorProfile from "@/models/VendorProfile";
import { getVendorTelegramMessageTypes } from "@/core/telegram/vendorMessageTypes";
import { sendVendorTelegramMessage } from "@/core/telegram/sendVendorTelegramMessage";
import { sendTelegramMessage } from "@/lib/telegram";
import { logAiChange } from "@/core/changelog/logAiChange";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";

/**
 * Reads/writes ONE vendor's Telegram routing config -- their group chat
 * id, personal chat id, and which of the two each message type goes to
 * (VendorProfile.telegramMessageRouting), including sending an actual
 * message to that chat. AN Group staff only
 * (console/admin/vendors/[id]/telegram -- never reachable from a vendor's
 * own console).
 *
 * `:id` is a VendorProfile._id (the same id console/admin/vendors/[id]
 * already uses for everything else about that vendor) -- this route used
 * to (wrongly) treat it as a Business._id and call Business.findById(id),
 * which always 404'd since a VendorProfile id was never a valid Business
 * id, silently breaking this entire admin page for every vendor. Fixed
 * alongside the broader move of Telegram linking from Business to
 * VendorProfile (see VendorProfile.ts's telegram* field comment).
 *
 * SECURITY: every handler requires a real session with vendors.edit.
 */
async function requireStaffAccess(): Promise<{ ok: true } | { ok: false; res: NextResponse }> {
  const session = await getEnrichedSession();
  if (!session?.user) {
    return { ok: false, res: NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 }) };
  }
  try {
    requirePermission(session as any, buildPermissionCode("vendors", "edit"));
  } catch (err: any) {
    return { ok: false, res: NextResponse.json({ success: false, message: err.message }, { status: err.code === "FORBIDDEN" ? 403 : 401 }) };
  }
  return { ok: true };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaffAccess();
  if (!auth.ok) return auth.res;
  await connectDB();
  const { id } = await params;
  const [vendor, messageTypes] = await Promise.all([
    VendorProfile.findById(id).select("companyName telegramChatId telegramPersonalChatId telegramMessageRouting").lean<any>(),
    getVendorTelegramMessageTypes(),
  ]);
  if (!vendor) {
    return NextResponse.json({ success: false, message: "Vendor not found" }, { status: 404 });
  }
  return NextResponse.json({
    success: true,
    businessName: vendor.companyName,
    telegramChatId: vendor.telegramChatId || "",
    telegramPersonalChatId: vendor.telegramPersonalChatId || "",
    telegramMessageRouting: vendor.telegramMessageRouting || {},
    messageTypes,
  });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaffAccess();
  if (!auth.ok) return auth.res;
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

  const vendor = await VendorProfile.findByIdAndUpdate(id, { $set: update }, { new: true })
    .select("telegramChatId telegramPersonalChatId telegramMessageRouting")
    .lean<any>();
  if (!vendor) {
    return NextResponse.json({ success: false, message: "Vendor not found" }, { status: 404 });
  }
  await logAiChange({
    summary: `Telegram routing updated for vendor ${id}`,
    details: `Fields changed: ${Object.keys(update).join(", ") || "(none)"}`,
    filesChanged: [`VendorProfile(${id}).telegramMessageRouting`],
    author: "AN-CRM Admin Console",
    tags: ["telegram", "config"],
  });
  return NextResponse.json({ success: true, vendor });
}

/**
 * Manual/adhoc send -- lets AN Group staff push a one-off message to a
 * vendor's group, personal chat, or both right now, either under one of
 * the catalog message types (uses that type's configured routing) or as
 * an explicit override of destination.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaffAccess();
  if (!auth.ok) return auth.res;
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
    const vendor = await VendorProfile.findById(id).select("telegramChatId telegramPersonalChatId").lean<any>();
    if (!vendor) return NextResponse.json({ success: false, message: "Vendor not found" }, { status: 404 });
    let group = false, personal = false;
    if ((body.destination === "GROUP" || body.destination === "BOTH") && vendor.telegramChatId) {
      group = await sendTelegramMessage(text, { chatId: vendor.telegramChatId });
    }
    if ((body.destination === "PERSONAL" || body.destination === "BOTH") && vendor.telegramPersonalChatId) {
      personal = await sendTelegramMessage(text, { chatId: vendor.telegramPersonalChatId });
    }
    return NextResponse.json({ success: true, sent: { group, personal } });
  }

  const sent = await sendVendorTelegramMessage(id, type, text);
  return NextResponse.json({ success: true, sent });
}
