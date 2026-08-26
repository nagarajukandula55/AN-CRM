import { crmFetch } from "./client";

export interface Expense {
  _id: string;
  date: string;
  category: string;
  description?: string;
  amount: number;
  paymentMode?: "CASH" | "UPI" | "BANK_TRANSFER" | "CARD" | "OTHER";
}

export interface ExpensesResult {
  expenses: Expense[];
  total: number;
  categories: string[];
}

export async function listExpenses(from?: string, to?: string): Promise<ExpensesResult> {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const qs = params.toString() ? `?${params.toString()}` : "";
  const data = await crmFetch(`/api/vendor/expenses${qs}`);
  return { expenses: data.expenses || [], total: data.total || 0, categories: data.categories || [] };
}

export async function createExpense(input: {
  date?: string;
  category: string;
  description?: string;
  amount: number;
  paymentMode?: string;
}): Promise<Expense> {
  const data = await crmFetch("/api/vendor/expenses", { method: "POST", body: JSON.stringify(input) });
  return data.expense;
}

export async function deleteExpense(id: string): Promise<void> {
  await crmFetch(`/api/vendor/expenses/${id}`, { method: "DELETE" });
}
