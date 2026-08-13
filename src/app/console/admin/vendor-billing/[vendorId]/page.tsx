"use client";

import { useEffect, useState, use as usePromise } from "react";
import useSWR from "swr";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Field, Input } from "@/components/ui/Input";

const MODULE_LABELS: Record<string, string> = {
  sales: "Sales", reviews: "Reviews", inventory: "Inventory", products: "Products",
  product_categories: "Product Categories", materials: "Materials", bom: "BOM",
  grn: "Goods Receipts", warehouses: "Warehouses", stock_transfers: "Stock Transfers",
  stock_adjustments: "Stock Adjustments", purchase: "Purchase", vendor_products: "Vendor Products",
  logistics: "Logistics", finance: "Finance", gst: "GST", crm: "CRM",
  crm_jobsheets: "CRM Job Sheets", fault_codes: "Fault Codes", solutions: "Solutions",
  banners: "Banners", blog: "Blog", staff: "Staff", brands: "Brands", device_models: "Device Models",
};

type Tone = "success" | "warning" | "danger" | "info" | "neutral";

const STATUS_TONE: Record<string, Tone> = {
  NOT_SET: "neutral",
  UNPAID: "warning",
  ACTIVE: "success",
  EXPIRED: "danger",
  PENDING: "warning",
  PAID: "success",
  CANCELLED: "neutral",
};

interface Invoice {
  _id: string; invoiceNumber: string; amount: number; status: string;
  periodStart: string; periodEnd: string; paidAt: string | null;
}

