import SalesInvoice from "@/models/SalesInvoice";
import Order from "@/models/Order";
import Business from "@/models/Business";
import { generateDocumentNumber } from "@/core/numbering/numberingService";
import { generateDualInvoicesForOrder } from "@/core/invoicing/dualInvoiceService";

/**
 * CREATE INVOICE FOR ORDER
 * SAFE + IDEMPOTENT
 *
 * Was writing to the old Invoice model (a schema with fields like
 * `paymentStatus`, flat `cgst`/`sgst`/`igst`, no `isDeleted`) that's been
 * merged into SalesInvoice — the same model the CRM job-sheet-close flow
 * and the finance module now both use, so there's a single invoicing
 * system instead of two. Field mapping preserved 1:1 in meaning: orderId ->
 * sourceOrderId (string), flat cgst/sgst/igst -> cgstTotal/sgstTotal/
 * igstTotal, paymentStatus folded into the single `status` field (SENT ~
 * pending, PAID ~ paid, FAILED/PARTIAL as before).
 *
 * Single decision point for "what does invoicing an order mean": if the
 * order's business has opted into Business.invoicingRules.dualInvoiceMode,
 * delegate to generateDualInvoicesForOrder() (vendor B2B + customer B2C)
 * and return its B2C invoice here so every existing caller of this
 * function keeps working unchanged. Off by default.
 */
export async function createInvoiceForOrder(orderNumber: string) {
  if (!orderNumber) {
    throw new Error("orderId is required");
  }

  const order = await Order.findOne({ orderId: orderNumber });
  if (!order) {
    throw new Error("Order not found");
  }

  const business = order.businessId ? await Business.findById(order.businessId).lean() : null;
  if ((business as any)?.invoicingRules?.dualInvoiceMode) {
    const { b2c } = await generateDualInvoicesForOrder(orderNumber);
    return b2c;
  }

  const existingInvoice = await SalesInvoice.findOne({
    sourceOrderId: String(order._id),
  });
  if (existingInvoice) {
    return existingInvoice;
  }

  const isB2B = order.customerType === "B2B";

  const items = Array.isArray(order.items)
    ? order.items
    : Array.isArray(order.cart)
    ? order.cart
    : [];

  let subtotal = 0;
  let cgstTotal = 0;
  let sgstTotal = 0;
  let igstTotal = 0;

  const invoiceItems = items.map((item: any) => {
    const qty = Number(item.qty || 1);
    const price = Number(item.price || item.sellingPrice || 0);
    const taxableValue = Number(item.taxableValue || item.taxable || 0) || qty * price;
    const gstPercent = Number(item.gstRate || item.gstPercent || 0);

    const itemCgst = Number(item.cgst || item.cgstAmount || 0);
    const itemSgst = Number(item.sgst || item.sgstAmount || 0);
    const itemIgst = Number(item.igst || item.igstAmount || 0);

    subtotal += taxableValue;
    cgstTotal += itemCgst;
    sgstTotal += itemSgst;
    igstTotal += itemIgst;

    return {
      description: item.name || "",
      hsnCode: item.hsn || item.snapshot?.hsn || item.product?.hsn || "1101",
      quantity: qty,
      unit: "pcs",
      unitPrice: price,
      taxRate: gstPercent,
      taxAmount: itemCgst + itemSgst + itemIgst,
      cgstRate: gstPercent && (itemCgst || itemSgst) ? gstPercent / 2 : 0,
      cgstAmount: itemCgst,
      sgstRate: gstPercent && (itemCgst || itemSgst) ? gstPercent / 2 : 0,
      sgstAmount: itemSgst,
      igstRate: itemIgst ? gstPercent : 0,
      igstAmount: itemIgst,
      assessableValue: taxableValue,
      total: Number(item.lineTotal || item.total || taxableValue + itemCgst + itemSgst + itemIgst),
    };
  });

  const subtotalValue = Number(order.subtotal || subtotal);
  const discountValue = Number(order.discount || 0);
  const cgstValue = Number(order.cgst || cgstTotal);
  const sgstValue = Number(order.sgst || sgstTotal);
  const igstValue = Number(order.igst || igstTotal);
  const taxTotal = cgstValue + sgstValue + igstValue;
  const grandTotal = Number(order.amount || subtotalValue + taxTotal - discountValue);

  const mapStatus = (paymentStatus: string): "PAID" | "FAILED" | "PARTIAL" | "SENT" => {
    switch (paymentStatus) {
      case "SUCCESS":
      case "PAID":
        return "PAID";
      case "FAILED":
        return "FAILED";
      case "PARTIAL":
        return "PARTIAL";
      default:
        return "SENT";
    }
  };

  const { value: invoiceNumber } = await generateDocumentNumber(
    String(order.businessId || ""),
    "INVOICE"
  );

  const invoice = await SalesInvoice.create({
    businessId: order.businessId || undefined,
    sourceOrderId: String(order._id),
    invoiceNumber,
    invoiceType: isB2B ? "B2B" : "B2C",
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
    subtotal: subtotalValue,
    discountAmount: discountValue,
    cgstTotal: cgstValue,
    sgstTotal: sgstValue,
    igstTotal: igstValue,
    taxTotal,
    grandTotal,
    status: mapStatus(order.payment?.status),
    isLocked: true,
  });

  return invoice;
}
