/**
 * GET/PUT /api/admin/telegram-templates — super-admin-only editing of the
 * message TEXT for each Telegram alert type (see
 * core/telegram/vendorMessageTypes.ts's catalog and
 * models/TelegramMessageTemplate.ts). Applies platform-wide to every
 * vendor's alerts of that type -- a vendor's own Integrations tab only
 * ever shows the Group/Personal destination toggle, never this editor,
 * per explicit direction ("only vendors should have UI for group or
 * personal selection only").
 */
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import TelegramMessageTemplate from "@/models/TelegramMessageTemplate";
import { getVendorTelegramMessageTypes } from "@/core/telegram/vendorMessageTypes";
import { tokensFor } from "@/core/telegram/messageTokens";
import { templateKeyFor, type MessageChannel } from "@/core/telegram/templateKey";
import { getEnrichedSession } from "@/lib/auth/session-enriched";

async function requireSuperAdmin(): Promise<{ ok: true; userId: string } | { ok: false; res: NextResponse }> {
  const session = await getEnrichedSession();
  if (!session?.user) {
    return { ok: false, res: NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 }) };
  }
  if (!session.isSuperAdmin) {
    return { ok: false, res: NextResponse.json({ success: false, message: "Super admin only" }, { status: 403 }) };
  }
  return { ok: true, userId: session.user.id };
}

export async function GET(req: NextRequest) {
  const auth = await requireSuperAdmin();
  if (!auth.ok) return auth.res;

  const channel = (new URL(req.url).searchParams.get("channel")?.toUpperCase() === "WHATSAPP" ? "WHATSAPP" : "TELEGRAM") as MessageChannel;

  await connectDB();
  const [messageTypes, templates] = await Promise.all([
    getVendorTelegramMessageTypes(),
    TelegramMessageTemplate.find({}).lean(),
  ]);
  const templateByKey = new Map(templates.map((t: any) => [t.key, t]));

  return NextResponse.json({
    success: true,
    channel,
    messageTypes: messageTypes.map((t) => {
      const saved: any = templateByKey.get(templateKeyFor(t.key, channel));
      return {
        ...t,
        template: saved?.template && saved.template !== "(disabled)" ? saved.template : "",
        enabled: saved ? saved.enabled !== false : true,
        icon: saved?.icon || "",
        layout: saved?.layout || "FLAT",
        footerTone: saved?.footerTone || "NONE",
        footerText: saved?.footerText || "",
        tokens: tokensFor(t.key),
      };
    }),
  });
}

export async function PUT(req: NextRequest) {
  const auth = await requireSuperAdmin();
  if (!auth.ok) return auth.res;

  await connectDB();
  const body = await req.json().catch(() => ({}));
  const type = String(body.key || "").trim().toUpperCase();
  const channel = (String(body.channel || "TELEGRAM").toUpperCase() === "WHATSAPP" ? "WHATSAPP" : "TELEGRAM") as MessageChannel;
  const template = typeof body.template === "string" ? body.template : "";
  const enabled = body.enabled !== false;
  const icon = typeof body.icon === "string" ? body.icon.trim() : "";
  const layout = body.layout === "CARD" ? "CARD" : "FLAT";
  const footerTone = ["SUCCESS", "WARNING", "DANGER", "INFO"].includes(body.footerTone) ? body.footerTone : "NONE";
  const footerText = typeof body.footerText === "string" ? body.footerText : "";
  if (!type) {
    return NextResponse.json({ success: false, message: "key is required" }, { status: 400 });
  }
  const key = templateKeyFor(type, channel);
  // Card-style presentation (icon/layout/footer) is worth keeping even
  // when the wording itself is blank -- e.g. "just add an icon, keep the
  // built-in default wording" -- so only clear the row entirely when
  // NOTHING has been customized.
  const hasCardStyle = !!icon || layout === "CARD" || footerTone !== "NONE" || !!footerText.trim();

  if (!template.trim() && enabled && !hasCardStyle) {
    // Nothing customized and still enabled = "go back to this type's
    // hardcoded fallback" -- delete the override rather than storing an
    // empty row.
    await TelegramMessageTemplate.deleteOne({ key });
    return NextResponse.json({ success: true, cleared: true });
  }

  // A disabled type persists its row (even with a blank template) so the
  // kill switch survives -- only an explicit re-enable + blank text/style clears it.
  await TelegramMessageTemplate.findOneAndUpdate(
    { key },
    { key, channel, template: template || "(disabled)", enabled, icon, layout, footerTone, footerText, updatedBy: auth.userId },
    { upsert: true, new: true }
  );
  return NextResponse.json({ success: true });
}
