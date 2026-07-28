/**
 * Lazy Razorpay singleton for the subscription/licensing flow -- same
 * pattern as services/order.service.ts's getRazorpay() (constructed only
 * on first real use, so a deploy with no Razorpay env vars set still
 * builds/runs; every other route keeps working without payment configured).
 * Kept as its own copy rather than importing order.service.ts's version
 * since that module pulls in the entire storefront-order domain as a side
 * effect of import -- this keeps the subscription flow's dependency
 * surface independent of it.
 */
import Razorpay from "razorpay";

let client: Razorpay | null = null;

export function getRazorpayClient(): Razorpay {
  if (!client) {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      throw new Error("Razorpay is not configured: RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET are missing.");
    }
    client = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
  }
  return client;
}
