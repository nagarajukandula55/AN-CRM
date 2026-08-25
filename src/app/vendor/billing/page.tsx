"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { LoadingPanel } from '@/components/ui/Spinner'
import { MODULE_LABELS } from '@/core/billing/moduleCatalog'

declare global {
  interface Window {
    Razorpay: any;
  }
}

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

interface BillingPlanOption {
  key: string;
  name: string;
  tagline: string;
  moduleKeys: string[];
  monthlyPriceINR: number;
  seatLimit: string;
  highlight?: boolean;
}

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'
const STATUS_COPY: Record<string, { label: string; tone: Tone }> = {
  NOT_SET: { label: "No plan set yet", tone: 'neutral' },
  UNPAID: { label: "Unpaid", tone: 'warning' },
  ACTIVE: { label: "Active", tone: 'success' },
  EXPIRED: { label: "Expired", tone: 'danger' },
};

export default function VendorBillingPage() {
  const router = useRouter();
  const [payingId, setPayingId] = useState<string | null>(null);
  const [subscribingId, setSubscribingId] = useState<string | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);

  const { data: billingRes, isLoading: loading, mutate: reloadBilling } = useSWR("/api/vendor/billing");
  const subscription = billingRes?.success ? billingRes.subscription : null;
  const status = billingRes?.success ? billingRes.status : "NOT_SET";
  const invoices: any[] = billingRes?.success ? billingRes.invoices || [] : [];

  const showPlanPicker = status === "NOT_SET" || status === "EXPIRED";
  const { data: plansRes } = useSWR(showPlanPicker ? "/api/vendor/plans" : null);
  const plans: BillingPlanOption[] = plansRes?.success ? plansRes.plans || [] : [];

  async function payInvoice(invoiceId: string) {
    setPayingId(invoiceId);
    try {
      const res = await fetch(`/api/vendor/billing/invoices/${invoiceId}/pay`, { method: "POST" });
      const data = await res.json();
      if (data.success) router.push(data.paymentLink);
    } finally {
      setPayingId(null);
    }
  }

  // Self-serve: pick a plan -> mint a Razorpay order for it -> pay via
  // Checkout -> the SAME already-hardened confirm route used by the
  // admin-invoice pay flow verifies the signature and activates. See
  // api/vendor/billing/subscribe/route.ts's own comment for why this
  // reuses confirm rather than duplicating verification logic.
  async function subscribeToPlan(planKey: string) {
    setPlanError(null);
    setSubscribingId(planKey);
    try {
      const loaded = await loadRazorpayScript();
      if (!loaded) throw new Error("Could not load payment gateway");

      const res = await fetch("/api/vendor/billing/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planKey }),
      });
      const orderData = await res.json();
      if (!orderData.success) throw new Error(orderData.message || "Failed to start payment");

      const rzp = new window.Razorpay({
        key: orderData.keyId,
        amount: orderData.amount,
        currency: orderData.currency,
        order_id: orderData.razorpayOrderId,
        name: "AN Group",
        description: `${orderData.planName} plan`,
        handler: async (response: any) => {
          const confirmRes = await fetch(`/api/vendor/billing/invoices/${orderData.invoiceId}/confirm`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            }),
          });
          const confirmData = await confirmRes.json();
          if (confirmData.success) reloadBilling();
          else setPlanError(confirmData.message || "Payment verification failed");
        },
        theme: { color: "#B5541F" },
      });
      rzp.open();
    } catch (err: any) {
      setPlanError(err.message || "Something went wrong");
    } finally {
      setSubscribingId(null);
    }
  }

  if (loading) return <LoadingPanel label="Loading billing…" />;

  const statusInfo = STATUS_COPY[status];
  const pendingInvoices = invoices.filter((i) => i.status === "PENDING");

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <PageHeader title="Billing & Plan" description="Your access plan, validity, and payment history." />

      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="h-section">Current Plan</h2>
          <Badge tone={statusInfo.tone}>{statusInfo.label}</Badge>
        </div>

        {!subscription || !subscription.modules?.length ? (
          <p className="text-sm text-ink-3">No plan selected yet — pick one below to get started.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              {subscription.modules.map((m: any) => (
                <span key={m.key} className="text-xs bg-surface-2 text-ink-2 rounded-full px-2 py-1">
                  {MODULE_LABELS[m.key] || m.key} · ₹{m.rate}
                </span>
              ))}
            </div>
            <div className="text-sm text-ink-2 flex justify-between pt-2 border-t border-border">
              <span>Billing cycle: {subscription.validityDays} days</span>
              <span>
                {subscription.currentPeriodEnd
                  ? `Valid until ${new Date(subscription.currentPeriodEnd).toLocaleDateString()}`
                  : "Not yet paid"}
              </span>
            </div>
          </>
        )}
      </Card>

      {showPlanPicker && (
        <Card className="p-4 space-y-3">
          <h2 className="h-section">{status === "EXPIRED" ? "Renew Your Plan" : "Choose a Plan"}</h2>
          {planError && <p className="text-sm text-danger bg-danger-soft rounded-control p-2">{planError}</p>}
          {plans.length === 0 ? (
            <p className="text-sm text-ink-3">No plans are available to self-serve right now — contact AN Group.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {plans.map((plan) => (
                <div key={plan.key} className={`border rounded-card p-3 space-y-2 ${plan.highlight ? 'border-accent' : 'border-border'}`}>
                  <div>
                    <p className="font-medium text-ink">{plan.name}</p>
                    {plan.tagline && <p className="text-xs text-ink-3">{plan.tagline}</p>}
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-lg font-semibold tabular text-ink">₹{plan.monthlyPriceINR.toLocaleString("en-IN")}</span>
                    <span className="text-xs text-ink-3">/ month</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {plan.moduleKeys.map((k) => (
                      <span key={k} className="text-xs bg-surface-2 text-ink-2 rounded-full px-2 py-0.5">
                        {MODULE_LABELS[k] || k}
                      </span>
                    ))}
                  </div>
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={() => subscribeToPlan(plan.key)}
                    disabled={subscribingId === plan.key}
                    loading={subscribingId === plan.key}
                  >
                    Subscribe & Pay
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {pendingInvoices.length > 0 && (
        <Card className="p-4 space-y-2 border-warning/20 bg-warning-soft">
          <h2 className="h-section text-warning">Pending Payment</h2>
          {pendingInvoices.map((inv) => (
            <div key={inv._id} className="flex items-center justify-between text-sm">
              <div>
                <p className="tabular text-xs text-warning">{inv.invoiceNumber}</p>
                <p className="text-warning">₹{inv.amount.toLocaleString("en-IN")} for {inv.periodEnd ? `${subscription?.validityDays || ""} days` : ""}</p>
              </div>
              <Button size="sm" onClick={() => payInvoice(inv._id)} disabled={payingId === inv._id} loading={payingId === inv._id}>
                Pay Now
              </Button>
            </div>
          ))}
        </Card>
      )}

      <Card className="p-4">
        <h2 className="h-section mb-3">Invoice History</h2>
        {invoices.length === 0 ? (
          <p className="text-sm text-ink-3">No invoices yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink-3 border-b border-border">
                <th className="p-2 font-medium">Invoice #</th>
                <th className="p-2 font-medium">Amount</th>
                <th className="p-2 font-medium">Status</th>
                <th className="p-2 font-medium">Paid On</th>
                <th className="p-2 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {invoices.map((inv) => (
                <tr key={inv._id} className="hover:bg-surface-2 transition-colors">
                  <td className="p-2 tabular text-xs text-ink-2">{inv.invoiceNumber}</td>
                  <td className="p-2 tabular text-ink">₹{inv.amount.toLocaleString("en-IN")}</td>
                  <td className="p-2 text-ink-2">{inv.status}</td>
                  <td className="p-2 text-ink-3">{inv.paidAt ? new Date(inv.paidAt).toLocaleDateString() : "—"}</td>
                  <td className="p-2">
                    {inv.status === "PAID" && (
                      <Link href={`/invoice/${inv.invoiceNumber}`} target="_blank" className="text-accent hover:text-accent-hover text-xs font-medium">
                        View GST Invoice
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
