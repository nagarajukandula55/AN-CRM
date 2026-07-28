import { crmFetch } from "./client";

export interface CartItem {
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  hsnCode: string;
}

export interface PosInvoiceResult {
  invoiceNumber: string;
  grandTotal: number;
}

export async function createPosInvoice(input: {
  customer: { name: string; phone?: string; company?: string; gstNumber?: string };
  items: CartItem[];
  discountAmount: number;
  paymentMode: string;
  amountPaid: number;
}): Promise<PosInvoiceResult> {
  const data = await crmFetch("/api/pos/invoices", { method: "POST", body: JSON.stringify(input) });
  return data.invoice;
}
