/**
 * POST /api/crm/calls/[id]/log — record a call disposition (the actual
 * "call happened, here's what was said" entry). This is distinct from
 * PATCH /api/crm/calls/[id], which edits the call's own fields — logging a
 * disposition APPENDS to callLogs and also nudges status forward when it
 * makes sense (e.g. first log on a NEW call bumps it to CONTACTED).
 */

import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import CrmCall, { CrmCallDisposition } from "@/models/CrmCall";
import { logAction } from "@/lib/audit/logAction";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";

const VALID_DISPOSITIONS: CrmCallDisposition[] = [
  "INTERESTED",
  "CALLBACK_REQUESTED",
  "NOT_INTERESTED",
  "NO_ANSWER",
  "WRONG_NUMBER",
  "CONVERTED",
  "OTHER",
];

// Disposition -> suggested next status. Deliberately a suggestion applied
// automatically only when it doesn't conflict with a terminal state the
// call may already be in — callers can still PATCH status explicitly for
// anything unusual.
const DISPOSITION_STATUS_MAP: Record<CrmCallDisposition, string | null> = {
  INTERESTED: "QUALIFIED",
  CALLBACK_REQUESTED: "CONTACTED",
  NOT_INTERESTED: "NOT_INTERESTED",
  NO_ANSWER: "NO_RESPONSE",
  WRONG_NUMBER: "NOT_INTERESTED",
  CONVERTED: "JOB_CREATED",
  OTHER: "CONTACTED",
};

const TERMINAL_STATUSES = new Set(["CLOSED_WON", "CLOSED_LOST", "JOB_CREATED"]);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("crm_calls", "edit"));
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

    const body = await req.json();
    const { disposition, notes, nextFollowUpAt } = body;

    if (!disposition || !VALID_DISPOSITIONS.includes(disposition)) {
      return NextResponse.json(
        { success: false, message: `disposition must be one of: ${VALID_DISPOSITIONS.join(", ")}` },
        { status: 400 }
      );
    }

    await connectDB();

    const call = await CrmCall.findOne({ _id: id, isDeleted: false });
    if (!call) {
      return NextResponse.json({ success: false, message: "Call not found" }, { status: 404 });
    }

    call.callLogs.push({
      disposition,
      notes: notes || "",
      nextFollowUpAt: nextFollowUpAt ? new Date(nextFollowUpAt) : undefined,
      calledBy: new mongoose.Types.ObjectId(userId),
      calledAt: new Date(),
    } as any);

    const suggestedStatus = DISPOSITION_STATUS_MAP[disposition as CrmCallDisposition];
    if (suggestedStatus && !TERMINAL_STATUSES.has(call.status)) {
      call.status = suggestedStatus as any;
    }

    if (nextFollowUpAt) {
      call.nextFollowUpAt = new Date(nextFollowUpAt);
    }

    await call.save();

    logAction({
      action: "CALL_LOGGED",
      entity: "CrmCall",
      entityId: id,
      after: { disposition, notes, nextFollowUpAt },
      req,
      actor: { id: userId },
    });

    return NextResponse.json({ success: true, call });
  } catch (err: any) {
    console.error("CRM call log error:", err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
