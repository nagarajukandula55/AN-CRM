"use client";

import { useState, use as usePromise } from "react";
import { useRouter } from "next/navigation";

/**
 * Stand-in for a real payment gateway checkout page (Razorpay/Skydo to come
 * later — see core/billing/paymentGateway.ts). Confirming here calls the
 * same confirm route a real gateway's webhook would call.
 */
export default function VendorBillingPayPage({ params }: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = usePromise(params);
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setConfirming(true);
    setError(null);
    try {
      const res = await fetch(`/api/vendor/billing/invoices/${invoiceId}/confirm`, { method: "POST" });
      const data = await res.json();
      if (!data.success) { setError(data.message || "Payment failed"); return; }
      router.push("/vendor/billing");
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="p-6 max-w-md mx-auto">
      <div className="rounded-xl border border-gray-200 p-6 text-center space-y-4">
        <p className="text-xs uppercase tracking-widest text-gray-400">Payment (test mode)</p>
        <h1 className="text-lg font-semibold text-gray-900">Confirm Payment</h1>
        <p className="text-sm text-gray-500">
          No live payment gateway is connected yet. Clicking below simulates a successful payment and
          extends your plan's validity.
        </p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          onClick={confirm}
          disabled={confirming}
          className="w-full px-4 py-2 bg-gray-900 text-white rounded-lg text-sm disabled:opacity-50"
        >
          {confirming ? "Confirming…" : "Simulate Successful Payment"}
        </button>
      </div>
    </div>
  );
}
