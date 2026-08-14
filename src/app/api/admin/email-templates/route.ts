/**
 * GET/PUT /api/admin/email-templates — super-admin-only editing of the
 * subject/body for each transactional email occasion (see
 * core/email/emailOccasions.ts's catalog and models/EmailTemplate.ts).
 * Same pattern as /api/admin/telegram-templates.
 */
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import EmailTemplate from "@/models/EmailTemplate";
import { EMAIL_OCCASIONS, tokensForEmailOccasion } from "@/core/email/emailOccasions";
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

export async function GET() {
  const auth = await requireSuperAdmin();
  if (!auth.ok) return auth.res;

  await connectDB();
  const templates = await EmailTemplate.find({}).lean();
  const byKey = new Map(templates.map((t: any) => [t.key, t]));

  return NextResponse.json({
    success: true,
    occasions: EMAIL_OCCASIONS.map((o) => {
      const saved: any = byKey.get(o.key);
      return {
        ...o,
        subject: saved?.subject || "",
        html: saved?.html || "",
        enabled: saved ? saved.enabled !== false : true,
        isCustom: !!saved,
        tokens: tokensForEmailOccasion(o.key),
      };
    }),
  });
}

export async function PUT(req: NextRequest) {
  const auth = await requireSuperAdmin();
  if (!auth.ok) return auth.res;

  await connectDB();
  const body = await req.json().catch(() => ({}));
  const key = String(body.key || "").trim().toUpperCase();
  const subject = typeof body.subject === "string" ? body.subject : "";
  const html = typeof body.html === "string" ? body.html : "";
  const enabled = body.enabled !== false;
  if (!key) {
    return NextResponse.json({ success: false, message: "key is required" }, { status: 400 });
  }

  if (!subject.trim() && !html.trim() && enabled) {
    // Blank + still enabled = "go back to this occasion's hardcoded
    // fallback" -- delete the override.
    await EmailTemplate.deleteOne({ key });
    return NextResponse.json({ success: true, cleared: true });
  }

  await EmailTemplate.findOneAndUpdate(
    { key },
    { key, subject: subject || "(disabled)", html: html || "<p>(disabled)</p>", enabled, updatedBy: auth.userId },
    { upsert: true, new: true }
  );
  return NextResponse.json({ success: true });
}
