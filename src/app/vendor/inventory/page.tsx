"use client";

/**
 * Vendor Inventory — shows current stock (NativeProduct.stock, the same
 * field the storefront reads for availability) for every one of the
 * vendor's own approved products, and lets them bring stock IN via a
 * numbered, auditable Stock Adjustment. This is the legal path referenced
 * by order confirmation's stock gate: a vendor short on stock uses
 * "Inbound" here, then retries confirming the order.
 */

import { useState } from "react";
import useSWR from "swr";
import { Package, Plus, X, History } from "lucide-react";
import ExportCsvButton from "@/components/shared/ExportCsvButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingPanel } from "@/components/ui/Spinner";
import { Field, Input, Select } from "@/components/ui/Input";

interface Product {
  _id: string;
  name: string;
  sku?: string;
  stock: number;
  unit?: string;
}

interface Adjustment {
  _id: string;
  adjustmentNumber: string;
  productId: { _id: string; name?: string; sku?: string } | string;
  type: string;
  quantity: number;
  previousStock: number;
  newStock: number;
  reason?: string;
  createdAt: string;
}

const ADJUSTMENT_TYPES = [
  { value: "INBOUND", label: "Inbound — new stock received" },
  { value: "RETURN", label: "Return — customer returned units" },
  { value: "CORRECTION", label: "Correction — count was wrong" },
  { value: "DAMAGED", label: "Damaged — remove unsellable units" },
];

export default function VendorInventoryPage() {
  const [showHistory, setShowHistory] = useState(false);

  const [showForm, setShowForm] = useState<Product | null>(null);
  const [type, setType] = useState("INBOUND");
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: catalogData, isLoading: loadingCatalog, mutate: refetchCatalog } = useSWR("/api/vendor/catalog");
  const { data: histData, mutate: refetchHistory } = useSWR("/api/vendor/stock-adjustments");
  const loading = loadingCatalog;
  const history: Adjustment[] = histData?.adjustments || [];
  const products: Product[] = (catalogData?.products || []).map((p: any) => ({
    _id: p._id,
    name: p.name,
    sku: p.sku,
    stock: p.stock || 0,
    unit: p.unit,
  }));

  async function submitAdjustment() {
    if (!showForm) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/vendor/stock-adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: showForm._id, type, quantity, reason }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to save adjustment");
      setShowForm(null);
      setQuantity(1);
      setReason("");
      setType("INBOUND");
      await Promise.all([refetchCatalog(), refetchHistory()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory"
        description="Stock per product — bring stock in via Inbound before confirming orders that need it."
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => setShowHistory((s) => !s)} icon={<History className="w-4 h-4" />}>
              {showHistory ? "Hide" : "Show"} Adjustment History
            </Button>
            <ExportCsvButton
              filename="inventory"
              rows={products}
              columns={[
                { header: "Product", value: (r: Product) => r.name },
                { header: "SKU", value: (r: Product) => r.sku },
                { header: "Stock", value: (r: Product) => r.stock },
                { header: "Unit", value: (r: Product) => r.unit },
              ]}
            />
          </>
        }
      />

      {loading ? (
        <LoadingPanel label="Loading inventory…" />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-2 text-xs text-ink-3">
                  <th className="p-3 text-left font-medium">Product</th>
                  <th className="p-3 text-left font-medium">SKU</th>
                  <th className="p-3 text-right font-medium">Stock</th>
                  <th className="p-3 text-center font-medium">Status</th>
                  <th className="p-3 text-center font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {products.length === 0 ? (
                  <tr><td colSpan={5}><EmptyState kind="empty" title="No products yet" /></td></tr>
                ) : (
                  products.map((p) => (
                    <tr key={p._id} className="hover:bg-surface-2 transition-colors">
                      <td className="p-3 font-medium text-ink">{p.name}</td>
                      <td className="p-3 tabular text-xs text-ink-3">{p.sku || "—"}</td>
                      <td className="p-3 text-right tabular text-ink">{p.stock} {p.unit}</td>
                      <td className="p-3 text-center">
                        <Badge tone={p.stock > 0 ? "success" : "danger"}>{p.stock > 0 ? "In Stock" : "Out of Stock"}</Badge>
                      </td>
                      <td className="p-3 text-center">
                        <Button size="sm" variant="secondary" onClick={() => setShowForm(p)} className="mx-auto" icon={<Plus className="w-3 h-3" />}>
                          Adjust
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {showHistory && (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface-2">
            <h2 className="h-section">Adjustment History</h2>
            <ExportCsvButton
              filename="stock-adjustments"
              rows={history}
              columns={[
                { header: "Adjustment #", value: (r: Adjustment) => r.adjustmentNumber },
                { header: "Product", value: (r: Adjustment) => typeof r.productId === "object" ? r.productId.name : r.productId },
                { header: "Type", value: (r: Adjustment) => r.type },
                { header: "Quantity", value: (r: Adjustment) => r.quantity },
                { header: "Before", value: (r: Adjustment) => r.previousStock },
                { header: "After", value: (r: Adjustment) => r.newStock },
                { header: "Reason", value: (r: Adjustment) => r.reason },
                { header: "Date", value: (r: Adjustment) => new Date(r.createdAt).toLocaleString("en-IN") },
              ]}
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-2 text-xs text-ink-3">
                  <th className="p-3 text-left font-medium">Adjustment #</th>
                  <th className="p-3 text-left font-medium">Product</th>
                  <th className="p-3 text-left font-medium">Type</th>
                  <th className="p-3 text-right font-medium">Qty</th>
                  <th className="p-3 text-right font-medium">Before → After</th>
                  <th className="p-3 text-left font-medium">Reason</th>
                  <th className="p-3 text-left font-medium">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {history.length === 0 ? (
                  <tr><td colSpan={7}><EmptyState kind="empty" title="No adjustments yet" /></td></tr>
                ) : (
                  history.map((h) => (
                    <tr key={h._id} className="hover:bg-surface-2 transition-colors">
                      <td className="p-3 tabular text-xs text-ink-2">{h.adjustmentNumber}</td>
                      <td className="p-3 text-ink">{typeof h.productId === "object" ? h.productId.name : ""}</td>
                      <td className="p-3 text-ink-2">{h.type}</td>
                      <td className="p-3 text-right tabular text-ink">{h.quantity}</td>
                      <td className="p-3 text-right tabular text-ink">{h.previousStock} → {h.newStock}</td>
                      <td className="p-3 text-ink-3">{h.reason || "—"}</td>
                      <td className="p-3 text-ink-3">{new Date(h.createdAt).toLocaleDateString("en-IN")}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-surface border border-border rounded-card shadow-card-lg w-full max-w-sm mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="h-section">Stock Adjustment</h3>
              <button onClick={() => setShowForm(null)}><X className="w-4 h-4 text-ink-3" /></button>
            </div>
            <p className="text-xs text-ink-3 mb-4">
              <Package className="w-3 h-3 inline mr-1" /> {showForm.name} — current stock: <strong className="text-ink">{showForm.stock}</strong>
            </p>
            {error && <p className="text-xs text-danger mb-3">{error}</p>}
            <div className="space-y-3">
              <Field label="Type">
                <Select value={type} onChange={(e) => setType(e.target.value)}>
                  {ADJUSTMENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </Select>
              </Field>
              <Field label="Quantity">
                <Input type="number" min={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
              </Field>
              <Field label="Reason (optional)">
                <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. New batch from supplier" />
              </Field>
            </div>
            <Button onClick={submitAdjustment} disabled={saving} loading={saving} className="w-full mt-5">
              {saving ? "Saving…" : "Save Adjustment"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
