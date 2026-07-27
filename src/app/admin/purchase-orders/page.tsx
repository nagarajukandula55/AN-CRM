"use client";

/**
 * List page for /admin/purchase-orders -- this route was linked from the
 * sidebar but only had a "new" sub-page (PurchaseOrderForm), no list page
 * at the base route, so visiting "Purchase Orders" 404'd. This is the
 * materials/BOM-based purchase-order system (src/services/purchaseOrder.service.ts),
 * distinct from the simpler /admin/purchase page.
 */

import useSWR from "swr";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Plus, ShoppingCart, Printer } from "lucide-react";

interface PO {
  _id: string;
  poNumber: string;
  vendorId?: { companyName?: string } | string;
  warehouseId?: { warehouseName?: string } | string;
  status: string;
  totalAmount: number;
  expectedDate?: string;
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-500",
  APPROVED: "bg-emerald-500/10 text-emerald-700",
  REJECTED: "bg-red-500/10 text-red-700",
  REVISION_REQUIRED: "bg-amber-500/10 text-amber-700",
  CANCELLED: "bg-gray-200 text-gray-500",
  RECEIVED: "bg-cyan-500/10 text-cyan-700",
};

const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n || 0);

const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

export default function PurchaseOrdersListPage() {
  const router = useRouter();
  const { data: posRes, isLoading: loading, error: fetchErr } = useSWR("/api/purchase-orders");
  const pos: PO[] = posRes && posRes.success !== false ? posRes.data || [] : [];
  const error: string | null = fetchErr
    ? "Could not load purchase orders."
    : posRes && posRes.success === false
    ? posRes.message || "Failed to load purchase orders"
    : null;

  if (loading && pos.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-gray-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="px-6 py-10">
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => router.push("/admin")}
            className="w-9 h-9 rounded-xl border border-gray-200 bg-white flex items-center justify-center hover:bg-gray-100 transition"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-2xl font-semibold">Purchase Orders</h1>
            <p className="text-sm text-gray-400">Material procurement, BOM-based purchase orders</p>
          </div>
          <button
            onClick={() => router.push("/admin/purchase-orders/new")}
            className="ml-auto flex items-center gap-2 bg-gray-900 text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-gray-800 transition"
          >
            <Plus className="w-4 h-4" /> New Purchase Order
          </button>
        </div>

        {error && (
          <div className="mb-6 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</div>
        )}

        <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left px-6 py-3 text-gray-400 font-medium">PO #</th>
                <th className="text-left px-6 py-3 text-gray-400 font-medium">Vendor</th>
                <th className="text-left px-6 py-3 text-gray-400 font-medium">Warehouse</th>
                <th className="text-left px-6 py-3 text-gray-400 font-medium">Expected</th>
                <th className="text-right px-6 py-3 text-gray-400 font-medium">Amount</th>
                <th className="text-center px-6 py-3 text-gray-400 font-medium">Status</th>
                <th className="text-center px-6 py-3 text-gray-400 font-medium">Print</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pos.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-gray-400">
                    <ShoppingCart className="w-6 h-6 mx-auto mb-2 text-gray-300" />
                    No purchase orders found
                  </td>
                </tr>
              ) : (
                pos.map((po) => (
                  <tr key={po._id} className="hover:bg-gray-50 transition">
                    <td className="px-6 py-3 font-mono text-xs text-gray-500">{po.poNumber}</td>
                    <td className="px-6 py-3 text-gray-700">
                      {typeof po.vendorId === "object" ? po.vendorId?.companyName || "—" : "—"}
                    </td>
                    <td className="px-6 py-3 text-gray-500">
                      {typeof po.warehouseId === "object" ? po.warehouseId?.warehouseName || "—" : "—"}
                    </td>
                    <td className="px-6 py-3 text-gray-400">{fmtDate(po.expectedDate)}</td>
                    <td className="px-6 py-3 text-right text-gray-900">{fmt(po.totalAmount)}</td>
                    <td className="px-6 py-3 text-center">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[po.status] ?? "bg-gray-100 text-gray-500"}`}>
                        {po.status?.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-center">
                      <Link
                        href={`/admin/purchase-orders/${po._id}/print`}
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
      </div>
    </div>
  );
}
