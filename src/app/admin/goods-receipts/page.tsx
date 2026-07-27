"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { Plus, X, Printer, Loader2 } from "lucide-react";
import { useActiveBusinessId } from "@/hooks/useActiveBusinessId";
import { useToast } from "@/components/shared/Toast";

interface GoodsReceipt {
  _id: string;
  grnNumber: string;
  vendorId?: { businessName?: string; legalName?: string };
  warehouseId?: { warehouseName?: string };
  totalAcceptedQty: number;
  totalValue: number;
  status: string;
  createdAt: string;
}

interface PurchaseOrder {
  _id: string;
  poNumber: string;
  status: string;
  vendorId?: { companyName?: string; businessName?: string };
}

interface POItem {
  _id: string;
  materialId?: { name?: string };
  materialName?: string;
  orderedQuantity: number;
  receivedQuantity: number;
  pendingQuantity: number;
  unit: string;
}

function fmt(n?: number) {
  return `₹${(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function GoodsReceiptsPage() {
  const { businessId } = useActiveBusinessId();
  const toast = useToast();

  const [showModal, setShowModal] = useState(false);
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [selectedPoId, setSelectedPoId] = useState("");
  const [poItems, setPoItems] = useState<POItem[]>([]);
  const [receivedQty, setReceivedQty] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  const { data: receiptsData, isLoading: loading, mutate: fetchReceipts } = useSWR(
    businessId ? `/api/goods-receipts?businessId=${businessId}` : null
  );
  const receipts: GoodsReceipt[] = receiptsData?.success ? (receiptsData.data || []) : [];

  async function openModal() {
    setShowModal(true);
    setSelectedPoId("");
    setPoItems([]);
    const res = await fetch("/api/purchase-orders");
    const json = await res.json();
    if (json.success) {
      setPos((json.data || []).filter((po: PurchaseOrder) => ["APPROVED", "PARTIAL_RECEIVED"].includes(po.status)));
    }
  }

  async function selectPo(poId: string) {
    setSelectedPoId(poId);
    setPoItems([]);
    setReceivedQty({});
    if (!poId) return;
    const res = await fetch(`/api/purchase-orders/${poId}`);
    const json = await res.json();
    if (json.success) {
      const items = (json.data.items || []).filter((it: POItem) => (it.pendingQuantity ?? it.orderedQuantity - it.receivedQuantity) > 0);
      setPoItems(items);
      const initial: Record<string, number> = {};
      items.forEach((it: POItem) => {
        initial[it._id] = it.pendingQuantity ?? it.orderedQuantity - it.receivedQuantity;
      });
      setReceivedQty(initial);
    }
  }

  async function handleSubmit() {
    if (!businessId || !selectedPoId) return;
    const lines = poItems
      .map((it) => ({ purchaseOrderItemId: it._id, receivedQuantity: receivedQty[it._id] || 0 }))
      .filter((l) => l.receivedQuantity > 0);
    if (lines.length === 0) {
      toast.error("Enter a received quantity for at least one item");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/goods-receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, purchaseOrderId: selectedPoId, lines }),
      });
      const json = await res.json();
      if (!json.success) {
        toast.error(json.message || "Failed to record receipt");
        return;
      }
      toast.success(`Goods Receipt ${json.data.grnNumber} recorded`);
      setShowModal(false);
      fetchReceipts();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Goods Receipts</h1>
          <p className="text-sm text-gray-400">Record goods received against approved purchase orders — updates real stock.</p>
        </div>
        <button
          onClick={openModal}
          className="flex items-center gap-2 bg-gray-900 text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-gray-800"
        >
          <Plus className="w-4 h-4" /> Receive Goods
        </button>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left px-6 py-3 text-gray-400 font-medium">GRN #</th>
              <th className="text-left px-6 py-3 text-gray-400 font-medium">Vendor</th>
              <th className="text-left px-6 py-3 text-gray-400 font-medium">Warehouse</th>
              <th className="text-right px-6 py-3 text-gray-400 font-medium">Value</th>
              <th className="text-center px-6 py-3 text-gray-400 font-medium">Status</th>
              <th className="text-center px-6 py-3 text-gray-400 font-medium">Print</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={6} className="px-6 py-10 text-center text-gray-400"><Loader2 className="w-5 h-5 mx-auto animate-spin" /></td></tr>
            ) : receipts.length === 0 ? (
              <tr><td colSpan={6} className="px-6 py-10 text-center text-gray-400">No goods receipts yet</td></tr>
            ) : (
              receipts.map((r) => (
                <tr key={r._id} className="hover:bg-gray-50 transition">
                  <td className="px-6 py-3 font-mono text-xs text-gray-500">{r.grnNumber}</td>
                  <td className="px-6 py-3 text-gray-700">{r.vendorId?.businessName || r.vendorId?.legalName || "—"}</td>
                  <td className="px-6 py-3 text-gray-500">{r.warehouseId?.warehouseName || "—"}</td>
                  <td className="px-6 py-3 text-right text-gray-900">{fmt(r.totalValue)}</td>
                  <td className="px-6 py-3 text-center">
                    <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-600">{r.status}</span>
                  </td>
                  <td className="px-6 py-3 text-center">
                    <Link
                      href={`/admin/goods-receipts/${r._id}/print`}
                      target="_blank"
                      className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                      title="Print"
                    >
                      <Printer className="w-4 h-4" />
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-2xl max-h-[90vh] bg-white rounded-2xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">Receive Goods</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2">Purchase Order</p>
                <select
                  value={selectedPoId}
                  onChange={(e) => selectPo(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                >
                  <option value="">Select an approved purchase order…</option>
                  {pos.map((po) => (
                    <option key={po._id} value={po._id}>
                      {po.poNumber} — {po.vendorId?.companyName || po.vendorId?.businessName || "—"} ({po.status})
                    </option>
                  ))}
                </select>
                {pos.length === 0 && (
                  <p className="text-xs text-gray-400 mt-1">No purchase orders are currently approved / partially received.</p>
                )}
              </div>

              {poItems.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-2">Items pending receipt</p>
                  <div className="space-y-2">
                    {poItems.map((it) => (
                      <div key={it._id} className="grid grid-cols-12 gap-2 items-center text-xs">
                        <span className="col-span-6 text-gray-700">{it.materialId?.name || it.materialName}</span>
                        <span className="col-span-3 text-gray-400">
                          Pending: {it.pendingQuantity ?? it.orderedQuantity - it.receivedQuantity} {it.unit}
                        </span>
                        <input
                          type="number"
                          min={0}
                          max={it.pendingQuantity ?? it.orderedQuantity}
                          value={receivedQty[it._id] ?? 0}
                          onChange={(e) => setReceivedQty({ ...receivedQty, [it._id]: Number(e.target.value) })}
                          className="col-span-3 rounded-lg border border-gray-200 px-2 py-1.5"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-2">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-800">
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving || !selectedPoId}
                className="px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
              >
                {saving ? "Recording…" : "Record Receipt"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
