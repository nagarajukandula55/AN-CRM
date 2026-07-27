/**
 * "Teach ANu" API — lets an admin add a fact to ANu's knowledge base from
 * the UI (see ANu overlay widget) without a code deploy. Complements the
 * hand-maintained STATIC_KNOWLEDGE in core/anu/knowledgeBase.ts, which
 * still stays the source of truth for genuinely new platform capabilities;
 * this is for anything narrower or business-specific an admin wants ANu to
 * know right now.
 *
 * GET  — list entries (platform-wide + this business's own)
 * POST — add an entry. businessId omitted/null -> platform-wide (visible
 *        to every business); a real businessId scopes it to just that one.
 *        Platform-wide entries are super-admin only (they change what
 *        every business's ANu says); a business-scoped entry only needs
 *        the caller to be a member of that business.
 */
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import AnuKnowledge from "@/models/AnuKnowledge";
import { getEnrichedSession } from "@/lib/auth/session-enriched";

export async function GET(req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const { searchParams } = new URL(req.url);
    const businessId = searchParams.get("businessId");

    const query = businessId ? { $or: [{ businessId: null }, { businessId }] } : { businessId: null };
    const entries = await AnuKnowledge.find(query).sort({ createdAt: -1 }).lean();

    return NextResponse.json({ success: true, entries });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err?.message || "Failed to load ANu knowledge" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const body = await req.json();
    const { businessId, topic, summary } = body;

    if (!topic || !summary) {
      return NextResponse.json({ success: false, message: "topic and summary are required" }, { status: 400 });
    }

    if (!businessId && !session.isSuperAdmin) {
      return NextResponse.json(
        { success: false, message: "Only Super Admins can add platform-wide ANu knowledge" },
        { status: 403 }
      );
    }

    const entry = await AnuKnowledge.create({
      businessId: businessId || null,
      topic: String(topic).trim(),
      summary: String(summary).trim(),
      addedBy: session.user.id,
    });

    return NextResponse.json({ success: true, entry }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err?.message || "Failed to add ANu knowledge" },
      { status: 500 }
    );
  }
}
