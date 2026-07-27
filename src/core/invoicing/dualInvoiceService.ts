import mongoose from "mongoose";
import Order from "@/models/Order";
import Business from "@/models/Business";
import VendorPayoutAccount from "@/models/VendorPayoutAccount";
import SalesInvoice from "@/models/SalesInvoice";
import { generateDocumentNumber } from "@/core/numbering/numberingService";

/**
 * Marketplace dual-invoice generation — per explicit user requirement:
 * when a customer places an order fulfilled (in whole or part) by a
 * vendor, generate a B2B invoice (vendor -> this business, at the
 * vendor's cost/wholesale basis) in addition to the B2C invoice (this
 * business -> the customer, at the sale price), instead of only settling
 * the vendor's payout (core/payouts/vendorSettlement.service.ts already
 * does that half). Configurable per business via
 * Business.invoicingRules — see models/Business.ts's InvoicingRulesSchema
 * comment for the vendorCostBasis options and rationale.
 *
 * Only runs when Business.invoicingRules.dualInvoiceMode is true; callers
 * should fall back to the single-invoice path (createInvoiceForOrder)
 * otherwise, since this changes what "the order's invoice" means.
 */

interface VendorCostResult {
  vendorId: string;
  items: any[];
  costTotal: number;
}

async function computeVendorCost(
  vendorId: string,
  vendorItems: any[],
  costBasis: string,
  fixedMarginPercent: number
): Promise<VendorCostResult> {
  const grossAmount = vendorItems.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0);

  let costTotal = grossAmount;

  if (costBasis === "NET_PAYOUT") {
    const payoutAccount = await VendorPayoutAccount.findOne({ vendorId }).lean();
    const commissionPercent = (payoutAccount as any)?.platformCommissionPercent ?? 10;
    costTotal = Math.round(grossAmount * (1 - commissionPercent / 100) * 100) / 100;
  } else if (costBasis === "FIXED_MARGIN_PERCENT") {
    costTotal = Math.round(grossAmount * (1 - fixedMarginPercent / 100) * 100) / 100;
  } else if (costBasis === "VENDOR_DECLARED") {
    costTotal = vendorItems.reduce((sum, item) => {
      const declaredUnit = Number(item.price || item.sellingPrice || 0);
      return sum + declaredUnit * Number(item.qty || 1);
    }, 0);
  }
  // GROSS_AMOUNT: costTotal already equals grossAmount, no adjustment.

  return { vendorId, items: vendorItems, costTotal };
}

function buildInvoiceItems(items: any[], amountOverrideTotal?: number) {
  // When a cost basis other than the raw line totals is used (e.g.
  // FIXED_MARGIN_PERCENT/VENDOR_DECLARED), scale each line proportionally
  // so the invoice's own item totals still sum to the invoice grand total,
  // rather than silently drifting from it.
  const rawTotal = items.reduce((s, i) => s + Number(i.lineTotal || 0), 0);
  const scale = amountOverrideTotal != null && rawTotal > 0 ? amountOverrideTotal / rawTotal : 1;

  let subtotal = 0;
  let cgstTotal = 0;
  let sgstTotal = 0;
  let igstTotal = 0;

  const invoiceItems = items.map((item: any) => {
    const qty = Number(item.qty || 1);
    const unitPrice = Number(item.price || item.sellingPrice || 0) * scale;
    const cgst = Number(item.cgst || item.cgstAmount || 0) * scale;
    const sgst = Number(item.sgst || item.sgstAmount || 0) * scale;
    const igst = Number(item.igst || item.igstAmount || 0) * scale;
    const taxableValue = Number(item.taxableValue || qty * unitPrice) * (amountOverrideTotal != null ? scale : 1);
    const lineTotal = Number(item.lineTotal || 0) * scale;

    subtotal += taxableValue || qty * unitPrice;
    cgstTotal += cgst;
    sgstTotal += sgst;
    igstTotal += igst;

    return {
      description: item.name || "",
      hsnCode: item.hsn || "1101",
      quantity: qty,
      unit: "pcs",
      unitPrice,
      taxRate: Number(item.gstRate || item.gstPercent || 0),
      taxAmount: cgst + sgst + igst,
      cgstRate: cgst ? Number(item.gstRate || item.gstPercent || 0) / 2 : 0,
      cgstAmount: cgst,
      sgstRate: sgst ? Number(item.gstRate || item.gstPercent || 0) / 2 : 0,
      sgstAmount: sgst,
      igstRate: igst ? Number(item.gstRate || item.gstPercent || 0) : 0,
      igstAmount: igst,
      assessableValue: taxableValue || qty * unitPrice,
      total: lineTotal || taxableValue + cgst + sgst + igst,
    };
  });

  return { invoiceItems, subtotal, cgstTotal, sgstTotal, igstTotal };
}