export default function VendorBillingDetailPage({ params }: { params: Promise<{ vendorId: string }> }) {
  const { vendorId } = usePromise(params);
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [validityDays, setValidityDays] = useState(30);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [removingPlan, setRemovingPlan] = useState(false);
  const [invoiceActionId, setInvoiceActionId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const { data, isLoading: loading, mutate: load } = useSWR(
    `/api/admin/vendor-billing/${vendorId}`
  );
  const vendor = data?.success ? data.vendor : null;
  const moduleKeys: string[] = data?.success ? data.moduleKeys : [];
  const status = data?.success ? data.status : "NOT_SET";
  const invoices: Invoice[] = data?.success ? data.invoices || [] : [];
  const hasPlan = !!data?.subscription;

  useEffect(() => {
    if (!data?.success) return;
    const sel: Record<string, number> = {};
    (data.subscription?.modules || []).forEach((m: any) => { sel[m.key] = m.rate; });
    setSelected(sel);
    if (data.subscription?.validityDays) setValidityDays(data.subscription.validityDays);
  }, [data]);

  function toggleModule(key: string, checked: boolean) {
    setSelected((p) => {
      const next = { ...p };
      if (checked) next[key] = next[key] ?? 0;
      else delete next[key];
      return next;
    });
  }

  const total = Object.values(selected).reduce((s, r) => s + (Number(r) || 0), 0);

  async function savePlan() {
    setSaving(true);
    setMessage(null);
    try {
      const modules = Object.entries(selected).map(([key, rate]) => ({ key, rate: Number(rate) || 0 }));
      const res = await fetch(`/api/admin/vendor-billing/${vendorId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modules, validityDays }),
      });
      const data = await res.json();
      if (!data.success) { setMessage(data.message || "Failed to save"); return; }
      setMessage("Plan saved.");
      load();
    } finally {
      setSaving(false);
    }
  }

  async function generateInvoice() {
    setGenerating(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/vendor-billing/${vendorId}/invoice`, { method: "POST" });
      const data = await res.json();
      if (!data.success) { setMessage(data.message || "Failed to generate invoice"); return; }
      setMessage(`Invoice ${data.invoice.invoiceNumber} generated.`);
      load();
    } finally {
      setGenerating(false);
    }
  }

  async function removePlan() {
    if (!confirm("Remove this vendor's saved module plan? Their billing status will reset to Not Set. Past invoices are kept.")) return;
    setRemovingPlan(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/vendor-billing/${vendorId}`, { method: "DELETE" });
      const data = await res.json();
      if (!data.success) { setMessage(data.message || "Failed to remove plan"); return; }
      setMessage("Plan removed.");
      setSelected({});
      setValidityDays(30);
      load();
    } finally {
      setRemovingPlan(false);
    }
  }

  async function updateInvoice(invoice: Invoice, nextStatus: "PAID" | "CANCELLED") {
    const verb = nextStatus === "PAID" ? "mark this invoice as paid" : "cancel this invoice";
    if (!confirm(`Are you sure you want to ${verb} (${invoice.invoiceNumber})?`)) return;
    setInvoiceActionId(invoice._id);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/vendor-billing/${vendorId}/invoice/${invoice._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json();
      if (!data.success) { setMessage(data.message || "Failed to update invoice"); return; }
      setMessage(nextStatus === "PAID" ? "Invoice marked paid." : "Invoice cancelled.");
      load();
    } finally {
      setInvoiceActionId(null);
    }
  }

  if (loading) return <div className="min-h-screen bg-bg text-ink p-6"><p className="text-ink-3 text-sm">Loading…</p></div>;

  return (
    <div className="min-h-screen bg-bg text-ink p-6 space-y-6 max-w-3xl">
      <div>
        <Link href="/console/admin/vendor-billing" className="text-xs text-ink-3">← All vendors</Link>
        <PageHeader
          title={vendor?.companyName || "Vendor"}
          description={`${vendor?.vendorId || ""} · Status: ${status}`}
        />
      </div>

      {message && <p className="text-sm text-accent bg-accent-soft rounded-control p-2">{message}</p>}

      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="h-section">Module Pricing</h2>
          {hasPlan && (
            <Button variant="danger" size="sm" loading={removingPlan} onClick={removePlan}>Remove Plan</Button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {moduleKeys.map((key) => (
            <label key={key} className="flex items-center gap-2 text-sm border border-border rounded-control p-2">
              <input
                type="checkbox"
                checked={key in selected}
                onChange={(e) => toggleModule(key, e.target.checked)}
              />
              <span className="flex-1 text-ink-2">{MODULE_LABELS[key] || key}</span>
              {key in selected && (
                <input
                  type="number"
                  min={0}
                  className="w-20 border border-border rounded-control px-1.5 py-0.5 text-xs bg-surface text-ink"
                  value={selected[key]}
                  onChange={(e) => setSelected((p) => ({ ...p, [key]: Number(e.target.value) }))}
                />
              )}
            </label>
          ))}
        </div>

        <div className="flex items-center gap-3 pt-2">
          <label className="text-sm text-ink-2">Validity period (days)</label>
          <Input
            type="number"
            min={1}
            className="w-24"
            value={validityDays}
            onChange={(e) => setValidityDays(Number(e.target.value))}
          />
          <span className="text-sm text-ink-2 ml-auto tabular">Total / cycle: <b>₹{total.toLocaleString("en-IN")}</b></span>
        </div>

        <div className="flex gap-2 pt-2">
          <Button onClick={savePlan} loading={saving}>Save Plan</Button>
          <Button variant="secondary" onClick={generateInvoice} loading={generating} disabled={total === 0}>Generate Invoice</Button>
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="h-section mb-3">Invoices</h2>
        {invoices.length === 0 ? (
          <p className="text-sm text-ink-3">No invoices yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-ink-3 border-b border-border">
                  <th className="p-2 font-medium">Invoice #</th>
                  <th className="p-2 font-medium">Amount</th>
                  <th className="p-2 font-medium">Period</th>
                  <th className="p-2 font-medium">Status</th>
                  <th className="p-2 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv._id} className="border-b border-border">
                    <td className="p-2 font-mono text-xs tabular">{inv.invoiceNumber}</td>
                    <td className="p-2 tabular">₹{inv.amount.toLocaleString("en-IN")}</td>
                    <td className="p-2 text-ink-3 text-xs tabular">
                      {new Date(inv.periodStart).toLocaleDateString()} – {new Date(inv.periodEnd).toLocaleDateString()}
                    </td>
                    <td className="p-2">
                      <Badge tone={STATUS_TONE[inv.status] || "neutral"}>{inv.status}</Badge>
                    </td>
                    <td className="p-2 text-right">
                      {inv.status === "PENDING" && (
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="success"
                            size="sm"
                            loading={invoiceActionId === inv._id}
                            onClick={() => updateInvoice(inv, "PAID")}
                          >
                            Mark Paid
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            loading={invoiceActionId === inv._id}
                            onClick={() => updateInvoice(inv, "CANCELLED")}
                          >
                            Cancel
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
