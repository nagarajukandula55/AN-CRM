"use client";

import { useState } from "react";
import useSWR from "swr";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Search,
  Plus,
  RefreshCw,
  AlertCircle,
  PackagePlus,
  PackageMinus,
  Package,
  CheckCircle,
} from "lucide-react";
import Link from "next/link";
import { useActiveBusinessId } from "@/hooks/useActiveBusinessId";

type AdjustmentType = "ADD" | "REMOVE" | "SET";

interface InventoryItem {
  _id: string;
  name: string;
  sku?: string;
  quantity: number;
  unit?: string;
  category?: string;
}

export default function NewStockAdjustmentPage() {
  const router = useRouter();
  const { businessId } = useActiveBusinessId();

  const [itemSearch, setItemSearch] = useState("");
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    adjustmentType: "ADD" as AdjustmentType,
    quantity: "",
    reason: "",
    notes: "",
    warehouse: "",
    date: new Date().toISOString().slice(0, 10),
  });

  // Fetch inventory items
  const { data: itemsRes, isLoading: loading } = useSWR(
    businessId ? `/api/inventory/items?businessId=${businessId}&limit=500` : null
  );
  const inventoryItems: InventoryItem[] = itemsRes?.success ? itemsRes.data ?? [] : [];

  const filteredItems = inventoryItems.filter(
    (it) =>
      !itemSearch ||
      it.name.toLowerCase().includes(itemSearch.toLowerCase()) ||
      (it.sku || "").toLowerCase().includes(itemSearch.toLowerCase()) ||
      (it.category || "").toLowerCase().includes(itemSearch.toLowerCase())
  );

  const newQuantity = selectedItem
    ? form.adjustmentType === "ADD"
      ? (selectedItem.quantity ?? 0) + Number(form.quantity || 0)
      : form.adjustmentType === "REMOVE"
      ? Math.max(0, (selectedItem.quantity ?? 0) - Number(form.quantity || 0))
      : Number(form.quantity || 0)
    : 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!selectedItem) {
      setError("Please select an inventory item.");
      return;
    }
    if (!form.quantity || Number(form.quantity) <= 0) {
      setError("Quantity must be greater than 0.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/stock/adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId,
          inventoryItemId: selectedItem._id,
          adjustmentType: form.adjustmentType,
          quantity: Number(form.quantity),
          reason: form.reason || undefined,
          notes: form.notes || undefined,
          warehouse: form.warehouse || undefined,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to create");
      setSubmitted(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={32} className="text-emerald-400" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            Adjustment Created
          </h2>
          <p className="text-sm text-gray-500 mb-6">
            Stock adjustment has been recorded successfully.
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => {
                setSubmitted(false);
                setSelectedItem(null);
                setItemSearch("");
                setForm({
                  adjustmentType: "ADD",
                  quantity: "",
                  reason: "",
                  notes: "",
                  warehouse: "",
                  date: new Date().toISOString().slice(0, 10),
                });
              }}
              className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-800"
            >
              <Plus size={14} />
              New Adjustment
            </button>
            <Link
              href="/console/stock-adjustments"
              className="px-3 py-2 text-xs text-gray-500 border border-gray-200 rounded-xl hover:text-gray-900 hover:border-gray-400 flex items-center"
            >
              View All
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/console/stock-adjustments"
          className="p-2 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition-colors"
        >
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            New Stock Adjustment
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Record an inventory quantity change
          </p>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20">
          <AlertCircle size={16} className="text-red-400 mt-0.5 shrink-0" />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Item Selection */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
          <h3 className="text-sm font-medium text-gray-900">Select Item</h3>

          {selectedItem ? (
            <div className="flex items-center justify-between p-4 rounded-xl border border-gray-300 bg-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center">
                  <Package size={18} className="text-gray-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {selectedItem.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {selectedItem.sku && `SKU: ${selectedItem.sku} · `}
                    Current stock:{" "}
                    <span className="text-gray-600">
                      {selectedItem.quantity ?? 0}
                    </span>{" "}
                    {selectedItem.unit || "units"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedItem(null);
                  setItemSearch("");
                }}
                className="text-xs text-gray-500 hover:text-gray-900 border border-gray-200 px-3 py-1.5 rounded-lg hover:border-gray-400 transition-colors"
              >
                Change
              </button>
            </div>
          ) : (
            <div>
              <div className="relative mb-3">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
                />
                <input
                  type="text"
                  placeholder="Search by name, SKU, or category..."
                  value={itemSearch}
                  onChange={(e) => setItemSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400"
                />
              </div>
              {loading ? (
                <p className="text-xs text-gray-500 text-center py-4">
                  Loading items…
                </p>
              ) : (
                <div className="max-h-56 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-white/[0.04]">
                  {(itemSearch ? filteredItems : inventoryItems)
                    .slice(0, 20)
                    .map((it) => (
                      <button
                        key={it._id}
                        type="button"
                        onClick={() => {
                          setSelectedItem(it);
                          setItemSearch("");
                        }}
                        className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors flex items-center justify-between group"
                      >
                        <div>
                          <p className="text-sm text-gray-900 group-hover:text-gray-900">
                            {it.name}
                          </p>
                          <p className="text-xs text-gray-600">
                            {it.sku && `${it.sku} · `}
                            {it.category && `${it.category} · `}
                            Stock: {it.quantity ?? 0}
                          </p>
                        </div>
                        <span className="text-xs text-gray-600 group-hover:text-gray-500">
                          Select →
                        </span>
                      </button>
                    ))}
                  {!itemSearch && inventoryItems.length === 0 && (
                    <p className="text-xs text-gray-500 text-center py-4">
                      No inventory items found
                    </p>
                  )}
                  {itemSearch && filteredItems.length === 0 && (
                    <p className="text-xs text-gray-500 text-center py-4">
                      No items match your search
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Adjustment Details */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-5">
          <h3 className="text-sm font-medium text-gray-900">Adjustment Details</h3>

          {/* Type */}
          <div>
            <label className="text-xs text-gray-500 block mb-2">
              Adjustment Type <span className="text-red-400">*</span>
            </label>
            <div className="grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() =>
                  setForm((f) => ({ ...f, adjustmentType: "ADD" }))
                }
                className={`py-3 rounded-xl border text-sm font-medium transition-colors flex flex-col items-center gap-1.5 ${
                  form.adjustmentType === "ADD"
                    ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400"
                    : "bg-white border-gray-200 text-gray-500 hover:border-gray-400 hover:text-gray-600"
                }`}
              >
                <PackagePlus size={18} />
                Add (IN)
              </button>
              <button
                type="button"
                onClick={() =>
                  setForm((f) => ({ ...f, adjustmentType: "REMOVE" }))
                }
                className={`py-3 rounded-xl border text-sm font-medium transition-colors flex flex-col items-center gap-1.5 ${
                  form.adjustmentType === "REMOVE"
                    ? "bg-red-500/20 border-red-500/40 text-red-400"
                    : "bg-white border-gray-200 text-gray-500 hover:border-gray-400 hover:text-gray-600"
                }`}
              >
                <PackageMinus size={18} />
                Remove (OUT)
              </button>
              <button
                type="button"
                onClick={() =>
                  setForm((f) => ({ ...f, adjustmentType: "SET" }))
                }
                className={`py-3 rounded-xl border text-sm font-medium transition-colors flex flex-col items-center gap-1.5 ${
                  form.adjustmentType === "SET"
                    ? "bg-blue-500/20 border-blue-500/40 text-blue-400"
                    : "bg-white border-gray-200 text-gray-500 hover:border-gray-400 hover:text-gray-600"
                }`}
              >
                <Package size={18} />
                Correct (SET)
              </button>
            </div>
          </div>

          {/* Quantity */}
          <div>
            <label className="text-xs text-gray-500 block mb-1">
              Quantity <span className="text-red-400">*</span>
            </label>
            <input
              type="number"
              min="0"
              step="any"
              placeholder={
                form.adjustmentType === "SET"
                  ? "Enter absolute quantity to set"
                  : "Enter quantity to adjust"
              }
              value={form.quantity}
              onChange={(e) =>
                setForm((f) => ({ ...f, quantity: e.target.value }))
              }
              onFocus={(e) => e.target.select()}
              className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400"
              required
            />
            {selectedItem && form.quantity && Number(form.quantity) > 0 && (
              <div className="mt-2 px-3 py-2 rounded-lg bg-white border border-gray-200 flex items-center justify-between">
                <span className="text-xs text-gray-500">Resulting stock:</span>
                <span
                  className={`text-sm font-medium ${
                    newQuantity > (selectedItem.quantity ?? 0)
                      ? "text-emerald-400"
                      : newQuantity < (selectedItem.quantity ?? 0)
                      ? "text-red-400"
                      : "text-blue-400"
                  }`}
                >
                  {selectedItem.quantity ?? 0} → {newQuantity}{" "}
                  {selectedItem.unit || "units"}
                </span>
              </div>
            )}
          </div>

          {/* Reason */}
          <div>
            <label className="text-xs text-gray-500 block mb-1">Reason</label>
            <input
              type="text"
              placeholder="e.g. Physical count correction, damaged goods, supplier return..."
              value={form.reason}
              onChange={(e) =>
                setForm((f) => ({ ...f, reason: e.target.value }))
              }
              className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400"
            />
          </div>

          {/* Warehouse */}
          <div>
            <label className="text-xs text-gray-500 block mb-1">
              Warehouse / Location
            </label>
            <input
              type="text"
              placeholder="e.g. Main Warehouse, Store Room A..."
              value={form.warehouse}
              onChange={(e) =>
                setForm((f) => ({ ...f, warehouse: e.target.value }))
              }
              className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs text-gray-500 block mb-1">
              Additional Notes
            </label>
            <textarea
              rows={3}
              placeholder="Any additional context, reference numbers, or remarks..."
              value={form.notes}
              onChange={(e) =>
                setForm((f) => ({ ...f, notes: e.target.value }))
              }
              className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400 resize-none"
            />
          </div>

          {/* Date */}
          <div>
            <label className="text-xs text-gray-500 block mb-1">Date</label>
            <input
              type="date"
              value={form.date}
              onChange={(e) =>
                setForm((f) => ({ ...f, date: e.target.value }))
              }
              title="Adjustment date"
              className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 focus:outline-none focus:border-gray-400"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between">
          <Link
            href="/console/stock-adjustments"
            className="px-3 py-2 text-xs text-gray-500 border border-gray-200 rounded-xl hover:text-gray-900 hover:border-gray-400"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={submitting || !selectedItem}
            className="flex items-center gap-2 px-6 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <>
                <RefreshCw size={14} className="animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Plus size={14} />
                Create Adjustment
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
