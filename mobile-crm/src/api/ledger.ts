import { crmFetch } from "./client";

export interface LedgerParty {
  key: string;
  name: string;
  phone?: string;
  balance: number;
}

export interface LedgerTransaction {
  date: string;
  type: "Invoice" | "Payment" | "Credit Note" | "Debit Note";
  reference: string;
  description: string;
  amount: number;
  balance: number;
}

export interface LedgerPartyDetail {
  party: { name: string; phone?: string };
  transactions: LedgerTransaction[];
  closingBalance: number;
}

export async function listLedgerParties(from?: string, to?: string): Promise<LedgerParty[]> {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const qs = params.toString() ? `?${params.toString()}` : "";
  const data = await crmFetch(`/api/vendor/ledger${qs}`);
  return data.parties || [];
}

export async function getLedgerParty(key: string, from?: string, to?: string): Promise<LedgerPartyDetail> {
  const params = new URLSearchParams();
  params.set("customer", key);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const data = await crmFetch(`/api/vendor/ledger?${params.toString()}`);
  return { party: data.party, transactions: data.transactions || [], closingBalance: data.closingBalance || 0 };
}
