"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import {
  Plus,
  Search,
  RefreshCw,
  X,
  ArrowRight,
  Package,
  Truck,
  CheckCircle,
  Clock,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Eye,
  AlertCircle,
  Printer,
} from "lucide-react";
import { useActiveBusinessId } from "@/hooks/useActiveBusinessId";
import { Spinner } from "@/components/ui/Spinner";

// ─── Types ────────────────────────────────────────────────────────────────────

type TransferStatus = "DRAFT" | "IN_TRANSIT" | "COMPLETED" | "CANCELLED";

interface TransferItem {
  itemId: string;
  itemName: string;
  sku?: string;
  quantity: number;
  unit: string;
  unitCost?: number;
}

interface StockTransfer {
  _id: string;
  transferNumber: string;
  fromWarehouse: string;
  toWarehouse: string;
  items: TransferItem[];
  status: TransferStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  transferredAt?: string;
  completedAt?: string;
}

interface InventoryItem {
  _id: string;
  name: string;
  sku?: string;
  quantity?: number;
  unit?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const WAREHOUSES = [
  "Main Warehouse",
  "Store 1",
  "Store 2",
  "Godown A",
  "Godown B",
  "Dispatch Hub",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function statusBadge(status: TransferStatus) {
  switch (status) {
    case "DRAFT":
      return (
        <span className="text-xs font-medium px-2 py-0.5 rounded-full text-ink-3 bg-surface">
          Draft
        </span>
      );
    case "IN_TRANSIT":
      return (
        <span className="text-xs font-medium px-2 py-0.5 rounded-full text-warning bg-warning-soft">
          In Transit
        </span>
      );
    case "COMPLETED":
      return (
        <span className="text-xs font-medium px-2 py-0.5 rounded-full text-success bg-success-soft">
          Completed
        </span>
      );
    case "CANCELLED":
      return (
        <span className="text-xs font-medium px-2 py-0.5 rounded-full text-danger bg-danger-soft">
          Cancelled
        </span>
      );
  }
}

// ─── Empty row for new transfer form ─────────────────────────────────────────

function emptyItemRow(): TransferItem {
  return { itemId: "", itemName: "", sku: "", quantity: 1, unit: "pcs" };
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function StockTransfersPage() {
  const { businessId } = useActiveBusinessId();

  // list state
  const [page, setPage] = useState(1);

  // filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | TransferStatus>("");

  // modals
  const [showNewModal, setShowNewModal] = useState(false);
  const [viewTransfer, setViewTransfer] = useState<StockTransfer | null>(null);

  // new transfer form
  const [fromWarehouse, setFromWarehouse] = useState("");
  const [toWarehouse, setToWarehouse] = useState("");
  const [formItems, setFormItems] = useState<TransferItem[]>([emptyItemRow()]);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // inventory for item search
  const [itemSearches, setItemSearches] = useState<string[]>([""]);

  // status update
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // ── Fetch transfers ──
  const transfersParams = businessId
    ? (() => {
        const params = new URLSearchParams({ businessId, page: String(page), limit: "20" });
        if (statusFilter) params.set("status", statusFilter);
        return params.toString();
      })()
    : null;
  const {
    data: transfersRes,
    isLoading: loading,
    error: transfersErrorObj,
    mutate: fetchTransfers,
  } = useSWR(
    transfersParams ? `/api/stock/transfers?${transfersParams}` : null,
    { keepPreviousData: true }
  );
  const transfers: StockTransfer[] = transfersRes?.success ? transfersRes.data ?? [] : [];
  const totalPages = transfersRes?.pagination?.pages ?? 1;
  const total = transfersRes?.pagination?.total ?? 0;
  const error = transfersErrorObj
    ? transfersErrorObj instanceof Error
      ? transfersErrorObj.message
      : "Unknown error"
    : transfersRes && !transfersRes.success
    ? transfersRes.error || "Failed to load"
    : null;

  // ── Fetch inventory items ──
  const { data: inventoryItemsRes } = useSWR(
    showNewModal && businessId ? `/api/inventory/items?businessId=${businessId}&limit=200` : null
  );
  const inventoryItems: InventoryItem[] = inventoryItemsRes?.success ? inventoryItemsRes.data ?? [] : [];

  // ── Stats derived from current page ──
  const draftCount = transfers.filter((t) => t.status === "DRAFT").length;
  const inTransitCount = transfers.filter(
    (t) => t.status === "IN_TRANSIT"
  ).length;
  const completedCount = transfers.filter(
    (t) => t.status === "COMPLETED"
  ).length;

  // ── Client-side search filter ──
  const filtered = transfers.filter((t) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      t.transferNumber.toLowerCase().includes(q) ||
      t.fromWarehouse.toLowerCase().includes(q) ||
      t.toWarehouse.toLowerCase().includes(q)
    );
  });

  // ── Reset form ──
  function resetForm() {
    setFromWarehouse("");
    setToWarehouse("");
    setFormItems([emptyItemRow()]);
    setItemSearches([""]);
    setNotes("");
    setFormError(null);
  }

  // ── Add item row ──
  function addItemRow() {
    setFormItems((prev) => [...prev, emptyItemRow()]);
    setItemSearches((prev) => [...prev, ""]);
  }

  // ── Remove item row ──
  function removeItemRow(idx: number) {
    setFormItems((prev) => prev.filter((_, i) => i !== idx));
    setItemSearches((prev) => prev.filter((_, i) => i !== idx));
  }

  // ── Select inventory item for a row ──
  function selectItemForRow(idx: number, inv: InventoryItem) {
    setFormItems((prev) =>
      prev.map((row, i) =>
        i === idx
          ? {
              ...row,
              itemId: inv._id,
              itemName: inv.name,
              sku: inv.sku ?? "",
              unit: inv.unit ?? "pcs",
            }
          : row
      )
    );
    setItemSearches((prev) => prev.map((s, i) => (i === idx ? "" : s)));
  }

  // ── Clear selected item for a row ──
  function clearItemRow(idx: number) {
    setFormItems((prev) =>
      prev.map((row, i) =>
        i === idx ? { ...row, itemId: "", itemName: "", sku: "" } : row
      )
    );
    setItemSearches((prev) => prev.map((s, i) => (i === idx ? "" : s)));
  }

  // ── Update quantity for a row ──
  function updateQty(idx: number, qty: number) {
    setFormItems((prev) =>
      prev.map((row, i) => (i === idx ? { ...row, quantity: qty } : row))
    );
  }

  // ── Submit new transfer ──
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!fromWarehouse) {
      setFormError("Please select a From Warehouse.");
      return;
    }
    if (!toWarehouse) {
      setFormError("Please select a To Warehouse.");
      return;
    }
    if (fromWarehouse === toWarehouse) {
      setFormError("From and To warehouses must be different.");
      return;
    }
    const validItems = formItems.filter((it) => it.itemId && it.quantity > 0);
    if (validItems.length === 0) {
      setFormError("Add at least one item with a valid quantity.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/stock/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId,
          fromWarehouse,
          toWarehouse,
          items: validItems.map((it) => ({
            itemId: it.itemId,
            itemName: it.itemName,
            sku: it.sku || undefined,
            quantity: it.quantity,
            unit: it.unit || "pcs",
          })),
          notes: notes || undefined,
          status: "DRAFT",
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to create");
      setShowNewModal(false);
      resetForm();
      fetchTransfers();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Update status ──
  async function updateStatus(id: string, status: TransferStatus) {
    setUpdatingId(id);
    try {
      const res = await fetch(`/api/stock/transfers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to update");
      // refresh list from server
      fetchTransfers();
      // update view modal if open
      if (viewTransfer?._id === id) {
        setViewTransfer((prev) =>
          prev ? { ...prev, status, ...json.data } : prev
        );
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Update failed");
    } finally {
      setUpdatingId(null);
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Stock Transfers</h1>
          <p className="text-sm text-ink-3 mt-0.5">
            Move inventory between warehouses and track transfer status
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchTransfers}
            className="px-3 py-2 text-xs text-ink-3 border border-border rounded-card hover:text-ink hover:border-border-strong flex items-center gap-1.5"
          >
            <RefreshCw size={12} />
            Refresh
          </button>
          <button
            onClick={() => {
              resetForm();
              setShowNewModal(true);
            }}
            className="flex items-center gap-2 px-4 py-2.5 bg-accent text-accent-fg rounded-card text-sm font-medium hover:bg-accent-hover"
          >
            <Plus size={16} />
            New Transfer
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={() => { setStatusFilter(""); setPage(1); }}
          className={`text-left rounded-card border bg-surface p-4 transition-colors ${
            statusFilter === "" ? "border-accent ring-2 ring-accent-soft" : "border-border hover:border-border-strong"
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <Package size={14} className="text-ink-3" />
            <span className="text-xs text-ink-3">Total Transfers</span>
          </div>
          <p className="text-2xl font-semibold text-ink">{total}</p>
        </button>
        <button
          type="button"
          onClick={() => { setStatusFilter((v) => (v === "DRAFT" ? "" : "DRAFT")); setPage(1); }}
          className={`text-left rounded-card border bg-surface p-4 transition-colors ${
            statusFilter === "DRAFT" ? "border-accent ring-2 ring-accent-soft" : "border-border hover:border-border-strong"
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <Clock size={14} className="text-ink-3" />
            <span className="text-xs text-ink-3">Draft / Pending</span>
          </div>
          <p className="text-2xl font-semibold text-ink-2">{draftCount}</p>
        </button>
        <button
          type="button"
          onClick={() => { setStatusFilter((v) => (v === "IN_TRANSIT" ? "" : "IN_TRANSIT")); setPage(1); }}
          className={`text-left rounded-card border bg-surface p-4 transition-colors ${
            statusFilter === "IN_TRANSIT" ? "border-accent ring-2 ring-accent-soft" : "border-border hover:border-border-strong"
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <Truck size={14} className="text-warning" />
            <span className="text-xs text-ink-3">In Transit</span>
          </div>
          <p className="text-2xl font-semibold text-warning">{inTransitCount}</p>
        </button>
        <button
          type="button"
          onClick={() => { setStatusFilter((v) => (v === "COMPLETED" ? "" : "COMPLETED")); setPage(1); }}
          className={`text-left rounded-card border bg-surface p-4 transition-colors ${
            statusFilter === "COMPLETED" ? "border-accent ring-2 ring-accent-soft" : "border-border hover:border-border-strong"
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle size={14} className="text-success" />
            <span className="text-xs text-ink-3">Completed</span>
          </div>
          <p className="text-2xl font-semibold text-success">{completedCount}</p>
        </button>
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
            placeholder="Search by transfer #, warehouse..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-surface border border-border rounded-control text-sm text-ink placeholder-ink-3 focus:outline-none focus:border-border-strong"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as "" | TransferStatus);
            setPage(1);
          }}
          className="px-3 py-2 bg-surface border border-border rounded-control text-sm text-ink-2 focus:outline-none"
        >
          <option value="">All Statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="IN_TRANSIT">In Transit</option>
          <option value="COMPLETED">Completed</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
        {(search || statusFilter) && (
          <button
            onClick={() => {
              setSearch("");
              setStatusFilter("");
              setPage(1);
            }}
            className="px-3 py-2 text-xs text-ink-3 border border-border rounded-card hover:text-ink hover:border-border-strong"
          >
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-card border border-border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-surface">
              <th className="px-4 py-3 text-left text-xs text-ink-3 font-medium">
                Transfer #
              </th>
              <th className="px-4 py-3 text-left text-xs text-ink-3 font-medium">
                From
              </th>
              <th className="px-4 py-3 text-left text-xs text-ink-3 font-medium">
                To
              </th>
              <th className="px-4 py-3 text-left text-xs text-ink-3 font-medium">
                Items
              </th>
              <th className="px-4 py-3 text-left text-xs text-ink-3 font-medium">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs text-ink-3 font-medium">
                Created
              </th>
              <th className="px-4 py-3 text-left text-xs text-ink-3 font-medium">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr>
                <td colSpan={7}>
                  <div className="p-12 text-center text-ink-3">Loading…</div>
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={7}>
                  <div className="p-12 text-center">
                    <AlertCircle size={32} className="mx-auto mb-3 text-danger" />
                    <p className="text-danger text-sm">{error}</p>
                    <button
                      onClick={fetchTransfers}
                      className="mt-3 px-3 py-2 text-xs text-ink-3 border border-border rounded-card hover:text-ink"
                    >
                      Retry
                    </button>
                  </div>
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <div className="p-12 text-center">
                    <Truck size={36} className="mx-auto mb-3 text-ink-2" />
                    <p className="text-ink-3 text-sm mb-1">
                      No stock transfers found
                    </p>
                    <p className="text-ink-2 text-xs mb-4">
                      Create a transfer to move inventory between warehouses
                    </p>
                    <button
                      onClick={() => {
                        resetForm();
                        setShowNewModal(true);
                      }}
                      className="inline-flex items-center gap-2 px-4 py-2.5 bg-accent text-accent-fg rounded-card text-sm font-medium hover:bg-accent-hover"
                    >
                      <Plus size={14} />
                      New Transfer
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((transfer) => (
                <tr
                  key={transfer._id}
                  className="hover:bg-surface-2 transition-colors"
                >
                  <td className="px-4 py-3">
                    <span className="text-sm text-ink font-mono">
                      {transfer.transferNumber}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-ink-2">
                      {transfer.fromWarehouse}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <ArrowRight size={12} className="text-ink-2 shrink-0" />
                      <span className="text-sm text-ink-2">
                        {transfer.toWarehouse}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-ink-3">
                      {transfer.items.length}{" "}
                      {transfer.items.length === 1 ? "item" : "items"}
                    </span>
                  </td>
                  <td className="px-4 py-3">{statusBadge(transfer.status)}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-ink-3">
                      {formatDate(transfer.createdAt)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setViewTransfer(transfer)}
                        className="px-2.5 py-1.5 text-xs text-ink-3 border border-border rounded-control hover:text-ink hover:border-border-strong flex items-center gap-1"
                      >
                        <Eye size={11} />
                        View
                      </button>
                      <Link
                        href={`/console/common/stock-transfers/${transfer._id}/print`}
                        target="_blank"
                        className="px-2.5 py-1.5 text-xs text-ink-3 border border-border rounded-control hover:text-ink hover:border-border-strong flex items-center gap-1"
                      >
                        <Printer size={11} />
                        Print
                      </Link>
                      {transfer.status === "DRAFT" && (
                        <button
                          disabled={updatingId === transfer._id}
                          onClick={() =>
                            updateStatus(transfer._id, "IN_TRANSIT")
                          }
                          className="px-2.5 py-1.5 text-xs text-warning border border-warning/20 rounded-control hover:bg-warning-soft disabled:opacity-50"
                        >
                          {updatingId === transfer._id ? (
                            <Spinner size={11} />
                          ) : (
                            "Dispatch"
                          )}
                        </button>
                      )}
                      {transfer.status === "IN_TRANSIT" && (
                        <button
                          disabled={updatingId === transfer._id}
                          onClick={() =>
                            updateStatus(transfer._id, "COMPLETED")
                          }
                          className="px-2.5 py-1.5 text-xs text-success border border-success/20 rounded-control hover:bg-success-soft disabled:opacity-50"
                        >
                          {updatingId === transfer._id ? (
                            <Spinner size={11} />
                          ) : (
                            "Complete"
                          )}
                        </button>
                      )}
                      {(transfer.status === "DRAFT" ||
                        transfer.status === "IN_TRANSIT") && (
                        <button
                          disabled={updatingId === transfer._id}
                          onClick={() =>
                            updateStatus(transfer._id, "CANCELLED")
                          }
                          className="px-2.5 py-1.5 text-xs text-danger border border-danger/20 rounded-control hover:bg-danger-soft disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
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
            Showing {filtered.length} of {total} transfers
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

      {/* ── New Transfer Modal ──────────────────────────────────────────────── */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-2xl bg-surface border border-border rounded-card overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="px-6 py-4 border-b border-border flex justify-between items-center shrink-0">
              <div>
                <h2 className="text-sm font-semibold text-ink">
                  New Stock Transfer
                </h2>
                <p className="text-xs text-ink-3 mt-0.5">
                  Create a transfer order to move stock between warehouses
                </p>
              </div>
              <button
                onClick={() => {
                  setShowNewModal(false);
                  resetForm();
                }}
                className="text-ink-3 hover:text-ink transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <form
              onSubmit={handleSubmit}
              className="flex flex-col overflow-hidden"
            >
              <div className="px-6 py-5 space-y-5 overflow-y-auto flex-1">
                {formError && (
                  <div className="flex items-start gap-2 px-3 py-2.5 rounded-control bg-danger-soft border border-danger/20">
                    <AlertCircle
                      size={14}
                      className="text-danger mt-0.5 shrink-0"
                    />
                    <p className="text-xs text-danger">{formError}</p>
                  </div>
                )}

                {/* Warehouses row */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-ink-3 block mb-1">
                      From Warehouse <span className="text-danger">*</span>
                    </label>
                    <select
                      value={fromWarehouse}
                      onChange={(e) => setFromWarehouse(e.target.value)}
                      className="w-full px-3 py-2 bg-surface border border-border rounded-control text-sm text-ink-2 focus:outline-none focus:border-border-strong"
                      required
                    >
                      <option value="">Select warehouse</option>
                      {WAREHOUSES.map((w) => (
                        <option key={w} value={w} disabled={w === toWarehouse}>
                          {w}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-ink-3 block mb-1">
                      To Warehouse <span className="text-danger">*</span>
                    </label>
                    <select
                      value={toWarehouse}
                      onChange={(e) => setToWarehouse(e.target.value)}
                      className="w-full px-3 py-2 bg-surface border border-border rounded-control text-sm text-ink-2 focus:outline-none focus:border-border-strong"
                      required
                    >
                      <option value="">Select warehouse</option>
                      {WAREHOUSES.map((w) => (
                        <option
                          key={w}
                          value={w}
                          disabled={w === fromWarehouse}
                        >
                          {w}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Items section */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs text-ink-3">
                      Items <span className="text-danger">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={addItemRow}
                      className="text-xs text-ink-3 hover:text-ink flex items-center gap-1"
                    >
                      <Plus size={11} /> Add Row
                    </button>
                  </div>

                  <div className="space-y-2">
                    {formItems.map((row, idx) => (
                      <div
                        key={idx}
                        className="rounded-control border border-border bg-surface p-3 space-y-2"
                      >
                        {/* Item selector */}
                        {row.itemId ? (
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm text-ink">{row.itemName}</p>
                              {row.sku && (
                                <p className="text-xs text-ink-3">
                                  SKU: {row.sku}
                                </p>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => clearItemRow(idx)}
                              className="text-ink-2 hover:text-ink-2"
                            >
                              <X size={13} />
                            </button>
                          </div>
                        ) : (
                          <div className="relative">
                            <Search
                              size={12}
                              className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"
                            />
                            <input
                              type="text"
                              placeholder="Search item by name or SKU..."
                              value={itemSearches[idx] ?? ""}
                              onChange={(e) =>
                                setItemSearches((prev) =>
                                  prev.map((s, i) =>
                                    i === idx ? e.target.value : s
                                  )
                                )
                              }
                              className="w-full pl-8 pr-3 py-1.5 bg-surface border border-border rounded-control text-sm text-ink placeholder-ink-3 focus:outline-none focus:border-border-strong"
                            />
                            {itemSearches[idx] && (
                              <div className="absolute z-10 w-full mt-1 max-h-36 overflow-y-auto rounded-control border border-border bg-surface shadow-xl">
                                {inventoryItems
                                  .filter(
                                    (it) =>
                                      it.name
                                        .toLowerCase()
                                        .includes(
                                          itemSearches[idx].toLowerCase()
                                        ) ||
                                      (it.sku ?? "")
                                        .toLowerCase()
                                        .includes(
                                          itemSearches[idx].toLowerCase()
                                        )
                                  )
                                  .slice(0, 10)
                                  .map((it) => (
                                    <button
                                      type="button"
                                      key={it._id}
                                      onClick={() => selectItemForRow(idx, it)}
                                      className="w-full text-left px-3 py-1.5 hover:bg-surface-2 transition-colors"
                                    >
                                      <p className="text-xs text-ink">
                                        {it.name}
                                      </p>
                                      {it.sku && (
                                        <p className="text-xs text-ink-2">
                                          {it.sku}
                                        </p>
                                      )}
                                    </button>
                                  ))}
                                {inventoryItems.filter(
                                  (it) =>
                                    it.name
                                      .toLowerCase()
                                      .includes(
                                        itemSearches[idx].toLowerCase()
                                      ) ||
                                    (it.sku ?? "")
                                      .toLowerCase()
                                      .includes(
                                        itemSearches[idx].toLowerCase()
                                      )
                                ).length === 0 && (
                                  <p className="px-3 py-2 text-xs text-ink-3">
                                    No items found
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Quantity + unit row */}
                        <div className="flex items-center gap-2">
                          <div className="flex-1">
                            <label className="text-xs text-ink-2 block mb-0.5">
                              Quantity
                            </label>
                            <input
                              type="number"
                              min="1"
                              step="any"
                              value={row.quantity}
                              onChange={(e) =>
                                updateQty(idx, Number(e.target.value))
                              }
                              onFocus={(e) => e.target.select()}
                              placeholder="Quantity"
                              className="w-full px-3 py-1.5 bg-surface border border-border rounded-control text-sm text-ink placeholder-ink-3 focus:outline-none focus:border-border-strong"
                            />
                          </div>
                          <div className="w-24">
                            <label className="text-xs text-ink-2 block mb-0.5">
                              Unit
                            </label>
                            <input
                              type="text"
                              value={row.unit}
                              onChange={(e) =>
                                setFormItems((prev) =>
                                  prev.map((r, i) =>
                                    i === idx
                                      ? { ...r, unit: e.target.value }
                                      : r
                                  )
                                )
                              }
                              placeholder="Unit"
                              className="w-full px-3 py-1.5 bg-surface border border-border rounded-control text-sm text-ink placeholder-ink-3 focus:outline-none focus:border-border-strong"
                            />
                          </div>
                          {formItems.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeItemRow(idx)}
                              className="mt-4 text-danger hover:opacity-80 shrink-0"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={addItemRow}
                    className="mt-2 w-full py-2 border border-dashed border-border rounded-control text-xs text-ink-2 hover:text-ink-3 hover:border-border-strong transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Plus size={12} /> Add Another Item
                  </button>
                </div>

                {/* Notes */}
                <div>
                  <label className="text-xs text-ink-3 block mb-1">
                    Notes (optional)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Any additional notes about this transfer..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full px-3 py-2 bg-surface border border-border rounded-control text-sm text-ink placeholder-ink-3 focus:outline-none focus:border-border-strong resize-none"
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-border flex justify-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setShowNewModal(false);
                    resetForm();
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
                      Creating…
                    </>
                  ) : (
                    <>
                      <Plus size={14} />
                      Create Transfer
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── View Transfer Modal ─────────────────────────────────────────────── */}
      {viewTransfer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-surface border border-border rounded-card overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="px-6 py-4 border-b border-border flex justify-between items-center shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-ink font-mono">
                    {viewTransfer.transferNumber}
                  </h2>
                  {statusBadge(viewTransfer.status)}
                </div>
                <p className="text-xs text-ink-3 mt-0.5">
                  Transfer details and items
                </p>
              </div>
              <button
                onClick={() => setViewTransfer(null)}
                className="text-ink-3 hover:text-ink transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-5 overflow-y-auto flex-1">
              {/* Route */}
              <div className="flex items-center gap-3 p-3 rounded-control bg-surface border border-border">
                <div className="flex-1 text-center">
                  <p className="text-xs text-ink-3 mb-0.5">From</p>
                  <p className="text-sm font-medium text-ink">
                    {viewTransfer.fromWarehouse}
                  </p>
                </div>
                <ArrowRight size={16} className="text-ink-2 shrink-0" />
                <div className="flex-1 text-center">
                  <p className="text-xs text-ink-3 mb-0.5">To</p>
                  <p className="text-sm font-medium text-ink">
                    {viewTransfer.toWarehouse}
                  </p>
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-ink-3 mb-0.5">Created</p>
                  <p className="text-sm text-ink-2">
                    {formatDate(viewTransfer.createdAt)}
                  </p>
                </div>
                {viewTransfer.transferredAt && (
                  <div>
                    <p className="text-xs text-ink-3 mb-0.5">Dispatched</p>
                    <p className="text-sm text-ink-2">
                      {formatDate(viewTransfer.transferredAt)}
                    </p>
                  </div>
                )}
                {viewTransfer.completedAt && (
                  <div>
                    <p className="text-xs text-ink-3 mb-0.5">Completed</p>
                    <p className="text-sm text-success">
                      {formatDate(viewTransfer.completedAt)}
                    </p>
                  </div>
                )}
              </div>

              {/* Items table */}
              <div>
                <p className="text-xs text-ink-3 mb-2">
                  Items ({viewTransfer.items.length})
                </p>
                <div className="rounded-control border border-border overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border bg-surface">
                        <th className="px-3 py-2 text-left text-xs text-ink-3 font-medium">
                          Item
                        </th>
                        <th className="px-3 py-2 text-right text-xs text-ink-3 font-medium">
                          Qty
                        </th>
                        <th className="px-3 py-2 text-right text-xs text-ink-3 font-medium">
                          Unit
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {viewTransfer.items.map((item, idx) => (
                        <tr key={idx} className="hover:bg-surface-2">
                          <td className="px-3 py-2.5">
                            <p className="text-sm text-ink">{item.itemName}</p>
                            {item.sku && (
                              <p className="text-xs text-ink-2">{item.sku}</p>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right text-sm text-ink-2">
                            {item.quantity}
                          </td>
                          <td className="px-3 py-2.5 text-right text-xs text-ink-3">
                            {item.unit}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Notes */}
              {viewTransfer.notes && (
                <div>
                  <p className="text-xs text-ink-3 mb-1">Notes</p>
                  <p className="text-sm text-ink-3 bg-surface rounded-control border border-border px-3 py-2">
                    {viewTransfer.notes}
                  </p>
                </div>
              )}
            </div>

            {/* Footer with status actions */}
            <div className="px-6 py-4 border-t border-border flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2">
                {viewTransfer.status === "DRAFT" && (
                  <>
                    <button
                      disabled={updatingId === viewTransfer._id}
                      onClick={() =>
                        updateStatus(viewTransfer._id, "IN_TRANSIT")
                      }
                      className="px-3 py-2 text-xs text-warning border border-warning/20 rounded-card hover:bg-warning-soft disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {updatingId === viewTransfer._id ? (
                        <Spinner size={12} />
                      ) : (
                        <Truck size={12} />
                      )}
                      Mark In Transit
                    </button>
                    <button
                      disabled={updatingId === viewTransfer._id}
                      onClick={() =>
                        updateStatus(viewTransfer._id, "CANCELLED")
                      }
                      className="px-3 py-2 text-xs text-danger border border-danger/20 rounded-card hover:bg-danger-soft disabled:opacity-50"
                    >
                      Cancel Transfer
                    </button>
                  </>
                )}
                {viewTransfer.status === "IN_TRANSIT" && (
                  <>
                    <button
                      disabled={updatingId === viewTransfer._id}
                      onClick={() =>
                        updateStatus(viewTransfer._id, "COMPLETED")
                      }
                      className="px-3 py-2 text-xs text-success border border-success/20 rounded-card hover:bg-success-soft disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {updatingId === viewTransfer._id ? (
                        <Spinner size={12} />
                      ) : (
                        <CheckCircle size={12} />
                      )}
                      Mark Completed
                    </button>
                    <button
                      disabled={updatingId === viewTransfer._id}
                      onClick={() =>
                        updateStatus(viewTransfer._id, "CANCELLED")
                      }
                      className="px-3 py-2 text-xs text-danger border border-danger/20 rounded-card hover:bg-danger-soft disabled:opacity-50"
                    >
                      Cancel Transfer
                    </button>
                  </>
                )}
              </div>
              <button
                onClick={() => setViewTransfer(null)}
                className="px-3 py-2 text-xs text-ink-3 border border-border rounded-card hover:text-ink hover:border-border-strong"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