export async function generateDualInvoicesForOrder(orderId: string) {
  const order = await Order.findOne({ orderId });
  if (!order) throw new Error("Order not found");

  const business = order.businessId ? await Business.findById(order.businessId).lean() : null;
  const rules = (business as any)?.invoicingRules || {};
  const costBasis = rules.vendorCostBasis || "NET_PAYOUT";
  const fixedMarginPercent = Number(rules.fixedMarginPercent || 0);
  const supplyType = rules.defaultSupplyType || "INTRASTATE";

  // Skip if already generated for this order (idempotent, same pattern as
  // createInvoiceForOrder / CRM jobsheet close).
  const existingB2C = await SalesInvoice.findOne({
    sourceOrderId: String(order._id),
    invoiceType: "B2C",
  }).lean();
  if (existingB2C) {
    const existingB2B = await SalesInvoice.find({
      sourceOrderId: String(order._id),
      invoiceType: "B2B",
    }).lean();
    return { b2c: existingB2C, b2bInvoices: existingB2B };
  }

  const items: any[] = Array.isArray(order.cart) ? order.cart : Array.isArray(order.items) ? order.items : [];
  const byVendor = new Map<string, any[]>();
  for (const item of items) {
    if (!item.vendorId) continue;
    const list = byVendor.get(item.vendorId) || [];
    list.push(item);
    byVendor.set(item.vendorId, list);
  }

  // ── B2B leg: one invoice per vendor, at their cost basis ──────────────
  const b2bInvoices = [];
  for (const [vendorId, vendorItems] of byVendor.entries()) {
    const { costTotal } = await computeVendorCost(vendorId, vendorItems, costBasis, fixedMarginPercent);
    const { invoiceItems, subtotal, cgstTotal, sgstTotal, igstTotal } = buildInvoiceItems(vendorItems, costTotal);
    const taxTotal = cgstTotal + sgstTotal + igstTotal;

    const { value: invoiceNumber } = await generateDocumentNumber(String(order.businessId || ""), "INVOICE", { vendorId: String(vendorId) });

    const b2bInvoice = await SalesInvoice.create({
      businessId: order.businessId,
      vendorId: new mongoose.Types.ObjectId(vendorId),
      sourceOrderId: String(order._id),
      invoiceNumber,
      invoiceType: "B2B",
      supplyType,
      customer: {
        name: (business as any)?.name || "Business",
        gstin: (business as any)?.compliance?.gstNumber,
        address: (business as any)?.address,
        city: (business as any)?.city,
        state: (business as any)?.state,
      },
      items: invoiceItems,
      subtotal,
      cgstTotal,
      sgstTotal,
      igstTotal,
      taxTotal,
      grandTotal: costTotal,
      status: "SENT",
      notes: `Vendor cost basis: ${costBasis}. Auto-generated from order ${order.orderId}.`,
    });
    b2bInvoices.push(b2bInvoice);
  }

  // ── B2C leg: one invoice for the whole order, at customer sale price ──
  const { invoiceItems, subtotal, cgstTotal, sgstTotal, igstTotal } = buildInvoiceItems(items);
  const taxTotal = cgstTotal + sgstTotal + igstTotal;
  const discountValue = Number(order.discount || 0);
  const grandTotal = Number(order.amount || subtotal + taxTotal - discountValue);

  const { value: b2cInvoiceNumber } = await generateDocumentNumber(String(order.businessId || ""), "INVOICE", { vendorId: "" });

  const b2c = await SalesInvoice.create({
    businessId: order.businessId,
    sourceOrderId: String(order._id),
    invoiceNumber: b2cInvoiceNumber,
    invoiceType: "B2C",
    supplyType,
    customer: {
      name: order.address?.name || "",
      phone: order.address?.phone || "",
      email: order.address?.email || "",
      gstin: order.address?.gstNumber || "",
      address: order.address?.address || "",
      city: order.address?.city || "",
      state: order.address?.state || "",
      pincode: order.address?.pincode || "",
    },
    items: invoiceItems,
    subtotal,
    discountAmount: discountValue,
    cgstTotal,
    sgstTotal,
    igstTotal,
    taxTotal,
    grandTotal,
    status: "SENT",
    isLocked: true,
    notes: b2bInvoices.length
      ? `Marketplace order — ${b2bInvoices.length} vendor B2B invoice(s) also generated.`
      : undefined,
  });

  return { b2c, b2bInvoices };
}

/**
 * "B2B2C" is not a distinct invoice type in this system -- it's the label
 * for the vendor -> AN Group -> end customer chain generateDualInvoicesForOrder
 * already produces above (a B2B leg per fulfilling vendor + one B2C leg for
 * the order), linked by the shared sourceOrderId. This returns that full
 * chain for a given order so a print/view page can show "part of a B2B2C
 * chain" with links to the sibling invoice(s), without inventing a new
 * generation path or a third invoiceType value.
 */
export async function getB2B2CChain(sourceOrderId: string) {
  const invoices = await SalesInvoice.find({ sourceOrderId }).sort({ invoiceType: 1, createdAt: 1 }).lean();
  const b2b = invoices.filter((inv: any) => inv.invoiceType === "B2B");
  const b2c = invoices.filter((inv: any) => inv.invoiceType === "B2C");
  return {
    isB2B2C: b2b.length > 0 && b2c.length > 0,
    b2b,
    b2c,
  };
}
