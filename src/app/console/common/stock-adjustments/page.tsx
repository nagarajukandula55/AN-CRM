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
import { Spinner } from "@/components/ui/Spinner";

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
      <span className="text-xs font-medium px-2 py-0.5 rounded-full text-success bg-success-soft">
        IN
      </span>
    );
  if (type === "REMOVE")
    return (
      <span className="text-xs font-medium px-2 py-0.5 rounded-full text-danger bg-danger-soft">
        OUT
      </span>
    );
  return (
    <span className="text-xs font-medium px-2 py-0.5 rounded-full text-info bg-info-soft">
      ADJUSTMENT
    </span>
  );
}

function statusBadge(status?: StatusType) {
  if (!status || status === "APPROVED")
    return (
      <span className="text-xs font-medium px-2 py-0.5 rounded-full text-success bg-success-soft">
        Approved
      </span>
    );
  if (status === "PENDING")
    return (
      <span className="text-xs font-medium px-2 py-0.5 rounded-full text-warning bg-warning-soft">
        Pending
      </span>
    );
  return (
    <span className="text-xs font-medium px-2 py-0.5 rounded-full text-danger bg-danger-soft">
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
          <h1 className="text-xl font-semibold text-ink">Stock Adjustments</h1>
          <p className="text-sm text-ink-3 mt-0.5">
            Track and manage all inventory quantity adjustments
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/console/common/stock-adjustments/new"
            className="px-3 py-2 text-xs text-ink-3 border border-border rounded-card hover:text-ink hover:border-border-strong flex items-center gap-1.5"
          >
            <ExternalLink size={12} />
            Full Form
          </Link>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-accent text-accent-fg rounded-card text-sm font-medium hover:bg-accent-hover"
          >
            <Plus size={16} />
            New Adjustment
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-card border border-border bg-surface p-4">
          <div className="flex items-center gap-2 mb-2">
            <ClipboardList size={14} className="text-ink-3" />
            <span className="text-xs text-ink-3">Today&apos;s Adjustments</span>
          </div>
          <p className="text-2xl font-semibold text-ink">{todayAdj.length}</p>
        </div>
        <button
          type="button"
          onClick={() => setTypeFilter((v) => (v === "ADD" ? "" : "ADD"))}
          className={`text-left rounded-card border bg-surface p-4 transition-colors ${
            typeFilter === "ADD" ? "border-accent ring-2 ring-accent-soft" : "border-border hover:border-border-strong"
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <PackagePlus size={14} className="text-success" />
            <span className="text-xs text-ink-3">Total Added</span>
          </div>
          <p className="text-2xl font-semibold text-success">+{totalAdded}</p>
        </button>
        <button
          type="button"
          onClick={() => setTypeFilter((v) => (v === "REMOVE" ? "" : "REMOVE"))}
          className={`text-left rounded-card border bg-surface p-4 transition-colors ${
            typeFilter === "REMOVE" ? "border-accent ring-2 ring-accent-soft" : "border-border hover:border-border-strong"
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <PackageMinus size={14} className="text-danger" />
            <span className="text-xs text-ink-3">Total Removed</span>
          </div>
          <p className="text-2xl font-semibold text-danger">-{totalRemoved}</p>
        </button>
        <div className="rounded-card border border-border bg-surface p-4">
          <div className="flex items-center gap-2 mb-2">
            <Package size={14} className="text-warning" />
            <span className="text-xs text-ink-3">Pending Approvals</span>
          </div>
          <p className="text-2xl font-semibold text-warning">{pendingCount}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"
          />
          <input
            type="text"
            placeholder="Search item name or reason..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-surface border border-border rounded-control text-sm text-ink placeholder-ink-3 focus:outline-none focus:border-border-strong"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as "" | AdjustmentType)}
          title="Filter by adjustment type"
          className="px-3 py-2 bg-surface border border-border rounded-control text-sm text-ink-2 focus:outline-none"
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
            className="px-3 py-2 bg-surface border border-border rounded-control text-sm text-ink-2 focus:outline-none focus:border-border-strong"
          />
          <span className="text-ink-2 text-xs">to</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            title="Filter to date"
            className="px-3 py-2 bg-surface border border-border rounded-control text-sm text-ink-2 focus:outline-none focus:border-border-strong"
          />
        </div>
        <button
          onClick={() => {
            setSearch("");
            setDateFrom("");
            setDateTo("");
            setTypeFilter("");
          }}
          className="px-3 py-2 text-xs text-ink-3 border border-border rounded-card hover:text-ink hover:border-border-strong"
        >
          Clear
        </button>
        <button
          onClick={fetchAdjustments}
          className="px-3 py-2 text-xs text-ink-3 border border-border rounded-card hover:text-ink hover:border-border-strong flex items-center gap-1.5"
        >
          <RefreshCw size={12} />
          Refresh
        </button>
      </div>

      {/* Table */}
      <div className="rounded-card border border-border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-surface">
              <th className="px-4 py-3 text-left text-xs text-ink-3 font-medium">Date</th>
              <th className="px-4 py-3 text-left text-xs text-ink-3 font-medium">Item</th>
              <th className="px-4 py-3 text-left text-xs text-ink-3 font-medium">Type</th>
              <th className="px-4 py-3 text-left text-xs text-ink-3 font-medium">Qty</th>
              <th className="px-4 py-3 text-left text-xs text-ink-3 font-medium">Before → After</th>
              <th className="px-4 py-3 text-left text-xs text-ink-3 font-medium">Reason</th>
              <th className="px-4 py-3 text-left text-xs text-ink-3 font-medium">Warehouse</th>
              <th className="px-4 py-3 text-left text-xs text-ink-3 font-medium">Adjusted By</th>
              <th className="px-4 py-3 text-left text-xs text-ink-3 font-medium">Status</th>
              <th className="px-4 py-3 text-left text-xs text-ink-3 font-medium">Print</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr>
                <td colSpan={10}>
                  <div className="p-12 text-center text-ink-3">Loading…</div>
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={10}>
                  <div className="p-12 text-center">
                    <AlertCircle size={32} className="mx-auto mb-3 text-danger" />
                    <p className="text-danger text-sm">{error}</p>
                    <button
                      onClick={fetchAdjustments}
                      className="mt-3 px-3 py-2 text-xs text-ink-3 border border-border rounded-card hover:text-ink"
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
                    <Package size={32} className="mx-auto mb-3 text-ink-2" />
                    <p className="text-ink-3 text-sm">No adjustments found</p>
                    <button
                      onClick={() => setShowModal(true)}
                      className="mt-4 flex items-center gap-2 px-4 py-2.5 bg-accent text-accent-fg rounded-card text-sm font-medium hover:bg-accent-hover mx-auto"
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
                  className="hover:bg-surface-2 transition-colors"
                >
                  <td className="px-4 py-3 text-xs text-ink-3 whitespace-nowrap">
                    {formatDate(adj.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-ink">{itemName(adj)}</span>
                    {typeof adj.inventoryItemId === "object" &&
                      adj.inventoryItemId?.sku && (
                        <span className="text-xs text-ink-2 block">
                          {adj.inventoryItemId.sku}
                        </span>
                      )}
                  </td>
                  <td className="px-4 py-3">{typeBadge(adj.adjustmentType)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        adj.adjustmentType === "ADD"
                          ? "text-success font-medium text-sm"
                          : adj.adjustmentType === "REMOVE"
                          ? "text-danger font-medium text-sm"
                          : "text-info font-medium text-sm"
                      }
                    >
                      {adj.adjustmentType === "ADD" ? "+" : adj.adjustmentType === "REMOVE" ? "-" : ""}
                      {adj.quantityAdjusted}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-3">
                    <span className="text-ink-3">{adj.previousQuantity}</span>
                    <span className="text-ink-2 mx-1">→</span>
                    <span className="text-ink-3">{adj.newQuantity}</span>
                  </td>
                  <td className="px-4 py-3 max-w-[160px]">
                    <span className="text-xs text-ink-3 truncate block">
                      {adj.reason || adj.notes || "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-3">
                    {(adj as StockAdjustment & { warehouse?: string }).warehouse || "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-3 font-mono">
                    {adj.adjustedBy?.slice(-8) || "—"}
                  </td>
                  <td className="px-4 py-3">{statusBadge(adj.status)}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/console/common/stock-adjustments/${adj._id}/print`}
                      target="_blank"
                      className="inline-flex items-center justify-center w-8 h-8 rounded-control text-ink-3 hover:text-ink-2 hover:bg-surface-2"
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
          <p className="text-xs text-ink-3">
            Showing {filtered.length} of {total} adjustments
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-2 text-xs text-ink-3 border border-border rounded-card hover:text-ink hover:border-border-strong disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
            >
              <ChevronLeft size={12} /> Prev
            </button>
            <span className="text-xs text-ink-3">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-2 text-xs text-ink-3 border border-border rounded-card hover:text-ink hover:border-border-strong disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
            >
              Next <ChevronRight size={12} />
            </button>
          </div>
        </div>
      )}

      {/* New Adjustment Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-surface border border-border rounded-card overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-border flex justify-between items-center">
              <div>
                <h2 className="text-sm font-semibold text-ink">New Stock Adjustment</h2>
                <p className="text-xs text-ink-3 mt-0.5">
                  Add, remove, or correct inventory quantity
                </p>
              </div>
              <button
                onClick={() => {
                  setShowModal(false);
                  setFormError(null);
                }}
                className="text-ink-3 hover:text-ink transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSubmit}>
              <div className="px-6 py-5 space-y-4 max-h-[65vh] overflow-y-auto">
                {formError && (
                  <div className="flex items-start gap-2 px-3 py-2.5 rounded-control bg-danger-soft border border-danger/20">
                    <AlertCircle size={14} className="text-danger mt-0.5 shrink-0" />
                    <p className="text-xs text-danger">{formError}</p>
                  </div>
                )}

                {/* Item Search */}
                <div>
                  <label className="text-xs text-ink-3 block mb-1">
                    Inventory Item <span className="text-danger">*</span>
                  </label>
                  {selectedItem ? (
                    <div className="flex items-center justify-between px-3 py-2.5 bg-surface border border-border rounded-control">
                      <div>
                        <p className="text-sm text-ink">{selectedItem.name}</p>
                        <p className="text-xs text-ink-3">
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
                        className="text-ink-3 hover:text-ink"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <div>
                      <div className="relative">
                        <Search
                          size={14}
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"
                        />
                        <input
                          type="text"
                          placeholder="Search by name or SKU..."
                          value={itemSearch}
                          onChange={(e) => setItemSearch(e.target.value)}
                          className="w-full pl-9 pr-3 py-2 bg-surface border border-border rounded-control text-sm text-ink placeholder-ink-3 focus:outline-none focus:border-border-strong"
                        />
                      </div>
                      {itemSearch && (
                        <div className="mt-1 max-h-40 overflow-y-auto rounded-control border border-border bg-surface">
                          {filteredItems.length === 0 ? (
                            <p className="px-3 py-2 text-xs text-ink-3">
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
                                className="w-full text-left px-3 py-2 hover:bg-surface-2 transition-colors"
                              >
                                <p className="text-sm text-ink">{it.name}</p>
                                <p className="text-xs text-ink-3">
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
                  <label className="text-xs text-ink-3 block mb-1">
                    Adjustment Type <span className="text-danger">*</span>
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(["ADD", "REMOVE", "SET"] as AdjustmentType[]).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() =>
                          setForm((f) => ({ ...f, adjustmentType: t }))
                        }
                        className={`py-2 rounded-control border text-xs font-medium transition-colors ${
                          form.adjustmentType === t
                            ? t === "ADD"
                              ? "bg-success-soft border-success/40 text-success"
                              : t === "REMOVE"
                              ? "bg-danger-soft border-danger/40 text-danger"
                              : "bg-info-soft border-info/40 text-info"
                            : "bg-surface border-border text-ink-3 hover:border-border-strong"
                        }`}
                      >
                        {t === "ADD" ? "Add (IN)" : t === "REMOVE" ? "Remove (OUT)" : "Correction (SET)"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Quantity */}
                <div>
                  <label className="text-xs text-ink-3 block mb-1">
                    Quantity <span className="text-danger">*</span>
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
                    className="w-full px-3 py-2 bg-surface border border-border rounded-control text-sm text-ink placeholder-ink-3 focus:outline-none focus:border-border-strong"
                    required
                  />
                  {selectedItem && form.quantity && (
                    <p className="text-xs text-ink-2 mt-1">
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
                  <label className="text-xs text-ink-3 block mb-1">Reason</label>
                  <input
                    type="text"
                    placeholder="e.g. Damaged goods, stock count correction..."
                    value={form.reason}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, reason: e.target.value }))
                    }
                    className="w-full px-3 py-2 bg-surface border border-border rounded-control text-sm text-ink placeholder-ink-3 focus:outline-none focus:border-border-strong"
                  />
                </div>

                {/* Warehouse */}
                <div>
                  <label className="text-xs text-ink-3 block mb-1">
                    Warehouse (optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Main Warehouse, Store 1..."
                    value={form.warehouse}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, warehouse: e.target.value }))
                    }
                    className="w-full px-3 py-2 bg-surface border border-border rounded-control text-sm text-ink placeholder-ink-3 focus:outline-none focus:border-border-strong"
                  />
                </div>

                {/* Notes */}
                <div>
                  <label className="text-xs text-ink-3 block mb-1">
                    Additional Notes
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Any additional notes..."
                    value={form.notes}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, notes: e.target.value }))
                    }
                    className="w-full px-3 py-2 bg-surface border border-border rounded-control text-sm text-ink placeholder-ink-3 focus:outline-none focus:border-border-strong resize-none"
                  />
                </div>

                {/* Date */}
                <div>
                  <label className="text-xs text-ink-3 block mb-1">Date</label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, date: e.target.value }))
                    }
                    title="Adjustment date"
                    className="w-full px-3 py-2 bg-surface border border-border rounded-control text-sm text-ink-2 focus:outline-none focus:border-border-strong"
                  />
                </div>
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setFormError(null);
                  }}
                  className="px-3 py-2 text-xs text-ink-3 border border-border rounded-card hover:text-ink hover:border-border-strong"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-2 px-4 py-2.5 bg-accent text-accent-fg rounded-card text-sm font-medium hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? (
                    <>
                      <Spinner size={14} />
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
