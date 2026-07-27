import { IVendorBillingInvoice } from "@/models/VendorBillingInvoice";

/**
 * Stub payment gateway. No real gateway is wired up yet (Razorpay/Skydo to
 * follow) — createPaymentLink() points the vendor at our own confirm page
 * instead of an external checkout, and confirmPayment() always "succeeds"
 * once called. Swap point for later: replace the body of both functions
 * with the real gateway's order-create + webhook-verify calls; every call
 * site (vendor billing pay/confirm routes) stays the same.
 */
export async function createPaymentLink(invoice: IVendorBillingInvoice): Promise<{ link: string; gatewayRef: string }> {
  return {
    link: `/vendor/billing/pay/${invoice._id}`,
    gatewayRef: `STUB-${invoice._id}`,
  };
}

export async function confirmPayment(_gatewayRef: string): Promise<{ success: boolean }> {
  return { success: true };
}
