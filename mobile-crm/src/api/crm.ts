import { crmFetch } from "./client";

export interface JobSheet {
  _id: string;
  jobSheetNumber: string;
  status: string;
  product?: string;
  customerName?: string;
  customerPhone?: string;
  assignedToName?: string;
  ccoName?: string;
  createdAt: string;
}

export async function listJobSheets(status?: string): Promise<JobSheet[]> {
  const qs = status && status !== "ALL" ? `?status=${encodeURIComponent(status)}` : "";
  const data = await crmFetch(`/api/crm/jobsheets${qs}`);
  return data.jobSheets || data.data || [];
}

export async function getJobSheet(id: string): Promise<JobSheet> {
  const data = await crmFetch(`/api/crm/jobsheets/${id}`);
  return data.jobSheet || data.data;
}

/**
 * Job sheet status is NOT a plain field update -- each transition is its
 * own dedicated route so it can enforce its own preconditions (see
 * api/crm/jobsheets/[id]/route.ts's ALLOWED_FIELDS comment: "status is
 * deliberately excluded -- milestone transitions go through the dedicated
 * routes"). This maps the current status to the one valid next-step route
 * a mobile user can trigger with a single tap; anything needing form input
 * (close, handover, part-pending) is left for the full web admin.
 */
const NEXT_ACTION: Record<string, { path: string; label: string } | undefined> = {
  CREATED: { path: "start-repair", label: "Start Repair" },
  REPAIR_IN_PROGRESS: undefined, // close/part-pending need form input -- web admin only
};

export function nextActionFor(status: string) {
  return NEXT_ACTION[status];
}

export async function advanceJobSheet(id: string, path: string): Promise<JobSheet> {
  const data = await crmFetch(`/api/crm/jobsheets/${id}/${path}`, { method: "POST", body: JSON.stringify({}) });
  return data.jobSheet || data.data;
}
