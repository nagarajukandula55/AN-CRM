import { NextResponse } from "next/server";

/**
 * Per explicit direction: once a job sheet is assigned, the actual hands-on
 * repair steps (start/resume/pause) belong to the assigned engineer only --
 * not a CCO, even though a CCO also holds CRM_JOBSHEETS.EDIT for oversight
 * (viewing, creating, converting calls). A super admin can still override
 * for support purposes. Closing/handover (billing, payment collection)
 * stay open to whoever has crm_jobsheets.edit -- those are CCO/Manager
 * tasks, not repair-execution ones.
 */
export function requireAssignedEngineer(
  jobSheet: { assignedTo?: unknown },
  userId: string,
  isSuperAdmin: boolean
): NextResponse | null {
  if (isSuperAdmin) return null;
  const assignedTo = jobSheet.assignedTo ? String(jobSheet.assignedTo) : null;
  if (!assignedTo) {
    return NextResponse.json(
      { success: false, message: "This job sheet has no engineer assigned yet." },
      { status: 409 }
    );
  }
  if (assignedTo !== userId) {
    return NextResponse.json(
      { success: false, message: "Only the engineer this job sheet is assigned to can perform this action." },
      { status: 403 }
    );
  }
  return null;
}
