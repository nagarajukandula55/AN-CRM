import Order from "@/models/Order";
import {
  generateInvoiceNumber,
  generateDocumentHash,
} from "@/services/documentEngine";

/* ================= GENERATE INVOICE ================= */
export async function generateInvoice(orderId: string) {
  const order = await Order.findOne({ orderId });

  if (!order) throw new Error("ORDER_NOT_FOUND");

  // ❌ prevent regeneration
  if (order.invoice?.invoiceNumber) {
    return order.invoice;
  }

  const sequence = await Order.countDocuments({
    "invoice.invoiceNumber": { $exists: true },
  });

  const invoiceNumber = generateInvoiceNumber({
    sequence: sequence + 1,
  });

  const snapshot = {
    orderId: order.orderId,
    amount: order.amount,
    items: order.items,
    gst: order.billing,
  };

  const hash = generateDocumentHash(snapshot);

  order.invoice = {
    invoiceNumber,
    generatedAt: new Date(),
    billingSnapshot: snapshot,
  };

  order.verification = {
    ...order.verification,
    invoiceHash: hash,
  };

  order.events.push({
    type: "INVOICE_GENERATED",
    data: { invoiceNumber },
    at: new Date(),
  });

  await order.save();

  return order.invoice;
}
