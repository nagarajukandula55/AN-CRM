/**
 * numbering.service — LEGACY COMPATIBILITY SHIM.
 *
 * This file used to contain its own complete numbering engine (a private
 * generateSequence() reading business.documents[type].numbering.prefix and
 * writing to the OLD Sequence model). It is now a thin wrapper around the
 * canonical core/numbering/numberingService.ts (which reads the SAME
 * DocumentNumberConfig the Settings > Document Numbers admin UI uses, and
 * writes to the single consolidated NumberSequence collection) — kept only
 * so purchaseOrder.service.ts's existing import of
 * `generatePurchaseOrderNumber` from here keeps working without an extra
 * edit. See core/numbering/types.ts for the full consolidation writeup.
 *
 * New code should import generateDocumentNumber directly from
 * core/numbering/numberingService instead of adding new wrappers here.
 */

import { generateDocumentNumber } from "@/core/numbering/numberingService";

export async function generatePurchaseOrderNumber(business: any): Promise<string> {
  const { value } = await generateDocumentNumber(String(business?._id ?? business), "PURCHASE_ORDER");
  return value;
}

export async function generateGRNNumber(business: any): Promise<string> {
  const { value } = await generateDocumentNumber(String(business?._id ?? business), "GRN");
  return value;
}

export async function generateSalesOrderNumber(business: any): Promise<string> {
  const { value } = await generateDocumentNumber(String(business?._id ?? business), "SALES_ORDER");
  return value;
}

export async function generateProductCode(business: any): Promise<string> {
  const { value } = await generateDocumentNumber(String(business?._id ?? business), "PRODUCT");
  return value;
}

export async function generateVariantCode(business: any): Promise<string> {
  const { value } = await generateDocumentNumber(String(business?._id ?? business), "PRODUCT_VARIANT");
  return value;
}

export async function generateVendorProductCode(business: any): Promise<string> {
  const { value } = await generateDocumentNumber(String(business?._id ?? business), "VENDOR_PRODUCT");
  return value;
}

export async function generateStockAdjustmentNumber(business: any): Promise<string> {
  const { value } = await generateDocumentNumber(String(business?._id ?? business), "STOCK_ADJUSTMENT", { vendorId: "" });
  return value;
}

export async function generateTransferNumber(business: any): Promise<string> {
  const { value } = await generateDocumentNumber(String(business?._id ?? business), "STOCK_TRANSFER");
  return value;
}

export async function generateProductionOrderNumber(business: any): Promise<string> {
  const { value } = await generateDocumentNumber(String(business?._id ?? business), "PRODUCTION_ORDER");
  return value;
}

export async function generateBatchNumber(business: any): Promise<string> {
  const { value } = await generateDocumentNumber(String(business?._id ?? business), "BATCH");
  return value;
}

export async function generateCustomerOrderNumber(business: any): Promise<string> {
  const { value } = await generateDocumentNumber(String(business?._id ?? business), "CUSTOMER_ORDER");
  return value;
}

export async function generateCreditNoteNumber(business: any): Promise<string> {
  const { value } = await generateDocumentNumber(String(business?._id ?? business), "CREDIT_NOTE");
  return value;
}

export async function generateDebitNoteNumber(business: any): Promise<string> {
  const { value } = await generateDocumentNumber(String(business?._id ?? business), "DEBIT_NOTE");
  return value;
}

export async function generateInvoiceNumber(business: any): Promise<string> {
  const { value } = await generateDocumentNumber(String(business?._id ?? business), "INVOICE", { vendorId: "" });
  return value;
}

export async function generateReceiptNumber(business: any): Promise<string> {
  const { value } = await generateDocumentNumber(String(business?._id ?? business), "RECEIPT");
  return value;
}
