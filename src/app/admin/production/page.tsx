"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import {
  Plus,
  Search,
  RefreshCw,
  Factory,
  Clock,
  CheckCircle2,
  ListTodo,
  X,
  Play,
  CheckCheck,
  XCircle,
  ChevronDown,
  Package,
  CalendarDays,
  Printer,
} from "lucide-react";
import { useActiveBusinessId } from "@/hooks/useActiveBusinessId";

// ─── Types ────────────────────────────────────────────────────────────────────

type OrderStatus = "DRAFT" | "PLANNED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
type Priority = "LOW" | "NORMAL" | "HIGH" | "URGENT";

interface ProductionOrder {
  _id: string;
  orderNumber: string;
  productName: string;
  productSku?: string;
  plannedQuantity: number;
  producedQuantity: number;
  unit: string;
  status: OrderStatus;
  priority: Priority;
  plannedStartDate?: string;
  plannedEndDate?: string;
  actualStartDate?: string;
  actualEndDate?: string;
  bomId?: string;
  notes?: string;
  createdAt: string;
}

interface Stats {
  total: number;
  inProgress: number;
  completedThisMonth: number;
  planned: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d?: string) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function StatusBadge({ status }: { status: OrderStatus }) {
  const map: Record<OrderStatus, string> = {
    DRAFT: "text-gray-500 bg-gray-100",
    PLANNED: "text-blue-400 bg-blue-500/10",
    IN_PROGRESS: "text-amber-400 bg-amber-500/10",
    COMPLETED: "text-emerald-400 bg-emerald-500/10",
    CANCELLED: "text-red-400 bg-red-500/10",
  };
  const label: Record<OrderStatus, string> = {
    DRAFT: "Draft",
    PLANNED: "Planned",
    IN_PROGRESS: "In Progress",
    COMPLETED: "Completed",
    CANCELLED: "Cancelled",
  };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${map[status]}`}>
      {label[status]}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: Priority }) {
  const map: Record<Priority, string> = {
    LOW: "text-gray-500 bg-gray-100",
    NORMAL: "text-blue-400 bg-blue-500/10",
    HIGH: "text-amber-400 bg-amber-500/10",
    URGENT: "text-red-400 bg-red-500/10",
  };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${map[priority]}`}>
      {priority}
    </span>
  );
}

// ─── New Order Modal ──────────────────────────────────────────────────────────

interface NewOrderModalProps {
  onClose: () => void;
  onCreated: () => void;
  businessId: string;
}

