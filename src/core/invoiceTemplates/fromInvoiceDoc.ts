/**
 * Maps a saved Invoice document (+ its Order + Business) into the shared
 * InvoiceRenderData shape every layout renders from. This is the SAME
 * shape api/invoice/view/[invoiceNumber]/route.ts builds inline for the
 * live view page — pulled out here so api/invoice/generate/route.ts (the
 * Cloudinary-snapshot-at-checkout path) can build the exact same data and
 * render through the exact same layout registry, instead of the old
 * separate buildInvoiceTemplate()/generateInvoiceHTML() pair that used a
 * different, simpler shape and never reflected an admin's chosen template.
 */

import { getStateCode } from "@/core/gst/stateCodes";
import type { InvoiceRenderData } from "./types";

/**
 * Loose shape covering exactly the fields this mapper reads off a saved
 * SalesInvoice document (the canonical invoice model — models/Invoice.ts
 * was merged into it, see SalesInvoice.ts's top comment).
 */
interface InvoiceDocLike {
  invoiceNumber: string;
  invoiceType?: string;
  createdAt?: Date;
  status?: string;
  subtotal?: number;
  discountAmount?: number;
  cgstTotal?: number;
  sgstTotal?: number;
  igstTotal?: number;
  grandTotal?: number;
  customer?: {
    name?: string;
    phone?: string;
    address?: string;
    city?: string;
    state?: string;
    pincode?: string;
    gstin?: string;
  };
  items?: Array<{
    description?: string;
    hsnCode?: string;
    quantity?: number;
    unitPrice?: number;
    assessableValue?: number;
    taxRate?: number;
    cgstAmount?: number;
    sgstAmount?: number;
    igstAmount?: number;
    total?: number;
  }>;
}

export function buildRenderDataFromInvoice(
  invoice: InvoiceDocLike,
  order: { createdAt?: Date; orderId?: string; payment?: { method?: string; razorpayPaymentId?: string; paymentId?: string; transactionId?: string } } | null,
  business: { name?: string; legalName?: string; address?: string; city?: string; state?: string; phone?: string; logo?: string; compliance?: { gstNumber?: string } } | null
): InvoiceRenderData {
  const stateCode = getStateCode(invoice.customer?.state);

  return {
    invoiceNumber: invoice.invoiceNumber,
    invoiceDate: invoice.createdAt || new Date(),
    orderDate: order?.createdAt,
    orderId: order?.orderId,
    type: invoice.invoiceType,
    company: {
      name: business?.name || business?.legalName || process.env.COMPANY_NAME || "Business",
      tagline: process.env.COMPANY_TAGLINE || "",
      address1: business?.address || process.env.COMPANY_ADDRESS1 || "",
      address2: process.env.COMPANY_ADDRESS2 || "",
      city: business?.city || process.env.COMPANY_CITY || "",
      state: business?.state || process.env.COMPANY_STATE || "",
      gstin: business?.compliance?.gstNumber || process.env.COMPANY_GSTIN || "",
      phone: business?.phone || process.env.COMPANY_PHONE || "",
      logoUrl: business?.logo || "",
    },
    customer: {
      name: invoice.customer?.name,
      phone: invoice.customer?.phone,
      address: invoice.customer?.address,
      city: invoice.customer?.city,
      state: invoice.customer?.state,
      pincode: invoice.customer?.pincode,
      gstin: invoice.customer?.gstin,
      stateCode,
    },
    shipping: {
      name: invoice.customer?.name,
      phone: invoice.customer?.phone,
      address: invoice.customer?.address,
      city: invoice.customer?.city,
      state: invoice.customer?.state,
      pincode: invoice.customer?.pincode,
    },
    payment: {
      method: order?.payment?.method || "ONLINE",
      status: invoice.status,
      transactionId:
        order?.payment?.razorpayPaymentId ||
        order?.payment?.paymentId ||
        order?.payment?.transactionId ||
        "",
    },
    items: (invoice.items || []).map((item: any) => ({
      name: item.description,
      hsn: item.hsnCode,
      qty: item.quantity,
      rate: item.unitPrice,
      discount: 0,
      taxable: item.assessableValue || 0,
      gstPercent: item.taxRate || 0,
      cgst: item.cgstAmount || 0,
      sgst: item.sgstAmount || 0,
      igst: item.igstAmount || 0,
      total: item.total || 0,
    })),
    summary: {
      subtotal: invoice.subtotal || 0,
      discount: invoice.discountAmount || 0,
      taxable: (invoice.subtotal || 0) - (invoice.discountAmount || 0),
      cgst: invoice.cgstTotal || 0,
      sgst: invoice.sgstTotal || 0,
      igst: invoice.igstTotal || 0,
      grandTotal: invoice.grandTotal || 0,
    },
    placeOfSupply: invoice.customer?.state,
    stateCode,
    supplyType: invoice.invoiceType === "B2B" ? "Business" : "Consumer",
  };
}
