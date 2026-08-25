"use client";

import useSWR from "swr";
import Link from "next/link";

interface VendorRow {
  vendorId: string;
  vendorCode: string;
  companyName: string;
  businessName: string;
  status: "NOT_SET" | "UNPAID" | "ACTIVE" | "EXPIRED";
  amount: number;
  validityDays: number | null;
  currentPeriodEnd: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  NOT_SET: "bg-surface-2 text-ink-3",
  UNPAID: "bg-warning-soft text-warning",
  ACTIVE: "bg-success-soft text-success",
  EXPIRED: "bg-danger-soft text-danger",
};

export default function VendorBillingListPage() {
  const { data: vendorsRes, isLoading: loading } = useSWR("/api/admin/vendor-billing");
  const vendors: VendorRow[] = vendorsRes?.success ? vendorsRes.vendors : [];

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-ink">Vendor Billing</h1>
        <p className="text-sm text-ink-3 mt-1">
          Access pricing and plan validity for every vendor, across every business.
        </p>
      </div>

      <div className="rounded-card border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-ink-3 border-b border-border">
              <th className="p-3">Vendor</th>
              <th className="p-3">Business</th>
              <th className="p-3">Status</th>
              <th className="p-3">Amount / cycle</th>
              <th className="p-3">Validity</th>
              <th className="p-3">Paid through</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="p-4 text-ink-3" colSpan={7}>Loading…</td></tr>
            ) : vendors.length === 0 ? (
              <tr><td className="p-4 text-ink-3" colSpan={7}>No vendors.</td></tr>
            ) : (
              vendors.map((v) => (
                <tr key={v.vendorId} className="border-b border-border">
                  <td className="p-3">
                    <p className="text-ink font-medium">{v.companyName}</p>
                    <p className="text-xs text-ink-3 font-mono">{v.vendorCode}</p>
                  </td>
                  <td className="p-3 text-ink-3">{v.businessName || "—"}</td>
                  <td className="p-3">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${STATUS_COLORS[v.status]}`}>{v.status}</span>
                  </td>
                  <td className="p-3 text-ink-2">{v.amount ? `₹${v.amount.toLocaleString("en-IN")}` : "—"}</td>
                  <td className="p-3 text-ink-3">{v.validityDays ? `${v.validityDays} days` : "—"}</td>
                  <td className="p-3 text-ink-3">
                    {v.currentPeriodEnd ? new Date(v.currentPeriodEnd).toLocaleDateString() : "—"}
                  </td>
                  <td className="p-3">
                    <Link href={`/console/admin/vendor-billing/${v.vendorId}`} className="text-accent text-xs font-medium">
                      Manage plan →
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
