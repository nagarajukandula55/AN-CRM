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

const MODULE_LABELS: Record<string, string> = {
  sales: "Sales", reviews: "Reviews", inventory: "Inventory", products: "Products",
  product_categories: "Product Categories", materials: "Materials", bom: "BOM",
  grn: "Goods Receipts", warehouses: "Warehouses", stock_transfers: "Stock Transfers",
  stock_adjustments: "Stock Adjustments", purchase: "Purchase", vendor_products: "Vendor Products",
  logistics: "Logistics", finance: "Finance", gst: "GST", crm: "CRM", crm_calls: "CRM Calls",
  crm_jobsheets: "CRM Job Sheets", fault_codes: "Fault Codes", solutions: "Solutions",
  banners: "Banners", blog: "Blog", staff: "Staff", brands: "Brands", device_models: "Device Models",
};

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

  const { data: billingRes, isLoading: loading } = useSWR("/api/vendor/billing");
  const subscription = billingRes?.success ? billingRes.subscription : null;
  const status = billingRes?.success ? billingRes.status : "NOT_SET";
  const invoices: any[] = billingRes?.success ? billingRes.invoices || [] : [];

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
          <p className="text-sm text-ink-3">No plan has been configured for your account yet — contact AN Group.</p>
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
