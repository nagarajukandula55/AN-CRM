import SalesInvoice from "@/models/SalesInvoice";
import { stockOut } from "@/services/stock.service";
import { generateDocumentNumber } from "@/core/numbering/numberingService";

/**
 * REMOVED: a private `generateInvoiceNumber() { return "INV-" + Date.now() }`
 * used to live here — unsafe (Date.now() can collide under concurrent
 * requests within the same millisecond) and completely bypassed the
 * admin-configurable numbering format in Settings > Document Numbers. Now
 * calls the canonical core/numbering/numberingService.ts, same as every
 * other document type. See core/numbering/types.ts for the full
 * consolidation writeup.
 */

/* =========================================================
🔥 CREATE SALES INVOICE (CORE FLOW)
========================================================= */
export async function createSalesInvoice(payload: any) {
  const {
    businessId,
    customerName,
    items,
    warehouseId,
    createdBy,
  } = payload;

  if (!items?.length) {
    throw new Error("Items required");
  }

  if (!businessId) {
    throw new Error("businessId is required");
  }

  /* ================= CALCULATE TOTAL ================= */
  let totalAmount = 0;

  for (const item of items) {
    item.total = item.quantity * item.rate;
    totalAmount += item.total;
  }

  /* ================= GENERATE INVOICE NUMBER ================= */
  const { value: invoiceNumber } = await generateDocumentNumber(businessId, "INVOICE", { vendorId: "" });

  /* ================= CREATE INVOICE ================= */
  const invoice = await SalesInvoice.create({
    invoiceNumber,
    businessId,
    customerName,
    items,
    totalAmount,
    createdBy,
  });

  /* =========================================================
  🔥 STOCK OUT FOR EACH ITEM
  ========================================================= */
  for (const item of items) {
    await stockOut({
      businessId,
      materialId: item.materialId,
      warehouseId,
      quantity: item.quantity,
      referenceType: "SALES",
      referenceId: invoice._id,
      createdBy,
    });
  }

  return invoice;
}

/* =========================================================
📦 GET ALL INVOICES
========================================================= */
export async function getAllInvoices() {
  return SalesInvoice.find()
    .populate("items.materialId")
    .sort({ createdAt: -1 });
}

/* =========================================================
📄 GET INVOICE BY ID
========================================================= */
export async function getInvoiceById(id: string) {
  return SalesInvoice.findById(id).populate("items.materialId");
}
