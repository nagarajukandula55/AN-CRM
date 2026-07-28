import { crmFetch } from "./client";

export interface CrmCallSummary {
  _id: string;
  callNumber: string;
  customerName: string;
  phone: string;
  subject: string;
  status: string;
  priority: string;
  createdAt: string;
}

export async function listCalls(status?: string): Promise<CrmCallSummary[]> {
  const qs = status && status !== "ALL" ? `?status=${encodeURIComponent(status)}` : "";
  const data = await crmFetch(`/api/crm/calls${qs}`);
  return data.calls || data.data || [];
}

export async function createCall(input: {
  customerName: string;
  phone: string;
  subject: string;
  description?: string;
  priority?: string;
}): Promise<CrmCallSummary> {
  const data = await crmFetch("/api/crm/calls", { method: "POST", body: JSON.stringify(input) });
  return data.call || data.data;
}
