/**
 * POST /api/crm/jobsheets/[id]/handover — SC records payment collected and
 * hands the device back to the customer. Milestone: REPAIR_COMPLETED -> CLOSED.
 * Final step of the CRM lifecycle; requires the job to already be invoiced
 * (see /api/crm/jobsheets/[id]/close).
 */

import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import CrmJobSheet from "@/models/CrmJobSheet";
import CrmCall from "@/models/CrmCall";
import { logAction } from "@/lib/audit/logAction";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";

const PAYMENT_MODES = new Set(["CASH", "UPI", "CARD", "BANK_TRANSFER", "OTHER"]);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("crm_jobsheets", "edit"));
    } catch (err: any) {
      return NextResponse.json(
        { success: false, message: err.message },
        { status: err.code === "FORBIDDEN" ? 403 : 401 }
      );
    }
    const userId = session.user.id;

    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: "Invalid job sheet id" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const { paymentCollected, paymentMode } = body;
    if (paymentCollected === undefined || isNaN(Number(paymentCollected))) {
      return NextResponse.json({ success: false, message: "paymentCollected is required" }, { status: 400 });
    }
    if (!PAYMENT_MODES.has(paymentMode)) {
      return NextResponse.json({ success: false, message: "A valid paymentMode is required" }, { status: 400 });
    }

    await connectDB();

    const jobSheet = await CrmJobSheet.findOne({ _id: id, isDeleted: false });
    if (!jobSheet) {
      return NextResponse.json({ success: false, message: "Job sheet not found" }, { status: 404 });
    }
    if (jobSheet.status !== "REPAIR_COMPLETED") {
      return NextResponse.json(
        { success: false, message: `Cannot hand over while status is ${jobSheet.status}.` },
        { status: 409 }
      );
    }

    jobSheet.paymentCollected = Number(paymentCollected);
    jobSheet.paymentMode = paymentMode;
    jobSheet.handedOverAt = new Date();
    jobSheet.handedOverBy = new mongoose.Types.ObjectId(userId) as any;
    jobSheet.status = "CLOSED";
    await jobSheet.save();

    let closedCall = null;
    if (jobSheet.callId) {
      closedCall = await CrmCall.findOneAndUpdate(
        { _id: jobSheet.callId, isDeleted: false },
        { $set: { status: "CLOSED_WON", closedAt: new Date(), closedReason: "Handed over to customer" } },
        { new: true }
      );
    }

    logAction({
      action: "HANDOVER",
      entity: "CrmJobSheet",
      entityId: id,
      after: { status: jobSheet.status, paymentCollected: jobSheet.paymentCollected, paymentMode },
      req,
      actor: { id: userId, businessId: jobSheet.businessId.toString() },
    });

    return NextResponse.json({ success: true, jobSheet, call: closedCall });
  } catch (err: any) {
    console.error("CRM jobsheet handover error:", err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
