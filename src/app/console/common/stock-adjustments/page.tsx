"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  Plus,
  Search,
  RefreshCw,
  X,
  ChevronLeft,
  ChevronRight,
  PackagePlus,
  PackageMinus,
  Package,
  ClipboardList,
  ExternalLink,
  AlertCircle,
} from "lucide-react";
import Link from "next/link";
import { useActiveBusinessId } from "@/hooks/useActiveBusinessId";

// ─── Types ────────────────────────────────────────────────────────────────────

type AdjustmentType = "ADD" | "REMOVE" | "SET";
type StatusType = "APPROVED" | "PENDING" | "REJECTED";

interface InventoryItem {
  _id: string;
  name: string;
  sku?: string;
  quantity: number;
  unit?: string;
}

interface StockAdjustment {
  _id: string;
  inventoryItemId: string | { _id: string; name: string; sku?: string };
  adjustmentType: AdjustmentType;
  quantityAdjusted: number;
  previousQuantity: number;
  newQuantity: number;
  reason?: string;
  notes?: string;
  adjustedBy: string;
  status?: StatusType;
  warehouse?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function shortDate(iso: string) {
  return new Date(iso).toISOString().slice(0, 10);
}

function typeLabel(type: AdjustmentType) {
  if (type === "ADD") return "IN";
  if (type === "REMOVE") return "OUT";
  return "ADJUSTMENT";
}

function typeBadge(type: AdjustmentType) {
  if (type === "ADD")
    return (
      <span className="text-xs font-medium px-2 py-0.5 rounded-full text-emerald-400 bg-emerald-500/10">
        IN
      </span>
    );
  if (type === "REMOVE")
    return (
      <span className="text-xs font-medium px-2 py-0.5 rounded-full text-red-400 bg-red-500/10">
        OUT
      </span>
    );
  return (
    <span className="text-xs font-medium px-2 py-0.5 rounded-full text-blue-400 bg-blue-500/10">
      ADJUSTMENT
    </span>
  );
}

function statusBadge(status?: StatusType) {
  if (!status || status === "APPROVED")
    return (
      <span className="text-xs font-medium px-2 py-0.5 rounded-full text-emerald-400 bg-emerald-500/10">
        Approved
      </span>
    );
  if (status === "PENDING")
    return (
      <span className="text-xs font-medium px-2 py-0.5 rounded-full text-amber-400 bg-amber-500/10">
        Pending
      </span>
    );
  return (
    <span className="text-xs font-medium px-2 py-0.5 rounded-full text-red-400 bg-red-500/10">
      Rejected
    </span>
  );
}

function itemName(adj: StockAdjustment): string {
  if (typeof adj.inventoryItemId === "object" && adj.inventoryItemId !== null) {
    return adj.inventoryItemId.name ?? "—";
  }
  return "—";
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function StockAdjustmentsPage() {
  const { businessId } = useActiveBusinessId();

  // list state
  const [page, setPage] = useState(1);

  // filters
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [typeFilter, setTypeFilter] = useState<"" | AdjustmentType>("");

  // modal
  const [showModal, setShowModal] = useState(false);
  const [itemSearch, setItemSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // form
  const [form, setForm] = useState({
    inventoryItemId: "",
    adjustmentType: "ADD" as AdjustmentType,
    quantity: "",
    reason: "",
    notes: "",
    warehouse: "",
    date: new Date().toISOString().slice(0, 10),
  });

  // ── Fetch adjustments ──
  const adjustmentsParams = businessId
    ? new URLSearchParams({ businessId, page: String(page), limit: "20" }).toString()
    : null;
  const {
    data: adjustmentsRes,
    isLoading: loading,
    error: adjustmentsErrorObj,
    mutate: fetchAdjustments,
  } = useSWR(
    adjustmentsParams ? `/api/stock/adjustments?${adjustmentsParams}` : null,
    { keepPreviousData: true }
  );
  const adjustments: StockAdjustment[] = adjustmentsRes?.success ? adjustmentsRes.data ?? [] : [];
  const totalPages = adjustmentsRes?.pagination?.totalPages ?? 1;
  const total = adjustmentsRes?.pagination?.total ?? 0;
  const error = adjustmentsErrorObj
    ? adjustmentsErrorObj instanceof Error
      ? adjustmentsErrorObj.message
      : "Unknown error"
    : adjustmentsRes && !adjustmentsRes.success
    ? adjustmentsRes.error || "Failed to load"
    : null;

  // ── Fetch inventory items for modal ──
  const { data: inventoryItemsRes } = useSWR(
    showModal && businessId ? `/api/inventory/items?businessId=${businessId}&limit=200` : null
  );
  const inventoryItems: InventoryItem[] = inventoryItemsRes?.success ? inventoryItemsRes.data ?? [] : [];

  // ── Stats derived from current page data ──
  const today = new Date().toISOString().slice(0, 10);
  const todayAdj = adjustments.filter(
    (a) => a.createdAt.slice(0, 10) === today
  );
  const totalAdded = adjustments
    .filter((a) => a.adjustmentType === "ADD")
    .reduce((s, a) => s + a.quantityAdjusted, 0);
  const totalRemoved = adjustments
    .filter((a) => a.adjustmentType === "REMOVE")
    .reduce((s, a) => s + a.quantityAdjusted, 0);
  const pendingCount = adjustments.filter((a) => a.status === "PENDING").length;

  // ── Client-side filter ──
  const filtered = adjustments.filter((a) => {
    const name = itemName(a).toLowerCase();
    const matchSearch =
      !search ||
      name.includes(search.toLowerCase()) ||
      (a.reason || "").toLowerCase().includes(search.toLowerCase());
    const matchType = !typeFilter || a.adjustmentType === typeFilter;
    const matchFrom = !dateFrom || a.createdAt.slice(0, 10) >= dateFrom;
    const matchTo = !dateTo || a.createdAt.slice(0, 10) <= dateTo;
    return matchSearch && matchType && matchFrom && matchTo;
  });

  // ── Submit new adjustment ──
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!form.inventoryItemId) {
      setFormError("Please select an inventory item.");
      return;
    }
    if (!form.quantity || Number(form.quantity) <= 0) {
      setFormError("Quantity must be greater than 0.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/stock/adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId,
          inventoryItemId: form.inventoryItemId,
          adjustmentType: form.adjustmentType,
          quantity: Number(form.quantity),
          reason: form.reason || undefined,
          notes: form.notes || undefined,
          warehouse: form.warehouse || undefined,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to create");
      setShowModal(false);
      setForm({
        inventoryItemId: "",
        adjustmentType: "ADD",
        quantity: "",
        reason: "",
        notes: "",
        warehouse: "",
        date: new Date().toISOString().slice(0, 10),
      });
      setItemSearch("");
      fetchAdjustments();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Filtered inventory items for search ──
  const filteredItems = inventoryItems.filter(
    (it) =>
      !itemSearch ||
      it.name.toLowerCase().includes(itemSearch.toLowerCase()) ||
      (it.sku || "").toLowerCase().includes(itemSearch.toLowerCase())
  );

  const selectedItem = inventoryItems.find((i) => i._id === form.inventoryItemId);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Stock Adjustments</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Track and manage all inventory quantity adjustments
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/console/common/stock-adjustments/new"
            className="px-3 py-2 text-xs text-gray-500 border border-gray-200 rounded-xl hover:text-gray-900 hover:border-gray-400 flex items-center gap-1.5"
          >
            <ExternalLink size={12} />
            Full Form
          </Link>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-800"
          >
            <Plus size={16} />
            New Adjustment
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2 mb-2">
            <ClipboardList size={14} className="text-gray-500" />
            <span className="text-xs text-gray-500">Today&apos;s Adjustments</span>
          </div>
          <p className="text-2xl font-semibold text-gray-900">{todayAdj.length}</p>
        </div>
        <button
          type="button"
          onClick={() => setTypeFilter((v) => (v === "ADD" ? "" : "ADD"))}
          className={`text-left rounded-xl border bg-white p-4 transition-colors ${
            typeFilter === "ADD" ? "border-gray-900 ring-2 ring-gray-900" : "border-gray-200 hover:border-gray-400"
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <PackagePlus size={14} className="text-emerald-500" />
            <span className="text-xs text-gray-500">Total Added</span>
          </div>
          <p className="text-2xl font-semibold text-emerald-400">+{totalAdded}</p>
        </button>
        <button
          type="button"
          onClick={() => setTypeFilter((v) => (v === "REMOVE" ? "" : "REMOVE"))}
          className={`text-left rounded-xl border bg-white p-4 transition-colors ${
            typeFilter === "REMOVE" ? "border-gray-900 ring-2 ring-gray-900" : "border-gray-200 hover:border-gray-400"
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <PackageMinus size={14} className="text-red-500" />
            <span className="text-xs text-gray-500">Total Removed</span>
          </div>
          <p className="text-2xl font-semibold text-red-400">-{totalRemoved}</p>
        </button>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2 mb-2">
            <Package size={14} className="text-amber-500" />
            <span className="text-xs text-gray-500">Pending Approvals</span>
          </div>
          <p className="text-2xl font-semibold text-amber-400">{pendingCount}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
          />
          <input
            type="text"
            placeholder="Search item name or reason..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as "" | AdjustmentType)}
          title="Filter by adjustment type"
          className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 focus:outline-none"
        >
          <option value="">All Types</option>
          <option value="ADD">IN (Add)</option>
          <option value="REMOVE">OUT (Remove)</option>
          <option value="SET">Correction (Set)</option>
        </select>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            title="Filter from date"
            className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 focus:outline-none focus:border-gray-400"
          />
          <span className="text-gray-600 text-xs">to</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            title="Filter to date"
            className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 focus:outline-none focus:border-gray-400"
          />
        </div>
        <button
          onClick={() => {
            setSearch("");
            setDateFrom("");
            setDateTo("");
            setTypeFilter("");
          }}
          className="px-3 py-2 text-xs text-gray-500 border border-gray-200 rounded-xl hover:text-gray-900 hover:border-gray-400"
        >
          Clear
        </button>
        <button
          onClick={fetchAdjustments}
          className="px-3 py-2 text-xs text-gray-500 border border-gray-200 rounded-xl hover:text-gray-900 hover:border-gray-400 flex items-center gap-1.5"
        >
          <RefreshCw size={12} />
          Refresh
        </button>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 bg-white">
              <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">Date</th>
              <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">Item</th>
              <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">Type</th>
              <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">Qty</th>
              <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">Before → After</th>
              <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">Reason</th>
              <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">Warehouse</th>
              <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">Adjusted By</th>
              <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">Status</th>
              <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">Print</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={10}>
                  <div className="p-12 text-center text-gray-500">Loading…</div>
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={10}>
                  <div className="p-12 text-center">
                    <AlertCircle size={32} className="mx-auto mb-3 text-red-400" />
                    <p className="text-red-400 text-sm">{error}</p>
                    <button
                      onClick={fetchAdjustments}
                      className="mt-3 px-3 py-2 text-xs text-gray-500 border border-gray-200 rounded-xl hover:text-gray-900"
                    >
                      Retry
                    </button>
                  </div>
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={10}>
                  <div className="p-12 text-center">
                    <Package size={32} className="mx-auto mb-3 text-gray-700" />
                    <p className="text-gray-500 text-sm">No adjustments found</p>
                    <button
                      onClick={() => setShowModal(true)}
                      className="mt-4 flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-800 mx-auto"
                    >
                      <Plus size={14} />
                      New Adjustment
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((adj) => (
                <tr
                  key={adj._id}
                  className="hover:bg-gray-50 transition-colors"
                >
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                    {formatDate(adj.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-gray-900">{itemName(adj)}</span>
                    {typeof adj.inventoryItemId === "object" &&
                      adj.inventoryItemId?.sku && (
                        <span className="text-xs text-gray-600 block">
                          {adj.inventoryItemId.sku}
                        </span>
                      )}
                  </td>
                  <td className="px-4 py-3">{typeBadge(adj.adjustmentType)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        adj.adjustmentType === "ADD"
                          ? "text-emerald-400 font-medium text-sm"
                          : adj.adjustmentType === "REMOVE"
                          ? "text-red-400 font-medium text-sm"
                          : "text-blue-400 font-medium text-sm"
                      }
                    >
                      {adj.adjustmentType === "ADD" ? "+" : adj.adjustmentType === "REMOVE" ? "-" : ""}
                      {adj.quantityAdjusted}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    <span className="text-gray-500">{adj.previousQuantity}</span>
                    <span className="text-gray-600 mx-1">→</span>
                    <span className="text-gray-500">{adj.newQuantity}</span>
                  </td>
                  <td className="px-4 py-3 max-w-[160px]">
                    <span className="text-xs text-gray-500 truncate block">
                      {adj.reason || adj.notes || "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {(adj as StockAdjustment & { warehouse?: string }).warehouse || "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 font-mono">
                    {adj.adjustedBy?.slice(-8) || "—"}
                  </td>
                  <td className="px-4 py-3">{statusBadge(adj.status)}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/console/stock-adjustments/${adj._id}/print`}
                      target="_blank"
                      className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                      title="Print"
                    >
                      <ExternalLink size={14} />
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {!loading && !error && total > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-500">
            Showing {filtered.length} of {total} adjustments
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-2 text-xs text-gray-500 border border-gray-200 rounded-xl hover:text-gray-900 hover:border-gray-400 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
            >
              <ChevronLeft size={12} /> Prev
            </button>
            <span className="text-xs text-gray-500">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-2 text-xs text-gray-500 border border-gray-200 rounded-xl hover:text-gray-900 hover:border-gray-400 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
            >
              Next <ChevronRight size={12} />
            </button>
          </div>
        </div>
      )}

      {/* New Adjustment Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-white border border-gray-200 rounded-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">New Stock Adjustment</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Add, remove, or correct inventory quantity
                </p>
              </div>
              <button
                onClick={() => {
                  setShowModal(false);
                  setFormError(null);
                }}
                className="text-gray-500 hover:text-gray-900 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSubmit}>
              <div className="px-6 py-5 space-y-4 max-h-[65vh] overflow-y-auto">
                {formError && (
                  <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
                    <AlertCircle size={14} className="text-red-400 mt-0.5 shrink-0" />
                    <p className="text-xs text-red-400">{formError}</p>
                  </div>
                )}

                {/* Item Search */}
                <div>
                  <label className="text-xs text-gray-500 block mb-1">
                    Inventory Item <span className="text-red-400">*</span>
                  </label>
                  {selectedItem ? (
                    <div className="flex items-center justify-between px-3 py-2.5 bg-white border border-gray-300 rounded-lg">
                      <div>
                        <p className="text-sm text-gray-900">{selectedItem.name}</p>
                        <p className="text-xs text-gray-500">
                          {selectedItem.sku && `SKU: ${selectedItem.sku} · `}
                          Current stock: {selectedItem.quantity ?? 0}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setForm((f) => ({ ...f, inventoryItemId: "" }));
                          setItemSearch("");
                        }}
                        className="text-gray-500 hover:text-gray-900"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <div>
                      <div className="relative">
                        <Search
                          size={14}
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
                        />
                        <input
                          type="text"
                          placeholder="Search by name or SKU..."
                          value={itemSearch}
                          onChange={(e) => setItemSearch(e.target.value)}
                          className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400"
                        />
                      </div>
                      {itemSearch && (
                        <div className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-gray-200 bg-white">
                          {filteredItems.length === 0 ? (
                            <p className="px-3 py-2 text-xs text-gray-500">
                              No items found
                            </p>
                          ) : (
                            filteredItems.slice(0, 12).map((it) => (
                              <button
                                type="button"
                                key={it._id}
                                onClick={() => {
                                  setForm((f) => ({
                                    ...f,
                                    inventoryItemId: it._id,
                                  }));
                                  setItemSearch("");
                                }}
                                className="w-full text-left px-3 py-2 hover:bg-gray-50 transition-colors"
                              >
                                <p className="text-sm text-gray-900">{it.name}</p>
                                <p className="text-xs text-gray-500">
                                  {it.sku && `${it.sku} · `}Stock:{" "}
                                  {it.quantity ?? 0}
                                </p>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Type */}
                <div>
                  <label className="text-xs text-gray-500 block mb-1">
                    Adjustment Type <span className="text-red-400">*</span>
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(["ADD", "REMOVE", "SET"] as AdjustmentType[]).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() =>
                          setForm((f) => ({ ...f, adjustmentType: t }))
                        }
                        className={`py-2 rounded-lg border text-xs font-medium transition-colors ${
                          form.adjustmentType === t
                            ? t === "ADD"
                              ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400"
                              : t === "REMOVE"
                              ? "bg-red-500/20 border-red-500/40 text-red-400"
                              : "bg-blue-500/20 border-blue-500/40 text-blue-400"
                            : "bg-white border-gray-200 text-gray-500 hover:border-gray-400"
                        }`}
                      >
                        {t === "ADD" ? "Add (IN)" : t === "REMOVE" ? "Remove (OUT)" : "Correction (SET)"}
                      </button>
                    ))}
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
                        ? "Set absolute quantity"
                        : "Enter quantity"
                    }
                    value={form.quantity}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, quantity: e.target.value }))
                    }
                    onFocus={(e) => e.target.select()}
                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400"
                    required
                  />
                  {selectedItem && form.quantity && (
                    <p className="text-xs text-gray-600 mt-1">
                      {form.adjustmentType === "ADD"
                        ? `New stock: ${(selectedItem.quantity ?? 0) + Number(form.quantity)}`
                        : form.adjustmentType === "REMOVE"
                        ? `New stock: ${Math.max(0, (selectedItem.quantity ?? 0) - Number(form.quantity))}`
                        : `New stock: ${form.quantity}`}
                    </p>
                  )}
                </div>

                {/* Reason */}
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Reason</label>
                  <input
                    type="text"
                    placeholder="e.g. Damaged goods, stock count correction..."
                    value={form.reason}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, reason: e.target.value }))
                    }
                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400"
                  />
                </div>

                {/* Warehouse */}
                <div>
                  <label className="text-xs text-gray-500 block mb-1">
                    Warehouse (optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Main Warehouse, Store 1..."
                    value={form.warehouse}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, warehouse: e.target.value }))
                    }
                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400"
                  />
                </div>

                {/* Notes */}
                <div>
                  <label className="text-xs text-gray-500 block mb-1">
                    Additional Notes
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Any additional notes..."
                    value={form.notes}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, notes: e.target.value }))
                    }
                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400 resize-none"
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
                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 focus:outline-none focus:border-gray-400"
                  />
                </div>
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setFormError(null);
                  }}
                  className="px-3 py-2 text-xs text-gray-500 border border-gray-200 rounded-xl hover:text-gray-900 hover:border-gray-400"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
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
        </div>
      )}
    </div>
  );
}
