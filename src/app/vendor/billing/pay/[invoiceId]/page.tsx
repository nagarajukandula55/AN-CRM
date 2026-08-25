"use client";

import { useEffect, useState, use as usePromise } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";

/**
 * Real Razorpay Checkout integration -- replaces the old "Simulate
 * Successful Payment" test-mode stub (see git history: it let any vendor
 * mark their own invoice paid for free, no verification at all). Order
 * creation (amount) is entirely server-side (pay/route.ts, from OUR OWN
 * invoice record); this page only opens Razorpay's own checkout overlay
 * and hands whatever it returns to confirm/route.ts, which is the only
 * thing that can actually verify a payment and mark the invoice PAID.
 */

declare global {
  interface Window {
    Razorpay: any;
  }
}

export default function VendorBillingPayPage({ params }: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = usePromise(params);
  const router = useRouter();
  const [scriptReady, setScriptReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);

  async function payNow() {
    setLoading(true);
    setError(null);
    try {
      const orderRes = await fetch(`/api/vendor/billing/invoices/${invoiceId}/pay`, { method: "POST" });
      const orderData = await orderRes.json();
      if (!orderData.success) {
        if (orderRes.status === 503) setNotConfigured(true);
        setError(orderData.message || "Could not start payment");
        return;
      }

      const razorpay = new window.Razorpay({
        key: orderData.keyId,
        order_id: orderData.orderId,
        amount: orderData.amount,
        currency: orderData.currency,
        name: "My Biz Flow",
        description: `Invoice ${orderData.invoiceNumber}`,
        handler: async (response: any) => {
          try {
            const confirmRes = await fetch(`/api/vendor/billing/invoices/${invoiceId}/confirm`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
              }),
            });
            const confirmData = await confirmRes.json();
            if (!confirmData.success) {
              setError(confirmData.message || "Payment could not be verified");
              return;
            }
            router.push("/vendor/billing");
          } catch {
            setError("Payment succeeded but verification failed -- contact support with your payment ID: " + response.razorpay_payment_id);
          }
        },
        modal: {
          ondismiss: () => setLoading(false),
        },
      });
      razorpay.open();
    } catch {
      setError("Something went wrong starting payment");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" onLoad={() => setScriptReady(true)} />
      <div className="p-6 max-w-md mx-auto">
        <div className="rounded-card border border-border p-6 text-center space-y-4">
          <h1 className="text-lg font-semibold text-ink">Pay Invoice</h1>
          <p className="text-sm text-ink-3">
            You&apos;ll be taken to Razorpay&apos;s secure checkout to complete this payment.
          </p>
          {error && <p className="text-sm text-danger">{error}</p>}
          {notConfigured && (
            <p className="text-xs text-warning bg-warning-soft border border-warning/20 rounded-control p-3">
              Payments aren&apos;t live yet -- the team is finishing setup. Please check back shortly or contact support.
            </p>
          )}
          <button
            onClick={payNow}
            disabled={loading || !scriptReady}
            className="w-full px-4 py-2 bg-accent text-accent-fg rounded-control text-sm disabled:opacity-50"
          >
            {loading ? "Opening checkout…" : !scriptReady ? "Loading…" : "Pay Now"}
          </button>
        </div>
      </div>
    </>
  );
}
