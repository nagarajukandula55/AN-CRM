import { crmFetch } from "./client";

export interface JobSheetLineItem {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  taxRate: number;
  hsnCode?: string;
  materialCode?: string;
  cost?: number;
  serviceCenterBOMId?: string;
}

export interface JobSheet {
  _id: string;
  jobSheetNumber: string;
  status: string;
  product?: string;
  customerName?: string;
  customerPhone?: string;
  assignedToName?: string;
  ccoName?: string;
  lineItems?: JobSheetLineItem[];
  workPerformed?: string;
  materialsUsed?: string;
  customerSignatureUrl?: string;
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
 * a mobile user can trigger with a single tap; PART_PENDING/HANDOVER stay
 * web-admin only for this pass (see README).
 */
const NEXT_ACTION: Record<string, { path: string; label: string } | undefined> = {
  CREATED: { path: "start-repair", label: "Start Repair" },
};

export function nextActionFor(status: string) {
  return NEXT_ACTION[status];
}

export async function advanceJobSheet(id: string, path: string): Promise<JobSheet> {
  const data = await crmFetch(`/api/crm/jobsheets/${id}/${path}`, { method: "POST", body: JSON.stringify({}) });
  return data.jobSheet || data.data;
}

/** Saves parts/notes onto the job sheet mid-repair -- a plain field PATCH (allowed per ALLOWED_FIELDS), NOT a status transition. */
export async function saveRepairProgress(
  id: string,
  patch: { lineItems?: JobSheetLineItem[]; workPerformed?: string; materialsUsed?: string; customerSignatureUrl?: string }
): Promise<JobSheet> {
  const data = await crmFetch(`/api/crm/jobsheets/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
  return data.jobSheet || data.data;
}

/** REPAIR_IN_PROGRESS -> REPAIR_COMPLETED, generates the SalesInvoice from the job sheet's already-saved lineItems (see api/crm/jobsheets/[id]/close/route.ts). */
export async function closeRepair(id: string): Promise<{ jobSheet: JobSheet; invoice: { invoiceNumber: string; grandTotal: number } }> {
  const data = await crmFetch(`/api/crm/jobsheets/${id}/close`, { method: "POST", body: JSON.stringify({}) });
  return { jobSheet: data.jobSheet, invoice: data.invoice };
}
