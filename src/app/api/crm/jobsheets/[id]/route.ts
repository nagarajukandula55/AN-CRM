/**
 * CRM Job Sheet Detail
 * GET    /api/crm/jobsheets/[id]  — full job sheet detail
 * PATCH  /api/crm/jobsheets/[id]  — update job sheet (line items, status,
 *                                   work performed, materials, etc.)
 * DELETE /api/crm/jobsheets/[id]  — soft delete
 */

import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import CrmJobSheet from "@/models/CrmJobSheet";
import { logAction } from "@/lib/audit/logAction";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";
import { requireAssignedEngineer } from "@/core/access/crmJobsheetAccess";
// Required for .populate(...) below -- model must be registered before populate can resolve it.
import "@/models/User";
import "@/models/CrmCall";
import "@/models/Brand";
import "@/models/Series";
import "@/models/FaultCode";
import "@/models/SymptomCode";
import "@/models/Solution";
import "@/models/Variant";

function permissionErrorResponse(err: any) {
  return NextResponse.json(
    { success: false, message: err.message },
    { status: err.code === "FORBIDDEN" ? 403 : 401 }
  );
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("crm_jobsheets", "view"));
    } catch (err: any) {
      return permissionErrorResponse(err);
    }

    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: "Invalid job sheet id" }, { status: 400 });
    }

    await connectDB();

    const jobSheet = await CrmJobSheet.findOne({ _id: id, isDeleted: false })
      .populate("assignedTo", "name email")
      .populate("callId", "callNumber status")
      .populate("brandId", "name")
      .populate("seriesId", "name")
      .populate("variantId", "name")
      // Per-line Fault Phenomenon/Symptom/Solution -- needed both by the
      // repair page's dropdowns (to show the currently-selected value's
      // code+description, not just its id) and by the workorder/estimate
      // print, which was still showing the old flat description-only
      // format with no per-line diagnosis info at all.
      .populate("lineItems.faultCodeId", "code description")
      .populate("lineItems.symptomCodeId", "code description")
      .populate("lineItems.solutionId", "code description")
      .lean();

    if (!jobSheet) {
      return NextResponse.json({ success: false, message: "Job sheet not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, jobSheet });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

// status is deliberately excluded -- milestone transitions go through the
// dedicated routes (assign-engineer, start-repair, close, handover, cancel)
// so each transition can enforce its own preconditions (e.g. line items
// required to complete repair, payment mode required to hand over).
const ALLOWED_FIELDS = [
  "title",
  "description",
  "scheduledAt",
  "completedAt",
  "assignedTo",
  "lineItems",
  "materialsUsed",
  "workPerformed",
  "customerSignatureUrl",
  "internalNotes",
  "customerName",
  "company",
  "phone",
  "email",
  "address",
  "city",
  "state",
  "pincode",
  "product",
  "brandId",
  "deviceModel",
  "deviceModelId",
  "seriesId",
  "variantId",
  "imeiOrSerialNumber",
  "issueDescription",
  "faultCodeId",
  "remark",
  "warrantyStatus",
  "deviceAppearance",
  "fileBackupDescription",
  "standardAccessories",
  "specialDescription",
  "brandJobNoForPartOrder",
  "solutionId",
  "symptomCodeId",
  "serviceCharge",
  "warehouseId",
  "appointmentType",
  "requestType",
];

// Statuses that mean a SalesInvoice already exists — job sheet content
// (especially lineItems, which the invoice was built FROM) must not change
// underneath an invoice that's already been issued to the customer.
const LOCKED_AFTER_INVOICE = new Set(["REPAIR_COMPLETED", "CLOSED"]);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("crm_jobsheets", "edit"));
    } catch (err: any) {
      return permissionErrorResponse(err);
    }
    const userId = session.user.id;

    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: "Invalid job sheet id" }, { status: 400 });
    }

    await connectDB();

    const existing = await CrmJobSheet.findOne({ _id: id, isDeleted: false }).lean();
    if (!existing) {
      return NextResponse.json({ success: false, message: "Job sheet not found" }, { status: 404 });
    }

    const body = await req.json();
    const updates: any = {};
    for (const field of ALLOWED_FIELDS) {
      if (body[field] !== undefined) updates[field] = body[field];
    }
    // Enum fields -- an unset dropdown sends "" (cleared), which the
    // schema's enum validator would otherwise reject outright; treat that
    // as "leave unset" instead of a validation error.
    if (updates.deviceAppearance === "") delete updates.deviceAppearance;
    if (updates.fileBackupDescription === "") delete updates.fileBackupDescription;
    if (updates.warrantyStatus === "") delete updates.warrantyStatus;

    if (LOCKED_AFTER_INVOICE.has((existing as any).status) && updates.lineItems) {
      return NextResponse.json(
        { success: false, message: "Line items cannot be changed after the job has been invoiced." },
        { status: 409 }
      );
    }

    // Fixed Service Charge is Owner/Manager-only, per explicit direction --
    // enforced here too, not just by disabling the input client-side. Was
    // checking `updates.serviceCharge !== undefined`, i.e. merely PRESENT
    // in the request body -- but the detail page's save always sends the
    // current serviceCharge value regardless of whether it changed (it's
    // just part of the same PATCH as line items), so this 403'd every
    // single save an Engineer made (adding a part, etc.), not just an
    // actual attempt to change the charge. Now only enforced when the
    // value is actually different from what's already stored.
    if (
      updates.serviceCharge !== undefined &&
      Number(updates.serviceCharge) !== Number((existing as any).serviceCharge || 0) &&
      !session.isSuperAdmin
    ) {
      const roles = (session.roles || []).map((r: string) => r.toUpperCase());
      const allowed = roles.some((r) => r.includes("OWNER") || r.includes("MANAGER"));
      if (!allowed) {
        return NextResponse.json(
          { success: false, message: "Only an Owner or Manager can edit the service charge." },
          { status: 403 }
        );
      }
    }

    // The actual repair content -- line items, work performed, symptom/
    // solution, remark -- must be filled by the assigned engineer only,
    // per explicit direction, not the CCO. CCO holds CRM_JOBSHEETS.EDIT
    // too (for viewing, creating, converting calls, assigning engineers),
    // so the permission check above alone doesn't distinguish this; same
    // ownership check already enforced for start/resume/pause repair
    // actions (see requireAssignedEngineer).
    const ENGINEER_ONLY_FIELDS = ["lineItems", "workPerformed", "remark", "solutionId", "symptomCodeId"];
    if (ENGINEER_ONLY_FIELDS.some((f) => updates[f] !== undefined)) {
      const accessError = requireAssignedEngineer(existing, userId, !!session.isSuperAdmin);
      if (accessError) return accessError;
    }

    const jobSheet = await CrmJobSheet.findOneAndUpdate(
      { _id: id, isDeleted: false },
      { $set: updates },
      { new: true, runValidators: true }
    );

    logAction({
      action: "UPDATE",
      entity: "CrmJobSheet",
      entityId: id,
      after: updates,
      req,
      actor: { id: userId },
    });

    return NextResponse.json({ success: true, jobSheet });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("crm_jobsheets", "delete"));
    } catch (err: any) {
      return permissionErrorResponse(err);
    }
    const userId = session.user.id;

    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: "Invalid job sheet id" }, { status: 400 });
    }

    await connectDB();

    const jobSheet = await CrmJobSheet.findOne({ _id: id, isDeleted: false });
    if (!jobSheet) {
      return NextResponse.json({ success: false, message: "Job sheet not found" }, { status: 404 });
    }
    if (jobSheet.invoiceId) {
      return NextResponse.json(
        { success: false, message: "An invoiced job sheet cannot be deleted — cancel the invoice first." },
        { status: 409 }
      );
    }

    jobSheet.isDeleted = true;
    await jobSheet.save();

    logAction({
      action: "DELETE",
      entity: "CrmJobSheet",
      entityId: id,
      req,
      actor: { id: userId },
    });

    return NextResponse.json({ success: true, message: "Job sheet deleted" });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
