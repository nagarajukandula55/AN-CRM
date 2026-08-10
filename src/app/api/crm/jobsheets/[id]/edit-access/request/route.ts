/**
 * POST /api/crm/jobsheets/[id]/edit-access/request — first step of
 * editing a CLOSED workorder: sends a 6-digit OTP to the vendor's
 * PERSONAL Telegram chat only (never the group), per explicit direction
 * ("Make a flow to edit closed workorder and give that option with OTP
 * of telegram to the personal account not the group"). The OTP expires
 * in 10 minutes; POST .../edit-access/verify exchanges a correct OTP for
 * a short-lived edit token that PATCH /api/crm/jobsheets/[id] accepts to
 * bypass the normal "line items are locked after invoice" guard.
 *
 * Deliberately does NOT bypass sendVendorTelegramMessage's routing config
 * -- an OTP must reach a real person directly, not wherever a business
 * happens to have configured some other message type's routing, and
 * never the group (a shared chat where any team member could see and use
 * it). Fails loudly if no personal chat is configured at all rather than
 * silently falling back to the group.
 */
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import CrmJobSheet from "@/models/CrmJobSheet";
import Business from "@/models/Business";
import { sendTelegramMessage } from "@/lib/telegram";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";
import { logAction } from "@/lib/audit/logAction";

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("crm_jobsheets", "edit"));
    } catch (err: any) {
      return NextResponse.json({ success: false, message: err.message }, { status: err.code === "FORBIDDEN" ? 403 : 401 });
    }

    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: "Invalid job sheet id" }, { status: 400 });
    }

    await connectDB();

    const jobSheet = await CrmJobSheet.findOne({ _id: id, isDeleted: false });
    if (!jobSheet) {
      return NextResponse.json({ success: false, message: "Job sheet not found" }, { status: 404 });
    }
    if (jobSheet.status !== "CLOSED") {
      return NextResponse.json(
        { success: false, message: "OTP-gated edit access is only for CLOSED workorders." },
        { status: 409 }
      );
    }

    const business = await Business.findById(jobSheet.businessId).select("telegramPersonalChatId name").lean<any>();
    if (!business?.telegramPersonalChatId) {
      return NextResponse.json(
        { success: false, message: "No personal Telegram chat is configured for this business yet. Set it up in Settings > Operations > Telegram first." },
        { status: 400 }
      );
    }

    const otp = String(crypto.randomInt(100000, 999999));
    jobSheet.editAccessOtp = otp;
    jobSheet.editAccessOtpExpiresAt = new Date(Date.now() + OTP_TTL_MS);
    // Clear out any previously-issued edit token -- requesting a new OTP
    // invalidates whatever access an earlier one might have granted.
    jobSheet.editAccessToken = undefined;
    jobSheet.editAccessTokenExpiresAt = undefined;
    await jobSheet.save();

    const sent = await sendTelegramMessage(
      `🔐 Edit access code for workorder <b>${jobSheet.jobSheetNumber}</b>: <code>${otp}</code>\n\nValid for 10 minutes. Do not share this code, even with your own team -- it unlocks editing a closed, already-invoiced workorder.`,
      { chatId: business.telegramPersonalChatId, parseMode: "HTML" }
    );
    if (!sent) {
      return NextResponse.json({ success: false, message: "Failed to send the OTP via Telegram. Check the personal chat id is still valid." }, { status: 502 });
    }

    logAction({
      action: "UPDATE",
      entity: "CrmJobSheet",
      entityId: id,
      after: { editAccessOtpRequested: true },
      req,
      actor: { id: session.user.id },
    });

    return NextResponse.json({ success: true, message: "OTP sent to the business's personal Telegram chat." });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
