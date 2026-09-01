/**
 * POST /api/crm/jobsheets/[id]/handover — SC records payment collected and
 * hands the device back to the customer. Milestone: REPAIR_COMPLETED -> CLOSED.
 * Final step of the CRM lifecycle; requires the job to already be invoiced
 * (see /api/crm/jobsheets/[id]/close).
 */

import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import crypto from "crypto";
import { connectDB } from "@/lib/mongodb";
import CrmJobSheet from "@/models/CrmJobSheet";
import SalesInvoice from "@/models/SalesInvoice";
import { logAction } from "@/lib/audit/logAction";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";
import { notifyJobSheetStatusChange } from "@/lib/customerNotify";
import { isNonChargeableWarranty } from "@/core/catalog/warranty";

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
    const { paymentCollected, paymentMode, paymentCollectedByName } = body;
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

    // IW / 90-day-warranty jobs are non-chargeable -- the payable amount is
    // always 0, regardless of what the client sends, so a stale/tampered
    // request can never collect money on a warranty job.
    jobSheet.paymentCollected = isNonChargeableWarranty((jobSheet as any).warrantyStatus) ? 0 : Number(paymentCollected);
    jobSheet.paymentMode = paymentMode;
    if (paymentCollectedByName?.trim()) jobSheet.paymentCollectedByName = paymentCollectedByName.trim();
    jobSheet.handedOverAt = new Date();
    jobSheet.handedOverBy = new mongoose.Types.ObjectId(userId) as any;
    jobSheet.status = "CLOSED";
    // Generated now (device-handover time, the actual "delivery" moment
    // the NPS survey is supposed to fire an hour after -- see explicit
    // direction) rather than lazily in the follow-up cron, so the token
    // exists as soon as there's a job to survey.
    if (!jobSheet.feedbackToken) {
      jobSheet.feedbackToken = crypto.randomBytes(16).toString("hex");
    }
    await jobSheet.save();

    notifyJobSheetStatusChange(jobSheet.businessId.toString(), jobSheet.phone, jobSheet.jobSheetNumber, jobSheet.status);

    // The SalesInvoice generated at close-time (see close/route.ts) was
    // left at "SENT" forever -- handover never touched it, so a job could
    // be fully paid and closed and still never count as revenue anywhere
    // (CRM Overview's /api/crm/revenue only sums status: "PAID"). Payment
    // is actually collected right here, so this is the one place that
    // can correctly mark the invoice paid.
    if (jobSheet.invoiceId) {
      // SalesInvoice's own field is `paymentMethod`, not `paymentMode` --
      // this used to $set a field name that doesn't exist on the schema,
      // which Mongoose's default strict mode silently drops from an
      // update. The invoice always got marked PAID, but the actual
      // payment mode never made it onto the invoice (reported: "in
      // invoice also payment mode is not there only payment status
      // available") -- it only ever landed on the job sheet itself.
      await SalesInvoice.findByIdAndUpdate(jobSheet.invoiceId, {
        $set: { status: "PAID", paidAt: new Date(), paidAmount: Number(paymentCollected), paymentMethod: paymentMode },
      });
    }

    logAction({
      action: "HANDOVER",
      entity: "CrmJobSheet",
      entityId: id,
      after: { status: jobSheet.status, paymentCollected: jobSheet.paymentCollected, paymentMode },
      req,
      actor: { id: userId, businessId: jobSheet.businessId.toString() },
    });

    return NextResponse.json({ success: true, jobSheet });
  } catch (err: any) {
    console.error("CRM jobsheet handover error:", err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
