/**
 * POST /api/crm/calls/[id]/convert — convert a qualified call into a
 * CrmJobSheet. This is the "call entry -> job sheet" hinge of the CRM
 * lifecycle: it creates the job sheet, links it back to the call, and
 * advances the call to JOB_CREATED so the kanban/pipeline reflects reality.
 */

import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import CrmCall from "@/models/CrmCall";
import CrmJobSheet from "@/models/CrmJobSheet";
import { generateDocumentNumber } from "@/core/numbering/numberingService";
import { logAction } from "@/lib/audit/logAction";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";

const TERMINAL_STATUSES = new Set(["CLOSED_WON", "CLOSED_LOST", "JOB_CREATED"]);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    // Converting a call creates a job sheet, so gate on crm_jobsheets.create
    // (the resource actually being created) rather than crm_calls.edit.
    try {
      requirePermission(session as any, buildPermissionCode("crm_jobsheets", "create"));
    } catch (err: any) {
      return NextResponse.json(
        { success: false, message: err.message },
        { status: err.code === "FORBIDDEN" ? 403 : 401 }
      );
    }
    const userId = session.user.id;

    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: "Invalid call id" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const {
      title,
      description,
      scheduledAt,
      assignedTo,
      lineItems,
      city,
      state,
      pincode,
      brandId,
      deviceModel,
      deviceModelId,
      imeiOrSerialNumber,
      issueDescription,
      faultCodeId,
      remark,
      warrantyStatus,
      deviceAppearance,
      fileBackupDescription,
    } = body;

    await connectDB();

    const call = await CrmCall.findOne({ _id: id, isDeleted: false });
    if (!call) {
      return NextResponse.json({ success: false, message: "Call not found" }, { status: 404 });
    }
    if (call.jobSheetId) {
      return NextResponse.json(
        { success: false, message: "This call has already been converted to a job sheet." },
        { status: 409 }
      );
    }
    if (TERMINAL_STATUSES.has(call.status) && call.status !== "QUALIFIED") {
      return NextResponse.json(
        { success: false, message: `Call is already ${call.status} and cannot be converted.` },
        { status: 409 }
      );
    }

    const { value: jobSheetNumber } = await generateDocumentNumber(
      call.businessId.toString(),
      "JOB_SHEET"
    );

    const jobSheet = await CrmJobSheet.create({
      businessId: call.businessId,
      jobSheetNumber,
      callId: call._id,
      customerName: call.customerName,
      company: call.company,
      phone: call.phone,
      email: call.email,
      address: call.address,
      city: city || call.city,
      state: state || call.state,
      pincode: pincode || call.pincode,
      appointmentType: call.appointmentType,
      requestType: call.requestType,
      product: call.product,
      // deviceModel was accepted in the request body but never actually
      // used here -- the vendor Convert-to-Workorder form's Model
      // override was silently dropped, always falling back to whatever
      // the call itself had. Same override pattern as brandId below.
      deviceModel: deviceModel || call.deviceModel,
      deviceModelId:
        deviceModelId && mongoose.Types.ObjectId.isValid(deviceModelId)
          ? new mongoose.Types.ObjectId(deviceModelId)
          : call.deviceModelId,
      brandId:
        brandId && mongoose.Types.ObjectId.isValid(brandId)
          ? new mongoose.Types.ObjectId(brandId)
          : call.brandId,
      imeiOrSerialNumber,
      issueDescription: issueDescription || call.subject,
      faultCodeId:
        faultCodeId && mongoose.Types.ObjectId.isValid(faultCodeId)
          ? new mongoose.Types.ObjectId(faultCodeId)
          : undefined,
      remark,
      warrantyStatus: ["IW", "OOW"].includes(warrantyStatus) ? warrantyStatus : undefined,
      deviceAppearance: ["GOOD", "USED", "DENTS", "BROKEN"].includes(deviceAppearance) ? deviceAppearance : undefined,
      fileBackupDescription: ["YES", "NO"].includes(fileBackupDescription) ? fileBackupDescription : undefined,
      title: title?.trim() || call.subject,
      description: description ?? call.description,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
      assignedTo:
        assignedTo && mongoose.Types.ObjectId.isValid(assignedTo)
          ? new mongoose.Types.ObjectId(assignedTo)
          : call.assignedTo,
      status: "CREATED",
      lineItems: Array.isArray(lineItems) ? lineItems : [],
      createdBy: new mongoose.Types.ObjectId(userId),
    });

    call.jobSheetId = jobSheet._id as any;
    call.status = "JOB_CREATED";
    call.callLogs.push({
      disposition: "CONVERTED",
      notes: `Converted to job sheet ${jobSheet.jobSheetNumber}`,
      calledBy: new mongoose.Types.ObjectId(userId),
      calledAt: new Date(),
    } as any);
    await call.save();

    logAction({
      action: "CONVERT_TO_JOB_SHEET",
      entity: "CrmCall",
      entityId: id,
      after: { jobSheetId: jobSheet._id, jobSheetNumber: jobSheet.jobSheetNumber },
      req,
      actor: { id: userId },
    });
    logAction({
      action: "CREATE",
      entity: "CrmJobSheet",
      entityId: jobSheet._id?.toString(),
      after: jobSheet,
      req,
      actor: { id: userId },
    });

    return NextResponse.json({ success: true, call, jobSheet }, { status: 201 });
  } catch (err: any) {
    console.error("CRM call convert error:", err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
