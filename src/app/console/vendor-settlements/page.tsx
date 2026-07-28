"use client";

/**
 * Vendor Settlements — admin visibility into Razorpay Route vendor
 * payouts: what each vendor is owed per order, what's been transferred,
 * and what's pending/failed and needs a retry. This is the accounting
 * side of the Razorpay Route integration (see core/payouts/*, models/
 * VendorSettlement.ts, VendorPayoutAccount.ts) — actual money movement
 * happens automatically at payment-capture time; this page is where an
 * admin reviews and, if needed, retries what didn't go through
 * automatically (e.g. a vendor's payout account wasn't activated yet).
 */

import { useState } from "react";
import useSWR from "swr";
import { IndianRupee, RefreshCw, AlertCircle, CheckCircle2, Clock, XCircle } from "lucide-react";

interface Settlement {
  _id: string;
  orderId: string;
  vendorId: { _id: string; companyName?: string; vendorId?: string } | string;
  grossAmount: number;
  platformCommissionPercent: number;
  platformCommissionAmount: number;
  netPayoutAmount: number;
  razorpayTransferId?: string;
  status: "PENDING" | "TRANSFERRED" | "FAILED" | "ON_HOLD";
  failureReason?: string;
  transferredAt?: string;
  createdAt: string;
}

const STATUS_STYLES: Record<string, string> = {
  TRANSFERRED: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  PENDING: "bg-amber-50 text-amber-700 border border-amber-200",
  FAILED: "bg-red-50 text-red-700 border border-red-200",
  ON_HOLD: "bg-gray-100 text-gray-600 border border-gray-200",
};

const STATUS_ICON: Record<string, typeof CheckCircle2> = {
  TRANSFERRED: CheckCircle2,
  PENDING: Clock,
  FAILED: XCircle,
  ON_HOLD: AlertCircle,
};

const inr = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

function vendorLabel(v: Settlement["vendorId"]): string {
  if (!v) return "—";
  if (typeof v === "string") return v;
  return v.companyName || v.vendorId || v._id;
}

export default function VendorSettlementsPage() {
  const [filterStatus, setFilterStatus] = useState("all");
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: meData } = useSWR("/api/auth/me");
  const businessId: string | null = meData?.user?.activeBusinessId || meData?.businesses?.[0]?._id || null;

  const settlementsParams = businessId
    ? (() => {
        const params = new URLSearchParams({ businessId });
        if (filterStatus !== "all") params.set("status", filterStatus);
        return params.toString();
      })()
    : null;
  const { data: settlementsRes, isLoading: loading, mutate: fetchSettlements } = useSWR(
    settlementsParams ? `/api/admin/vendor-settlements?${settlementsParams}` : null,
    { keepPreviousData: true }
  );
  const settlements: Settlement[] = settlementsRes?.success ? settlementsRes.settlements || [] : [];
  const totals = settlementsRes?.success
    ? settlementsRes.totals || { gross: 0, commission: 0, net: 0, outstanding: 0 }
    : { gross: 0, commission: 0, net: 0, outstanding: 0 };

  async function retry(id: string) {
    setRetryingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/vendor-settlements/${id}/retry`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Retry failed");
      fetchSettlements();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Retry failed");
    } finally {
      setRetryingId(null);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Vendor Settlements</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Razorpay Route payouts to vendors — what&apos;s owed, transferred, and outstanding.
        </p>
      </div>

      {error && (
        <div className="px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">{error}</div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Gross (all vendors)", value: totals.gross, accent: "bg-blue-50 text-blue-600" },
          { label: "Platform Commission", value: totals.commission, accent: "bg-purple-50 text-purple-600" },
          { label: "Net Paid Out", value: totals.net - totals.outstanding, accent: "bg-emerald-50 text-emerald-600" },
          { label: "Outstanding", value: totals.outstanding, accent: "bg-amber-50 text-amber-600" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-gray-200 bg-white p-4">
            <div className={`inline-flex p-2 rounded-lg mb-2 ${s.accent}`}>
              <IndianRupee size={14} />
            </div>
            <p className="text-xs text-gray-500">{s.label}</p>
            <p className="text-lg font-semibold text-gray-900 mt-0.5">{inr(s.value)}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-gray-400"
        >
          <option value="all">All Statuses</option>
          <option value="TRANSFERRED">Transferred</option>
          <option value="PENDING">Pending</option>
          <option value="FAILED">Failed</option>
          <option value="ON_HOLD">On Hold</option>
        </select>
        <button
          onClick={fetchSettlements}
          className="px-3 py-2 text-xs text-gray-500 border border-gray-200 rounded-xl hover:text-gray-900 hover:border-gray-400 flex items-center gap-1.5"
        >
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Order</th>
              <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Vendor</th>
              <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Gross</th>
              <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Commission</th>
              <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Net Payout</th>
              <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-500">Loading…</td></tr>
            ) : settlements.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-500">No settlements yet.</td></tr>
            ) : (
              settlements.map((s) => {
                const Icon = STATUS_ICON[s.status] || Clock;
                return (
                  <tr key={s._id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-700">{s.orderId}</td>
                    <td className="px-4 py-3 text-gray-900 font-medium">{vendorLabel(s.vendorId)}</td>
                    <td className="px-4 py-3 text-gray-700">{inr(s.grossAmount)}</td>
                    <td className="px-4 py-3 text-gray-500">
                      {inr(s.platformCommissionAmount)} ({s.platformCommissionPercent}%)
                    </td>
                    <td className="px-4 py-3 text-gray-900 font-medium">{inr(s.netPayoutAmount)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[s.status]}`}>
                        <Icon size={11} /> {s.status}
                      </span>
                      {s.failureReason && <p className="text-[10px] text-red-500 mt-1 max-w-xs">{s.failureReason}</p>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {(s.status === "PENDING" || s.status === "FAILED") && (
                        <button
                          onClick={() => retry(s._id)}
                          disabled={retryingId === s._id}
                          className="px-3 py-1.5 text-xs text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-100 disabled:opacity-50"
                        >
                          {retryingId === s._id ? "Retrying…" : "Retry"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
