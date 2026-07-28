/**
 * GET  /api/admin/communication-quota — current usage/limits for the
 *      active business (auto-creates a default, opted-out row on first
 *      call so the settings UI always has something to render).
 * PATCH /api/admin/communication-quota — super admin only: opt a
 *      business in/out per channel and set its quota. This is a platform-
 *      controlled allocation ("we will set it up later but arrange
 *      system"), not something a business sets for itself -- matches the
 *      "centrally held WhatsApp subscription" model.
 */
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import CommunicationQuota from "@/models/CommunicationQuota";
import { getEnrichedSession } from "@/lib/auth/session-enriched";

export async function GET(req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    if (!session.business?.businessId) {
      return NextResponse.json({ success: false, message: "No active business" }, { status: 400 });
    }

    await connectDB();
    let quota = await CommunicationQuota.findOne({ businessId: session.business.businessId });
    if (!quota) {
      quota = await CommunicationQuota.create({ businessId: session.business.businessId });
    }

    return NextResponse.json({ success: true, quota });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user || !session.isSuperAdmin) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { businessId, emailEnabled, emailQuota, whatsappEnabled, whatsappQuota } = body;
    if (!businessId) {
      return NextResponse.json({ success: false, message: "businessId is required" }, { status: 400 });
    }

    await connectDB();
    const update: Record<string, unknown> = {};
    if (emailEnabled !== undefined) update.emailEnabled = emailEnabled;
    if (emailQuota !== undefined) update.emailQuota = emailQuota;
    if (whatsappEnabled !== undefined) update.whatsappEnabled = whatsappEnabled;
    if (whatsappQuota !== undefined) update.whatsappQuota = whatsappQuota;

    const quota = await CommunicationQuota.findOneAndUpdate(
      { businessId },
      { $set: update, $setOnInsert: { businessId } },
      { new: true, upsert: true }
    );

    return NextResponse.json({ success: true, quota });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
