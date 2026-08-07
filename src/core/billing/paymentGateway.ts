import crypto from "crypto";
import Razorpay from "razorpay";
import { IVendorBillingInvoice } from "@/models/VendorBillingInvoice";

/**
 * Real Razorpay integration -- replaces the old stub that always returned
 * success (see this file's git history) after it was found to let ANY
 * vendor mark their own invoice PAID for free, no money involved,
 * self-service, with zero verification. This deals with real money, so
 * the security property that matters is: a payment can only be confirmed
 * PAID by verifying Razorpay's own HMAC signature (computed with our
 * secret key, which only Razorpay and this server ever hold) -- a
 * malicious client cannot forge a valid signature no matter what it sends.
 *
 * Flow: createOrder() mints a real Razorpay order server-side (amount is
 * read from OUR OWN invoice record, never trusted from the client) ->
 * vendor pays via Razorpay Checkout (client-side, standard integration) ->
 * verifyPayment() recomputes the expected signature server-side and only
 * returns success if it matches what Razorpay actually returned.
 *
 * Skydo integration follows the same shape once its API details are
 * available -- add a sibling createSkydoOrder/verifySkydoPayment pair and
 * a `gateway` field on the invoice to pick between them; nothing about
 * this file's callers needs to change.
 *
 * RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are read lazily (not at import
 * time) so a deploy with no keys configured yet doesn't crash the whole
 * app at boot -- it just fails cleanly, per request, until they're set.
 */

function getClient(): Razorpay {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new Error("Payments are not yet configured (RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET not set)");
  }
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

export interface RazorpayOrderResult {
  orderId: string;
  amount: number; // paise
  currency: string;
  keyId: string;
}

/**
 * Creates a real Razorpay order for this invoice's amount -- the amount
 * comes ONLY from our own invoice record (never from the client), so
 * there is no way for a request to pay less than what's actually owed.
 */
export async function createRazorpayOrder(invoice: IVendorBillingInvoice): Promise<RazorpayOrderResult> {
  const client = getClient();
  const amountPaise = Math.round(invoice.amount * 100);
  const order = await client.orders.create({
    amount: amountPaise,
    currency: "INR",
    receipt: invoice.invoiceNumber,
    notes: { invoiceId: String(invoice._id), vendorId: String(invoice.vendorId) },
  });
  return {
    orderId: order.id,
    amount: amountPaise,
    currency: "INR",
    keyId: process.env.RAZORPAY_KEY_ID as string,
  };
}

/**
 * Verifies Razorpay's checkout-success signature server-side. This is the
 * ONLY thing that may ever mark an invoice PAID -- per Razorpay's own
 * verification algorithm: HMAC-SHA256("<order_id>|<payment_id>", key_secret)
 * must equal the signature Razorpay returned to the client. A forged or
 * replayed request without the real secret can never produce a matching
 * signature.
 */
export function verifyRazorpaySignature(params: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}): boolean {
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) return false;
  const expected = crypto
    .createHmac("sha256", keySecret)
    .update(`${params.razorpayOrderId}|${params.razorpayPaymentId}`)
    .digest("hex");
  // Constant-time comparison -- avoids a timing side-channel on the
  // signature check (buffers must be equal length or timingSafeEqual
  // throws, so guard that first).
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(params.razorpaySignature || "");
  if (expectedBuf.length !== actualBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}
