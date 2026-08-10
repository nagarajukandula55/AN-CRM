/**
 * POST /api/crm/jobsheets/[id]/edit-access/verify — second step: body
 * { otp }. On a correct, unexpired OTP, issues a short-lived, single-use
 * edit token (30 minutes) that PATCH /api/crm/jobsheets/[id] accepts to
 * bypass the "line items are locked after invoice" guard for THIS one
 * CLOSED workorder. The OTP itself is consumed (cleared) on first
 * verify attempt regardless of outcome -- a wrong guess doesn't get a
 * second try against the same code, matching normal OTP hygiene.
 */
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import CrmJobSheet from "@/models/CrmJobSheet";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";
import { logAction } from "@/lib/audit/logAction";

const TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes

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

    const body = await req.json().catch(() => ({}));
    const otp = String(body?.otp || "").trim();
    if (!otp) {
      return NextResponse.json({ success: false, message: "OTP is required" }, { status: 400 });
    }

    await connectDB();

    const jobSheet = await CrmJobSheet.findOne({ _id: id, isDeleted: false }).select(
      "+editAccessOtp +editAccessOtpExpiresAt status"
    );
    if (!jobSheet) {
      return NextResponse.json({ success: false, message: "Job sheet not found" }, { status: 404 });
    }

    const storedOtp = jobSheet.editAccessOtp;
    const expiresAt = jobSheet.editAccessOtpExpiresAt;
    // Consume the OTP immediately -- one attempt per requested code,
    // whether it matches or not.
    jobSheet.editAccessOtp = undefined;
    jobSheet.editAccessOtpExpiresAt = undefined;

    const valid = !!storedOtp && !!expiresAt && expiresAt.getTime() > Date.now() && storedOtp === otp;
    if (!valid) {
      await jobSheet.save();
      return NextResponse.json({ success: false, message: "Incorrect or expired OTP. Request a new one." }, { status: 401 });
    }

    const token = crypto.randomBytes(24).toString("hex");
    jobSheet.editAccessToken = token;
    jobSheet.editAccessTokenExpiresAt = new Date(Date.now() + TOKEN_TTL_MS);
    await jobSheet.save();

    logAction({
      action: "UPDATE",
      entity: "CrmJobSheet",
      entityId: id,
      after: { editAccessGranted: true },
      req,
      actor: { id: session.user.id },
    });

    return NextResponse.json({ success: true, editAccessToken: token, expiresInMinutes: 30 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
