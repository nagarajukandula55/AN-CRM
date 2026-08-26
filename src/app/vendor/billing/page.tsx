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

interface PeriodPrice {
  key: string;
  label: string;
  months: number;
  discountPct: number;
  total: number;
  perMonth: number;
}

interface BillingPlanOption {
  key: string;
  name: string;
  tagline: string;
  features: string[];
  monthlyPriceINR: number;
  periods: PeriodPrice[];
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
  const [period, setPeriod] = useState("MONTHLY");

  const { data: billingRes, isLoading: loading, mutate: reloadBilling } = useSWR("/api/vendor/billing");
  const subscription = billingRes?.success ? billingRes.subscription : null;
  const status = billingRes?.success ? billingRes.status : "NOT_SET";
  const invoices: any[] = billingRes?.success ? billingRes.invoices || [] : [];

  // A vendor on the free trial has status ACTIVE (a real currentPeriodEnd
  // is set the moment the trial starts) with no PAID invoice yet -- if
  // showPlanPicker only fired for NOT_SET/EXPIRED, a trial vendor (now
  // defaulted to Ultimate, the top tier) had literally no way to actually
  // purchase a plan until their trial expired: the picker was hidden
  // (status isn't NOT_SET/EXPIRED) AND the Upgrade section was empty
  // (nothing outranks Ultimate). Reported live ("all plans not showing
  // here"). hasPaidInvoice is the same "never actually paid" signal
  // TrialPlanBanner already uses.
  const hasPaidInvoice = invoices.some((i) => i.status === "PAID");
  const showPlanPicker = status === "NOT_SET" || status === "EXPIRED" || (status === "ACTIVE" && !hasPaidInvoice);
  // Also needed on an ACTIVE subscription to render the Upgrade section
  // below -- fetched either way rather than duplicating the plan catalog.
  const { data: plansRes } = useSWR(showPlanPicker || status === "ACTIVE" ? "/api/vendor/plans" : null);
  const plans: BillingPlanOption[] = plansRes?.success ? plansRes.plans || [] : [];
  const launchPricingActive: boolean = plansRes?.success ? !!plansRes.launchPricingActive : false;
  const periodOptions: PeriodPrice[] = plans[0]?.periods || [];

