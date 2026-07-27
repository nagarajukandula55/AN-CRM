import Order from "@/models/Order";
import { generateReceiptNumber } from "@/services/documentEngine";

/* ================= GENERATE RECEIPT ================= */
export async function generateReceipt(orderId: string, payment: any) {
  const order = await Order.findOne({ orderId });

  if (!order) throw new Error("ORDER_NOT_FOUND");

  const receiptNumber = generateReceiptNumber();

  order.receipt = {
    receiptNumber,
    generatedAt: new Date(),
    amountPaid: payment.amount,
    paymentMode: payment.method,
  };

  order.payment = {
    ...order.payment,
    ...payment,
    status: "SUCCESS",
    paidAt: new Date(),
  };

  order.status = "PAID";

  order.statusTimeline.paidAt = new Date();

  order.events.push({
    type: "PAYMENT_SUCCESS",
    data: payment,
    at: new Date(),
  });

  await order.save();

  return order.receipt;
}
