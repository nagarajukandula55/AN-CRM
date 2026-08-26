import { crmFetch } from "./client";

export interface ProfitLossReport {
  range: { from: string; to: string };
  revenue: number;
  cogs: number;
  grossProfit: number;
  expenses: number;
  expenseByCategory: Record<string, number>;
  netProfit: number;
  invoiceCount: number;
}

export async function getProfitLoss(from?: string, to?: string): Promise<ProfitLossReport> {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const qs = params.toString() ? `?${params.toString()}` : "";
  const data = await crmFetch(`/api/vendor/profit-loss${qs}`);
  const { success, ...rest } = data;
  return rest as ProfitLossReport;
}
