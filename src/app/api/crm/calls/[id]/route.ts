/**
 * CRM Call Detail
 * GET    /api/crm/calls/[id]  — full call detail (with call log history)
 * PATCH  /api/crm/calls/[id]  — update call fields / status
 * DELETE /api/crm/calls/[id]  — soft delete
 */

import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import CrmCall from "@/models/CrmCall";
import { logAction } from "@/lib/audit/logAction";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";
// Required for .populate(...) below -- model must be registered before populate can resolve it.
import "@/models/User";

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
      requirePermission(session as any, buildPermissionCode("crm_calls", "view"));
    } catch (err: any) {
      return permissionErrorResponse(err);
    }

    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: "Invalid call id" }, { status: 400 });
    }

    await connectDB();

    const call = await CrmCall.findOne({ _id: id, isDeleted: false })
      .populate("assignedTo", "name email")
      .populate("callLogs.calledBy", "name email")
      .lean();

    if (!call) {
      return NextResponse.json({ success: false, message: "Call not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, call });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

const ALLOWED_FIELDS = [
  "customerName",
  "company",
  "phone",
  "email",
  "address",
  "city",
  "state",
  "pincode",
  "source",
  "product",
  "brandId",
  "deviceModel",
  "subject",
  "description",
  "priority",
  "appointmentType",
  "requestType",
  "appointmentDate",
  "status",
  "assignedTo",
  "nextFollowUpAt",
  "estimatedValue",
  "currency",
  "tags",
  "closedReason",
];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("crm_calls", "edit"));
    } catch (err: any) {
      return permissionErrorResponse(err);
    }
    const userId = session.user.id;

    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: "Invalid call id" }, { status: 400 });
    }

    await connectDB();

    const body = await req.json();
    const updates: any = {};
    for (const field of ALLOWED_FIELDS) {
      if (body[field] !== undefined) updates[field] = body[field];
    }

    // Closing a call (won or lost) stamps closedAt automatically — callers
    // shouldn't have to remember to set this themselves, and it must always
    // reflect the actual transition time, not whatever the client sends.
    if (updates.status === "CLOSED_WON" || updates.status === "CLOSED_LOST") {
      updates.closedAt = new Date();
    }

    const call = await CrmCall.findOneAndUpdate(
      { _id: id, isDeleted: false },
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!call) {
      return NextResponse.json({ success: false, message: "Call not found" }, { status: 404 });
    }

    logAction({
      action: "UPDATE",
      entity: "CrmCall",
      entityId: id,
      after: updates,
      req,
      actor: { id: userId },
    });

    return NextResponse.json({ success: true, call });
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
      requirePermission(session as any, buildPermissionCode("crm_calls", "delete"));
    } catch (err: any) {
      return permissionErrorResponse(err);
    }
    const userId = session.user.id;

    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: "Invalid call id" }, { status: 400 });
    }

    await connectDB();

    const call = await CrmCall.findOneAndUpdate(
      { _id: id, isDeleted: false },
      { $set: { isDeleted: true } },
      { new: true }
    );

    if (!call) {
      return NextResponse.json({ success: false, message: "Call not found" }, { status: 404 });
    }

    logAction({
      action: "DELETE",
      entity: "CrmCall",
      entityId: id,
      req,
      actor: { id: userId },
    });

    return NextResponse.json({ success: true, message: "Call deleted" });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
