"use client";

/**
 * Offline Sale — a vendor selling directly to a walk-in/offline customer,
 * raising a real GST invoice for it (not routed through the Native
 * storefront). Deducts the same stock online orders deduct, and requires a
 * serial number per unit sold, per explicit requirement.
 */

import { useState } from "react";
import useSWR from "swr";
import { Plus, X, ShoppingBag } from "lucide-react";
import ExportCsvButton from "@/components/shared/ExportCsvButton";
import { validateGSTIN } from "@/lib/validation/gst";
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadingPanel } from '@/components/ui/Spinner'
import { Input, Select } from '@/components/ui/Input'

interface Product {
  _id: string;
  name: string;
  sku?: string;
  stock: number;
  basePrice?: number;
  unit?: string;
}

interface Line {
  productId: string;
  quantity: number;
  unitPrice: number;
  serials: string; // comma-separated in the UI, split to array on submit
}

interface OfflineInvoice {
  _id: string;
  invoiceNumber: string;
  customer: { name: string; phone: string };
  grandTotal: number;
  status: string;
  createdAt: string;
}

export default function VendorOfflineSalesPage() {
  const { data: catalogData, mutate: refetchCatalog } = useSWR("/api/vendor/catalog");
  const products: Product[] = catalogData?.products || [];
  const { data: invData, isLoading: loading, mutate: refetchInvoices } = useSWR("/api/vendor/offline-sales");
  const invoices: OfflineInvoice[] = invData?.invoices || [];

  const [showForm, setShowForm] = useState(false);

  const [customer, setCustomer] = useState({ name: "", phone: "", email: "", address: "", gstin: "" });
  const [lines, setLines] = useState<Line[]>([{ productId: "", quantity: 1, unitPrice: 0, serials: "" }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastInvoice, setLastInvoice] = useState<string | null>(null);

  function addLine() {
    setLines((prev) => [...prev, { productId: "", quantity: 1, unitPrice: 0, serials: "" }]);
  }

  function updateLine(index: number, patch: Partial<Line>) {
    setLines((prev) =>
      prev.map((l, i) => {
        if (i !== index) return l;
        const updated = { ...l, ...patch };
        if (patch.productId) {
          const p = products.find((pr) => pr._id === patch.productId);
          if (p) updated.unitPrice = p.basePrice || 0;
        }
        return updated;
      })
    );
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  async function submit() {
    setError(null);
    if (customer.gstin?.trim()) {
      const result = validateGSTIN(customer.gstin);
      if (!result.valid) {
        setError(`Customer GSTIN: ${result.reason}`);
        return;
      }
    }
    setSaving(true);
    try {
      const payload = {
        customer,
        lines: lines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          serialNumbers: l.serials.split(",").map((s) => s.trim()).filter(Boolean),
        })),
      };
      const res = await fetch("/api/vendor/offline-sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to create offline sale");
      setLastInvoice(data.invoice.invoiceNumber);
      setShowForm(false);
      setCustomer({ name: "", phone: "", email: "", address: "", gstin: "" });
      setLines([{ productId: "", quantity: 1, unitPrice: 0, serials: "" }]);
      refetchCatalog();
      refetchInvoices();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Offline Sales"
        description="Sell directly to a walk-in customer and raise a GST invoice."
        actions={
          <>
            <ExportCsvButton
              filename="offline-sales"
              rows={invoices}
              columns={[
                { header: "Invoice #", value: (r: OfflineInvoice) => r.invoiceNumber },
                { header: "Customer", value: (r: OfflineInvoice) => r.customer?.name },
                { header: "Phone", value: (r: OfflineInvoice) => r.customer?.phone },
                { header: "Total", value: (r: OfflineInvoice) => r.grandTotal },
                { header: "Status", value: (r: OfflineInvoice) => r.status },
                { header: "Date", value: (r: OfflineInvoice) => new Date(r.createdAt).toLocaleString("en-IN") },
              ]}
            />
            <Button onClick={() => setShowForm(true)} icon={<Plus className="w-4 h-4" />}>New Offline Sale</Button>
          </>
        }
      />

      {lastInvoice && (
        <div className="rounded-control border border-success/20 bg-success-soft px-4 py-3 text-sm text-success">
          Invoice <strong>{lastInvoice}</strong> created.{" "}
          <a href={`/admin/crm/invoices/${lastInvoice}`} className="underline">View / Print</a>
        </div>
      )}

      {loading ? (
        <LoadingPanel label="Loading offline sales…" />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2 text-ink-3">
                <th className="p-3 text-left font-medium">Invoice #</th>
                <th className="p-3 text-left font-medium">Customer</th>
                <th className="p-3 text-right font-medium">Total</th>
                <th className="p-3 text-center font-medium">Status</th>
                <th className="p-3 text-left font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {invoices.length === 0 ? (
                <tr><td colSpan={5}><EmptyState kind="empty" title="No offline sales yet" /></td></tr>
              ) : (
                invoices.map((inv) => (
                  <tr key={inv._id} className="hover:bg-surface-2 transition-colors">
                    <td className="p-3 tabular text-xs text-ink-2">{inv.invoiceNumber}</td>
                    <td className="p-3 text-ink">{inv.customer?.name} <span className="text-ink-3">· {inv.customer?.phone}</span></td>
                    <td className="p-3 text-right tabular text-ink">₹{inv.grandTotal?.toLocaleString("en-IN")}</td>
                    <td className="p-3 text-center"><Badge tone="neutral">{inv.status}</Badge></td>
                    <td className="p-3 text-ink-3">{new Date(inv.createdAt).toLocaleDateString("en-IN")}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Card>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-surface border border-border rounded-card shadow-card-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="h-section flex items-center gap-2"><ShoppingBag className="w-4 h-4" /> New Offline Sale</h3>
              <button onClick={() => setShowForm(false)}><X className="w-4 h-4 text-ink-3" /></button>
            </div>
            {error && <p className="text-xs text-danger mb-3 bg-danger-soft border border-danger/20 rounded p-2">{error}</p>}

            <h4 className="eyebrow mb-2">Customer</h4>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <Input placeholder="Name *" value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} />
              <Input placeholder="Phone *" value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} />
              <Input placeholder="Email" value={customer.email} onChange={(e) => setCustomer({ ...customer, email: e.target.value })} />
              <Input placeholder="GSTIN (optional — makes this a B2B invoice)" value={customer.gstin} onChange={(e) => setCustomer({ ...customer, gstin: e.target.value })} />
              <Input placeholder="Address" value={customer.address} onChange={(e) => setCustomer({ ...customer, address: e.target.value })} className="col-span-2" />
            </div>

            <h4 className="eyebrow mb-2">Products</h4>
            <div className="space-y-3 mb-3">
              {lines.map((line, i) => {
                const product = products.find((p) => p._id === line.productId);
                return (
                  <Card key={i} className="p-3 space-y-2">
                    <div className="flex gap-2">
                      <Select
                        value={line.productId}
                        onChange={(e) => updateLine(i, { productId: e.target.value })}
                        className="flex-1"
                      >
                        <option value="">Select product…</option>
                        {products.map((p) => (
                          <option key={p._id} value={p._id}>{p.name} ({p.stock} in stock)</option>
                        ))}
                      </Select>
                      {lines.length > 1 && (
                        <button onClick={() => removeLine(i)} className="text-danger"><X className="w-4 h-4" /></button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        type="number"
                        min={1}
                        placeholder="Quantity"
                        value={line.quantity}
                        onChange={(e) => updateLine(i, { quantity: Number(e.target.value) })}
                      />
                      <Input
                        type="number"
                        placeholder="Unit Price"
                        value={line.unitPrice}
                        onChange={(e) => updateLine(i, { unitPrice: Number(e.target.value) })}
                      />
                    </div>
                    <Input
                      placeholder={`Serial numbers, comma-separated — exactly ${line.quantity} required`}
                      value={line.serials}
                      onChange={(e) => updateLine(i, { serials: e.target.value })}
                    />
                    {product && product.stock < line.quantity && (
                      <p className="text-xs text-danger">Only {product.stock} in stock — reduce quantity or Inbound more stock first.</p>
                    )}
                  </Card>
                );
              })}
            </div>
            <button onClick={addLine} className="text-sm text-accent mb-4">+ Add another product</button>

            <Button onClick={submit} disabled={saving} loading={saving} className="w-full">
              {saving ? "Creating Invoice…" : "Create Sale & Raise Invoice"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
