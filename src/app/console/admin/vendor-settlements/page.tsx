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
  TRANSFERRED: "bg-success-soft text-success border border-success",
  PENDING: "bg-warning-soft text-warning border border-warning",
  FAILED: "bg-danger-soft text-danger border border-danger",
  ON_HOLD: "bg-surface-2 text-ink-2 border border-border",
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
        <h1 className="text-xl font-semibold text-ink">Vendor Settlements</h1>
        <p className="text-sm text-ink-3 mt-0.5">
          Razorpay Route payouts to vendors — what&apos;s owed, transferred, and outstanding.
        </p>
      </div>

      {error && (
        <div className="px-3 py-2.5 bg-danger-soft border border-danger rounded-control text-xs text-danger">{error}</div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Gross (all vendors)", value: totals.gross, accent: "bg-info-soft text-info" },
          { label: "Platform Commission", value: totals.commission, accent: "bg-accent-soft text-accent" },
          { label: "Net Paid Out", value: totals.net - totals.outstanding, accent: "bg-success-soft text-success" },
          { label: "Outstanding", value: totals.outstanding, accent: "bg-warning-soft text-warning" },
        ].map((s) => (
          <div key={s.label} className="rounded-card border border-border bg-surface p-4">
            <div className={`inline-flex p-2 rounded-control mb-2 ${s.accent}`}>
              <IndianRupee size={14} />
            </div>
            <p className="text-xs text-ink-3">{s.label}</p>
            <p className="text-lg font-semibold text-ink mt-0.5">{inr(s.value)}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-3 py-2 bg-surface border border-border rounded-control text-sm text-ink focus:outline-none focus:border-border-strong"
        >
          <option value="all">All Statuses</option>
          <option value="TRANSFERRED">Transferred</option>
          <option value="PENDING">Pending</option>
          <option value="FAILED">Failed</option>
          <option value="ON_HOLD">On Hold</option>
        </select>
        <button
          onClick={fetchSettlements}
          className="px-3 py-2 text-xs text-ink-3 border border-border rounded-card hover:text-ink hover:border-border-strong flex items-center gap-1.5"
        >
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      <div className="rounded-card border border-border bg-surface overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-2">
              <th className="text-left px-4 py-3 text-xs text-ink-3 font-medium">Order</th>
              <th className="text-left px-4 py-3 text-xs text-ink-3 font-medium">Vendor</th>
              <th className="text-left px-4 py-3 text-xs text-ink-3 font-medium">Gross</th>
              <th className="text-left px-4 py-3 text-xs text-ink-3 font-medium">Commission</th>
              <th className="text-left px-4 py-3 text-xs text-ink-3 font-medium">Net Payout</th>
              <th className="text-left px-4 py-3 text-xs text-ink-3 font-medium">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-ink-3">Loading…</td></tr>
            ) : settlements.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-ink-3">No settlements yet.</td></tr>
            ) : (
              settlements.map((s) => {
                const Icon = STATUS_ICON[s.status] || Clock;
                return (
                  <tr key={s._id} className="hover:bg-surface-2">
                    <td className="px-4 py-3 font-mono text-xs text-ink-2">{s.orderId}</td>
                    <td className="px-4 py-3 text-ink font-medium">{vendorLabel(s.vendorId)}</td>
                    <td className="px-4 py-3 text-ink-2">{inr(s.grossAmount)}</td>
                    <td className="px-4 py-3 text-ink-3">
                      {inr(s.platformCommissionAmount)} ({s.platformCommissionPercent}%)
                    </td>
                    <td className="px-4 py-3 text-ink font-medium">{inr(s.netPayoutAmount)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[s.status]}`}>
                        <Icon size={11} /> {s.status}
                      </span>
                      {s.failureReason && <p className="text-[10px] text-danger mt-1 max-w-xs">{s.failureReason}</p>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {(s.status === "PENDING" || s.status === "FAILED") && (
                        <button
                          onClick={() => retry(s._id)}
                          disabled={retryingId === s._id}
                          className="px-3 py-1.5 text-xs text-ink-2 border border-border rounded-control hover:bg-surface-2 disabled:opacity-50"
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