  const PLAN_RANK: Record<string, number> = { BASIC: 0, PRO: 1, ULTIMATE: 2 };
  const currentPlanKeys: string[] = (subscription?.modules || []).map((m: any) => m.key);
  // planKey isn't always on the GET response shape -- infer the rank from
  // whichever known plan's module set the current one most closely
  // matches isn't reliable either, so this reads the same planKey field
  // the subscription document actually stores.
  const currentPlanKey: string = subscription?.planKey || "BASIC";
  // Only relevant once actually paid -- during the free trial (ACTIVE with
  // no PAID invoice) showPlanPicker above already covers every plan
  // including the current one, so this stays empty rather than showing an
  // an empty/duplicate card.
  const upgradeOptions = status === "ACTIVE" && hasPaidInvoice ? plans.filter((p) => PLAN_RANK[p.key] > PLAN_RANK[currentPlanKey]) : [];
  const [upgradingId, setUpgradingId] = useState<string | null>(null);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);

  async function upgradeToPlan(planKey: string) {
    setUpgradeError(null);
    setUpgradingId(planKey);
    try {
      const loaded = await loadRazorpayScript();
      if (!loaded) throw new Error("Could not load payment gateway");

      const res = await fetch("/api/vendor/billing/upgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planKey }),
      });
      const orderData = await res.json();
      if (!orderData.success) throw new Error(orderData.message || "Failed to start upgrade");

      const rzp = new window.Razorpay({
        key: orderData.keyId,
        amount: orderData.amount,
        currency: orderData.currency,
        order_id: orderData.razorpayOrderId,
        name: "AN Group",
        description: `Upgrade to ${orderData.planName}`,
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
          else setUpgradeError(confirmData.message || "Payment verification failed");
        },
        theme: { color: "#B5541F" },
      });
      rzp.open();
    } catch (err: any) {
      setUpgradeError(err.message || "Something went wrong");
    } finally {
      setUpgradingId(null);
    }
  }

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
        body: JSON.stringify({ planKey, period }),
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

      {upgradeOptions.length > 0 && (
        <Card className="p-4 space-y-3">
          <h2 className="h-section">Upgrade Your Plan</h2>
          <p className="text-xs text-ink-3">
            Pay only the difference for the time left on your current plan -- your renewal date doesn't change. Downgrading isn't available here; contact AN Group support if you need a lower tier.
          </p>
          {upgradeError && <p className="text-sm text-danger bg-danger-soft rounded-control p-2">{upgradeError}</p>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {upgradeOptions.map((plan) => (
              <div key={plan.key} className={`border rounded-card p-3 space-y-2 ${plan.highlight ? 'border-accent' : 'border-border'}`}>
                <div>
                  <p className="font-medium text-ink">{plan.name}</p>
                  {plan.tagline && <p className="text-xs text-ink-3">{plan.tagline}</p>}
                </div>
                <ul className="text-xs text-ink-2 space-y-0.5 list-disc list-inside">
                  {plan.features.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
                <Button
                  size="sm"
                  className="w-full"
                  onClick={() => upgradeToPlan(plan.key)}
                  disabled={upgradingId === plan.key}
                  loading={upgradingId === plan.key}
                >
                  Upgrade to {plan.name}
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {showPlanPicker && (
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="h-section">{status === "EXPIRED" ? "Renew Your Plan" : "Choose a Plan"}</h2>
            {launchPricingActive && <Badge tone="success">Launch pricing — limited time</Badge>}
          </div>
          {planError && <p className="text-sm text-danger bg-danger-soft rounded-control p-2">{planError}</p>}
          {plans.length === 0 ? (
            <p className="text-sm text-ink-3">No plans are available to self-serve right now — contact AN Group.</p>
          ) : (
            <>
              {periodOptions.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {periodOptions.map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => setPeriod(p.key)}
                      className={`text-xs font-medium rounded-control px-2.5 py-1.5 border transition-colors ${
                        period === p.key ? 'bg-accent text-accent-fg border-accent' : 'bg-surface text-ink-2 border-border hover:bg-surface-2'
                      }`}
                    >
                      {p.label}{p.discountPct > 0 ? ` (save ${p.discountPct}%)` : ""}
                    </button>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {plans.map((plan) => {
                  const chosen = plan.periods.find((p) => p.key === period) || plan.periods[0];
                  return (
                    <div key={plan.key} className={`border rounded-card p-3 space-y-2 ${plan.highlight ? 'border-accent' : 'border-border'}`}>
                      <div>
                        <p className="font-medium text-ink">{plan.name}</p>
                        {plan.tagline && <p className="text-xs text-ink-3">{plan.tagline}</p>}
                      </div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-lg font-semibold tabular text-ink">₹{(chosen?.total ?? plan.monthlyPriceINR).toLocaleString("en-IN")}</span>
                        <span className="text-xs text-ink-3">
                          {chosen && chosen.months > 1 ? `for ${chosen.label.toLowerCase()} (₹${chosen.perMonth.toLocaleString("en-IN")}/mo)` : "/ month"} + GST
                        </span>
                      </div>
                      <p className="text-xs text-ink-3">18% GST added at checkout — you'll pay ₹{Math.round((chosen?.total ?? plan.monthlyPriceINR) * 1.18).toLocaleString("en-IN")}</p>
                      <ul className="text-xs text-ink-2 space-y-0.5 list-disc list-inside">
                        {plan.features.map((f) => (
                          <li key={f}>{f}</li>
                        ))}
                      </ul>
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
                  );
                })}
              </div>
            </>
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