function NewOrderModal({ onClose, onCreated, businessId }: NewOrderModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    productName: "",
    productSku: "",
    plannedQuantity: "",
    unit: "pcs",
    priority: "NORMAL" as Priority,
    status: "PLANNED" as OrderStatus,
    plannedStartDate: "",
    plannedEndDate: "",
    bomId: "",
    notes: "",
  });

  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.productName || !form.plannedQuantity) {
      setError("Product name and planned quantity are required.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/production/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          plannedQuantity: Number(form.plannedQuantity),
          businessId,
          bomId: form.bomId || undefined,
          plannedStartDate: form.plannedStartDate || undefined,
          plannedEndDate: form.plannedEndDate || undefined,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed to create order");
      onCreated();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-white border border-gray-200 rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">New Production Order</h2>
            <p className="text-xs text-gray-500 mt-0.5">Schedule a new manufacturing run</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-900 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && (
            <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs text-gray-500 block mb-1">Output Product *</label>
              <input
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-gray-400"
                placeholder="e.g. Steel Bracket Type A"
                value={form.productName}
                onChange={(e) => set("productName", e.target.value)}
                required
              />
            </div>

            <div>
              <label className="text-xs text-gray-500 block mb-1">SKU / Code</label>
              <input
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-gray-400"
                placeholder="SKU-001"
                value={form.productSku}
                onChange={(e) => set("productSku", e.target.value)}
              />
            </div>

            <div>
              <label className="text-xs text-gray-500 block mb-1">Planned Quantity *</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="1"
                  className="flex-1 px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-gray-400"
                  placeholder="100"
                  value={form.plannedQuantity}
                  onChange={(e) => set("plannedQuantity", e.target.value)}
                  onFocus={(e) => e.target.select()}
                  required
                />
                <select
                  className="w-20 px-2 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none"
                  title="Unit of measure"
                  value={form.unit}
                  onChange={(e) => set("unit", e.target.value)}
                >
                  {["pcs", "kg", "ltr", "mtr", "box", "set"].map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-500 block mb-1">Priority</label>
              <select
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none"
                title="Order priority"
                value={form.priority}
                onChange={(e) => set("priority", e.target.value as Priority)}
              >
                <option value="LOW">Low</option>
                <option value="NORMAL">Normal</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-gray-500 block mb-1">Initial Status</label>
              <select
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none"
                title="Initial status"
                value={form.status}
                onChange={(e) => set("status", e.target.value as OrderStatus)}
              >
                <option value="PLANNED">Planned</option>
                <option value="DRAFT">Draft</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-gray-500 block mb-1">Start Date</label>
              <input
                type="date"
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-gray-400"
                value={form.plannedStartDate}
                onChange={(e) => set("plannedStartDate", e.target.value)}
              />
            </div>

            <div>
              <label className="text-xs text-gray-500 block mb-1">End Date</label>
              <input
                type="date"
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-gray-400"
                value={form.plannedEndDate}
                onChange={(e) => set("plannedEndDate", e.target.value)}
              />
            </div>

            <div className="col-span-2">
              <label className="text-xs text-gray-500 block mb-1">BOM ID (optional)</label>
              <input
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-gray-400"
                placeholder="Link existing Bill of Materials ID"
                value={form.bomId}
                onChange={(e) => set("bomId", e.target.value)}
              />
            </div>

            <div className="col-span-2">
              <label className="text-xs text-gray-500 block mb-1">Notes</label>
              <textarea
                rows={3}
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-gray-400 resize-none"
                placeholder="Additional instructions or notes..."
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
              />
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-3 py-2 text-xs text-gray-500 border border-gray-200 rounded-xl hover:text-gray-900 hover:border-gray-400"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit as any}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
          >
            {loading ? (
              <RefreshCw size={14} className="animate-spin" />
            ) : (
              <Plus size={14} />
            )}
            Create Order
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Complete Modal ───────────────────────────────────────────────────────────

interface CompleteModalProps {
  order: ProductionOrder;
  onClose: () => void;
  onDone: () => void;
}

function CompleteModal({ order, onClose, onDone }: CompleteModalProps) {
  const [producedQty, setProducedQty] = useState(String(order.plannedQuantity));
  const [rejectedQty, setRejectedQty] = useState("0");
  const [qualityChecked, setQualityChecked] = useState(false);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleComplete() {
    if (!producedQty || Number(producedQty) < 0) {
      setError("Enter a valid produced quantity.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/production/orders/${order._id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          producedQuantity: Number(producedQty),
          rejectedQuantity: Number(rejectedQty),
          qualityChecked,
          notes,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed to complete order");
      onDone();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Complete Production Order</h2>
            <p className="text-xs text-gray-500 mt-0.5">{order.orderNumber} — {order.productName}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-900">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {error && (
            <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Produced Qty ({order.unit})</label>
              <input
                type="number"
                min="0"
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-gray-400"
                placeholder="Produced quantity"
                value={producedQty}
                onChange={(e) => setProducedQty(e.target.value)}
                onFocus={(e) => e.target.select()}
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Rejected Qty ({order.unit})</label>
              <input
                type="number"
                min="0"
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-gray-400"
                placeholder="Rejected quantity"
                value={rejectedQty}
                onChange={(e) => setRejectedQty(e.target.value)}
                onFocus={(e) => e.target.select()}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="qc"
              checked={qualityChecked}
              onChange={(e) => setQualityChecked(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="qc" className="text-xs text-gray-500 cursor-pointer">
              Quality check completed
            </label>
          </div>

          <div>
            <label className="text-xs text-gray-500 block mb-1">Completion Notes</label>
            <textarea
              rows={2}
              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-gray-400 resize-none"
              placeholder="Any remarks about this production run..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/20 px-3 py-2 text-xs text-emerald-400">
            Planned: {order.plannedQuantity} {order.unit}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-3 py-2 text-xs text-gray-500 border border-gray-200 rounded-xl hover:text-gray-900 hover:border-gray-400"
          >
            Cancel
          </button>
          <button
            onClick={handleComplete}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
          >
            {loading ? <RefreshCw size={14} className="animate-spin" /> : <CheckCheck size={14} />}
            Mark Complete
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type Tab = "all" | "in_progress" | "completed";

export default function ProductionOrdersPage() {
  const { businessId } = useActiveBusinessId();

  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [showNewModal, setShowNewModal] = useState(false);
  const [completeOrder, setCompleteOrder] = useState<ProductionOrder | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const { data: rawData, isLoading: loading, mutate: fetchOrders } = useSWR(
    businessId ? `/api/production/orders?businessId=${businessId}` : null,
    { keepPreviousData: true }
  );

  const orders: ProductionOrder[] = (rawData?.success ? rawData.data : []) || [];
  const stats: Stats = rawData?.success && rawData.summary
    ? {
        total: (rawData.summary.draftCount || 0) + (rawData.summary.plannedCount || 0) + (rawData.summary.inProgressCount || 0) + (rawData.summary.completedCount || 0),
        inProgress: rawData.summary.inProgressCount || 0,
        completedThisMonth: rawData.summary.completedCount || 0,
        planned: rawData.summary.plannedCount || 0,
      }
    : { total: 0, inProgress: 0, completedThisMonth: 0, planned: 0 };

  async function handleStart(order: ProductionOrder) {
    setActionLoading(order._id);
    try {
      const res = await fetch(`/api/production/orders/${order._id}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.success) fetchOrders();
    } finally {
      setActionLoading(null);
    }
  }

  async function handleCancel(order: ProductionOrder) {
    if (!confirm(`Cancel order ${order.orderNumber}?`)) return;
    setActionLoading(order._id + "_cancel");
    try {
      const res = await fetch(`/api/production/orders/${order._id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) fetchOrders();
    } finally {
      setActionLoading(null);
    }
  }

  // Filter orders
  const filtered = orders.filter((o) => {
    const matchesSearch =
      !search ||
      o.productName.toLowerCase().includes(search.toLowerCase()) ||
      o.orderNumber.toLowerCase().includes(search.toLowerCase()) ||
      (o.productSku || "").toLowerCase().includes(search.toLowerCase());

    const matchesTab =
      tab === "all" ||
      (tab === "in_progress" && o.status === "IN_PROGRESS") ||
      (tab === "completed" && o.status === "COMPLETED");

    return matchesSearch && matchesTab;
  });

  const statCards: { label: string; value: number; icon: typeof Factory; color: string; bg: string; tab: Tab | null }[] = [
    {
      label: "Total Orders",
      value: stats.total,
      icon: Factory,
      color: "text-blue-400",
      bg: "bg-blue-500/10",
      tab: "all",
    },
    {
      label: "In Progress",
      value: stats.inProgress,
      icon: Clock,
      color: "text-amber-400",
      bg: "bg-amber-500/10",
      tab: "in_progress",
    },
    {
      label: "Completed This Month",
      value: stats.completedThisMonth,
      icon: CheckCircle2,
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
      tab: "completed",
    },
    {
      label: "Pending / Planned",
      value: stats.planned,
      icon: ListTodo,
      color: "text-gray-500",
      bg: "bg-white",
      tab: null,
    },
  ];

  const tabs: { key: Tab; label: string }[] = [
    { key: "all", label: "All Orders" },
    { key: "in_progress", label: "In Progress" },
    { key: "completed", label: "Completed" },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Production Orders</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Manage and track manufacturing production runs
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchOrders}
            className="px-3 py-2 text-xs text-gray-500 border border-gray-200 rounded-xl hover:text-gray-900 hover:border-gray-400"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            onClick={() => setShowNewModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-800"
          >
            <Plus size={16} />
            New Order
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {statCards.map((s) => {
          const isActive = s.tab !== null && tab === s.tab;
          return (
            <button
              key={s.label}
              type="button"
              disabled={s.tab === null}
              onClick={() => s.tab && setTab(s.tab)}
              className={`text-left rounded-xl border bg-white p-4 transition-colors ${
                s.tab === null ? "cursor-default" : ""
              } ${
                isActive
                  ? "border-gray-900 ring-2 ring-gray-900"
                  : "border-gray-200 hover:border-gray-400"
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-gray-500">{s.label}</span>
                <div className={`p-1.5 rounded-lg ${s.bg}`}>
                  <s.icon size={14} className={s.color} />
                </div>
              </div>
              <p className="text-2xl font-semibold text-gray-900">{s.value}</p>
            </button>
          );
        })}
      </div>

      {/* Tabs + Search */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-white border border-gray-200 rounded-xl">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                tab === t.key
                  ? "bg-gray-900 text-white font-medium"
                  : "text-gray-500 hover:text-gray-900"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
          />
          <input
            className="w-full px-3 py-2 pl-9 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-gray-400"
            placeholder="Search orders..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-white">
            <tr>
              {[
                "Order #",
                "Product / Output",
                "Planned Qty",
                "Priority",
                "Status",
                "Start Date",
                "End Date",
                "Actions",
              ].map((h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left text-xs text-gray-500 font-medium"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-gray-500 text-sm">
                  Loading...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <div className="flex flex-col items-center justify-center py-16 gap-3">
                    <div className="p-4 rounded-2xl bg-white border border-gray-200">
                      <Factory size={28} className="text-gray-600" />
                    </div>
                    <p className="text-sm text-gray-500">No production orders found</p>
                    <button
                      onClick={() => setShowNewModal(true)}
                      className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-800"
                    >
                      <Plus size={14} />
                      Create First Order
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((order) => (
                <tr
                  key={order._id}
                  className="hover:bg-gray-50 transition-colors"
                >
                  {/* Order # */}
                  <td className="px-4 py-3">
                    <span className="text-xs font-mono text-blue-400">
                      {order.orderNumber}
                    </span>
                  </td>

                  {/* Product */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-white">
                        <Package size={12} className="text-gray-500" />
                      </div>
                      <div>
                        <p className="text-sm text-gray-900 leading-tight">
                          {order.productName}
                        </p>
                        {order.productSku && (
                          <p className="text-xs text-gray-500">{order.productSku}</p>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Qty */}
                  <td className="px-4 py-3">
                    <div>
                      <span className="text-sm text-gray-900 font-medium">
                        {order.plannedQuantity}
                      </span>
                      <span className="text-xs text-gray-500 ml-1">{order.unit}</span>
                      {order.producedQuantity > 0 && (
                        <p className="text-xs text-emerald-400">
                          {order.producedQuantity} produced
                        </p>
                      )}
                    </div>
                  </td>

                  {/* Priority */}
                  <td className="px-4 py-3">
                    <PriorityBadge priority={order.priority} />
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3">
                    <StatusBadge status={order.status} />
                  </td>

                  {/* Start Date */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      {order.plannedStartDate && (
                        <CalendarDays size={11} className="text-gray-600" />
                      )}
                      {fmtDate(order.actualStartDate || order.plannedStartDate)}
                    </div>
                  </td>

                  {/* End Date */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      {order.plannedEndDate && (
                        <CalendarDays size={11} className="text-gray-600" />
                      )}
                      {fmtDate(order.actualEndDate || order.plannedEndDate)}
                    </div>
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {(order.status === "PLANNED" || order.status === "DRAFT") && (
                        <button
                          onClick={() => handleStart(order)}
                          disabled={actionLoading === order._id}
                          title="Start production"
                          className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-amber-400 border border-amber-500/20 rounded-lg hover:bg-amber-500/10 disabled:opacity-50 transition-colors"
                        >
                          {actionLoading === order._id ? (
                            <RefreshCw size={11} className="animate-spin" />
                          ) : (
                            <Play size={11} />
                          )}
                          Start
                        </button>
                      )}

                      {order.status === "IN_PROGRESS" && (
                        <button
                          onClick={() => setCompleteOrder(order)}
                          title="Mark as complete"
                          className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-emerald-400 border border-emerald-500/20 rounded-lg hover:bg-emerald-500/10 transition-colors"
                        >
                          <CheckCheck size={11} />
                          Complete
                        </button>
                      )}

                      {(order.status === "PLANNED" ||
                        order.status === "DRAFT") && (
                        <button
                          onClick={() => handleCancel(order)}
                          disabled={actionLoading === order._id + "_cancel"}
                          title="Cancel order"
                          className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-red-400 border border-red-500/20 rounded-lg hover:bg-red-500/10 disabled:opacity-50 transition-colors"
                        >
                          {actionLoading === order._id + "_cancel" ? (
                            <RefreshCw size={11} className="animate-spin" />
                          ) : (
                            <XCircle size={11} />
                          )}
                          Cancel
                        </button>
                      )}

                      {(order.status === "COMPLETED" ||
                        order.status === "CANCELLED") && (
                        <span className="text-xs text-gray-600 italic">—</span>
                      )}

                      <Link
                        href={`/admin/production/${order._id}/print`}
                        target="_blank"
                        title="Print"
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg hover:text-gray-900 hover:border-gray-400 transition-colors"
                      >
                        <Printer size={11} />
                        Print
                      </Link>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Table footer */}
        {filtered.length > 0 && (
          <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
            <p className="text-xs text-gray-600">
              Showing {filtered.length} of {orders.length} orders
            </p>
          </div>
        )}
      </div>

      {/* Modals */}
      {showNewModal && businessId && (
        <NewOrderModal
          businessId={businessId}
          onClose={() => setShowNewModal(false)}
          onCreated={() => {
            setShowNewModal(false);
            fetchOrders();
          }}
        />
      )}

      {completeOrder && (
        <CompleteModal
          order={completeOrder}
          onClose={() => setCompleteOrder(null)}
          onDone={() => {
            setCompleteOrder(null);
            fetchOrders();
          }}
        />
      )}
    </div>
  );
}
