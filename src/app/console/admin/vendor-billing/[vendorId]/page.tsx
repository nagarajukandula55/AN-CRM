"use client";

import { useEffect, useState, use as usePromise } from "react";
import useSWR from "swr";
import Link from "next/link";

const MODULE_LABELS: Record<string, string> = {
  sales: "Sales", reviews: "Reviews", inventory: "Inventory", products: "Products",
  product_categories: "Product Categories", materials: "Materials", bom: "BOM",
  grn: "Goods Receipts", warehouses: "Warehouses", stock_transfers: "Stock Transfers",
  stock_adjustments: "Stock Adjustments", purchase: "Purchase", vendor_products: "Vendor Products",
  logistics: "Logistics", finance: "Finance", gst: "GST", crm: "CRM", crm_calls: "CRM Calls",
  crm_jobsheets: "CRM Job Sheets", fault_codes: "Fault Codes", solutions: "Solutions",
  banners: "Banners", blog: "Blog", staff: "Staff", brands: "Brands", device_models: "Device Models",
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
  const [message, setMessage] = useState<string | null>(null);

  const { data, isLoading: loading, mutate: load } = useSWR(
    `/api/admin/vendor-billing/${vendorId}`
  );
  const vendor = data?.success ? data.vendor : null;
  const moduleKeys: string[] = data?.success ? data.moduleKeys : [];
  const status = data?.success ? data.status : "NOT_SET";
  const invoices: Invoice[] = data?.success ? data.invoices || [] : [];

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

  if (loading) return <div className="p-6 text-gray-400 text-sm">Loading…</div>;

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <Link href="/console/admin/vendor-billing" className="text-xs text-gray-400">← All vendors</Link>
        <h1 className="text-xl font-semibold text-gray-900 mt-1">{vendor?.companyName}</h1>
        <p className="text-sm text-gray-500">{vendor?.vendorId} · Status: {status}</p>
      </div>

      {message && <p className="text-sm text-violet-700 bg-violet-50 rounded-lg p-2">{message}</p>}

      <div className="rounded-xl border border-gray-200 p-4 space-y-3">
        <h2 className="font-medium text-gray-900">Module Pricing</h2>
        <div className="grid grid-cols-2 gap-2">
          {moduleKeys.map((key) => (
            <label key={key} className="flex items-center gap-2 text-sm border rounded-lg p-2">
              <input
                type="checkbox"
                checked={key in selected}
                onChange={(e) => toggleModule(key, e.target.checked)}
              />
              <span className="flex-1 text-gray-700">{MODULE_LABELS[key] || key}</span>
              {key in selected && (
                <input
                  type="number"
                  min={0}
                  className="w-20 border rounded px-1.5 py-0.5 text-xs"
                  value={selected[key]}
                  onChange={(e) => setSelected((p) => ({ ...p, [key]: Number(e.target.value) }))}
                />
              )}
            </label>
          ))}
        </div>

        <div className="flex items-center gap-3 pt-2">
          <label className="text-sm text-gray-600">Validity period (days)</label>
          <input
            type="number"
            min={1}
            className="w-24 border rounded px-2 py-1 text-sm"
            value={validityDays}
            onChange={(e) => setValidityDays(Number(e.target.value))}
          />
          <span className="text-sm text-gray-500 ml-auto">Total / cycle: <b>₹{total.toLocaleString("en-IN")}</b></span>
        </div>

        <div className="flex gap-2 pt-2">
          <button onClick={savePlan} disabled={saving} className="px-3 py-2 bg-gray-900 text-white rounded-lg text-sm disabled:opacity-50">
            {saving ? "Saving…" : "Save Plan"}
          </button>
          <button onClick={generateInvoice} disabled={generating || total === 0} className="px-3 py-2 border rounded-lg text-sm disabled:opacity-50">
            {generating ? "Generating…" : "Generate Invoice"}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 p-4">
        <h2 className="font-medium text-gray-900 mb-3">Invoices</h2>
        {invoices.length === 0 ? (
          <p className="text-sm text-gray-400">No invoices yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-100">
                <th className="p-2">Invoice #</th>
                <th className="p-2">Amount</th>
                <th className="p-2">Period</th>
                <th className="p-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv._id} className="border-b border-gray-50">
                  <td className="p-2 font-mono text-xs">{inv.invoiceNumber}</td>
                  <td className="p-2">₹{inv.amount.toLocaleString("en-IN")}</td>
                  <td className="p-2 text-gray-500 text-xs">
                    {new Date(inv.periodStart).toLocaleDateString()} – {new Date(inv.periodEnd).toLocaleDateString()}
                  </td>
                  <td className="p-2">{inv.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
