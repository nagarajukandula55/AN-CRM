import { anPost } from "./client";

export async function verifyPayment(payload: {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
  orderId?: string;
}) {
  return anPost("/api/payment/verify", payload);
}
