export interface InvoiceCustomer {
  name: string;
  phone?: string;
  email?: string;
  gstNumber?: string;
  address: string;
  city?: string;
  state?: string;
  pincode?: string;
}

export interface InvoiceItem {
  productId: string;
  name: string;
  hsn?: string;

  qty: number;
  rate: number;

  gstPercent: number;

  taxableValue: number;

  cgst: number;
  sgst: number;
  igst: number;

  total: number;
}

export interface InvoiceSummary {
  subtotal: number;
  discount?: number;

  taxableAmount: number;

  cgst: number;
  sgst: number;
  igst: number;

  grandTotal: number;
}

export interface InvoiceData {
  invoiceNumber: string;
  orderId: string;
  invoiceDate: Date;

  invoiceType: "B2B" | "B2C";

  company: {
    name: string;
    tagLine?: string;
    address1: string;
    address2?: string;
    city: string;
    state: string;
    gstin: string;
    phone?: string;
    email?: string;
  };

  billTo: InvoiceCustomer;
  shipTo: InvoiceCustomer;

  payment: {
    method: string;
    status: string;
    transactionId?: string;
  };

  items: InvoiceItem;

  summary: InvoiceSummary;

  qrCodeUrl?: string;

  irn?: string;
}
