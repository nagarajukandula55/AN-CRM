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
  NOT_SET: "bg-gray-100 text-gray-500",
  UNPAID: "bg-amber-100 text-amber-700",
  ACTIVE: "bg-emerald-100 text-emerald-700",
  EXPIRED: "bg-red-100 text-red-700",
};

export default function VendorBillingListPage() {
  const { data: vendorsRes, isLoading: loading } = useSWR("/api/admin/vendor-billing");
  const vendors: VendorRow[] = vendorsRes?.success ? vendorsRes.vendors : [];

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Vendor Billing</h1>
        <p className="text-sm text-gray-500 mt-1">
          Access pricing and plan validity for every vendor, across every business.
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-100">
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
              <tr><td className="p-4 text-gray-400" colSpan={7}>Loading…</td></tr>
            ) : vendors.length === 0 ? (
              <tr><td className="p-4 text-gray-400" colSpan={7}>No vendors.</td></tr>
            ) : (
              vendors.map((v) => (
                <tr key={v.vendorId} className="border-b border-gray-50">
                  <td className="p-3">
                    <p className="text-gray-900 font-medium">{v.companyName}</p>
                    <p className="text-xs text-gray-400 font-mono">{v.vendorCode}</p>
                  </td>
                  <td className="p-3 text-gray-500">{v.businessName || "—"}</td>
                  <td className="p-3">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${STATUS_COLORS[v.status]}`}>{v.status}</span>
                  </td>
                  <td className="p-3 text-gray-700">{v.amount ? `₹${v.amount.toLocaleString("en-IN")}` : "—"}</td>
                  <td className="p-3 text-gray-500">{v.validityDays ? `${v.validityDays} days` : "—"}</td>
                  <td className="p-3 text-gray-500">
                    {v.currentPeriodEnd ? new Date(v.currentPeriodEnd).toLocaleDateString() : "—"}
                  </td>
                  <td className="p-3">
                    <Link href={`/admin/vendor-billing/${v.vendorId}`} className="text-violet-600 text-xs font-medium">
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
