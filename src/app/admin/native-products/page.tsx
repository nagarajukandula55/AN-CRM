"use client";

import { useState } from "react";
import useSWR from "swr";

interface NativeProductRow {
  _id: string;
  name: string;
  slug: string;
  sku?: string;
  basePrice: number;
  mrp?: number;
  weightKg?: number;
  isActive: boolean;
  images?: string[];
  variantGroupKey?: string;
  createdAt: string;
  businessId?: string;
}

interface BusinessOption {
  _id: string;
  name: string;
}

export default function NativeProductsAdminPage() {
  const [businessId, setBusinessId] = useState("");
  const [search, setSearch] = useState("");
  // Only committed on Enter/Search-click (not every keystroke) -- matches
  // the original manual load() trigger instead of firing a fetch per key.
  const [appliedSearch, setAppliedSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: meRes } = useSWR("/api/auth/me");
  const businesses: BusinessOption[] = meRes?.businesses || [];

  const productsParams = (() => {
    const params = new URLSearchParams();
    if (businessId) params.set("businessId", businessId);
    if (appliedSearch) params.set("search", appliedSearch);
    return params.toString();
  })();

  const { data: productsRes, isLoading: loading, mutate: load } = useSWR(
    `/api/admin/native-products?${productsParams}`,
    { keepPreviousData: true }
  );
  const products: NativeProductRow[] = productsRes?.success ? productsRes.data || [] : [];

  async function saveWeight(p: NativeProductRow, weightKg: number) {
    setBusyId(p._id);
    try {
      await fetch(`/api/admin/native-products/${p._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weightKg }),
      });
      load();
    } finally {
      setBusyId(null);
    }
  }

  async function toggleActive(p: NativeProductRow) {
    setBusyId(p._id);
    try {
      await fetch(`/api/admin/native-products/${p._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !p.isActive }),
      });
      load();
    } finally {
      setBusyId(null);
    }
  }

  async function remove(p: NativeProductRow) {
    if (!confirm(`Remove "${p.name}" from the storefront? This can be restored from the database if needed, but not from this page.`)) return;
    setBusyId(p._id);
    try {
      await fetch(`/api/admin/native-products/${p._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isDeleted: true }),
      });
      load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Storefront Products</h1>
        <p className="text-sm text-gray-500 mt-1">
          Every live NativeProduct listing — including stray ₹0 or leftover test entries not grouped with a real
          product. Deactivate to hide from the storefront, or Remove to soft-delete.
        </p>
      </div>

      <div className="flex gap-2">
        <select className="border rounded-lg p-2 text-sm" value={businessId} onChange={(e) => setBusinessId(e.target.value)}>
          <option value="">All Businesses</option>
          {businesses.map((b) => (
            <option key={b._id} value={b._id}>{b.name}</option>
          ))}
        </select>
        <input
          className="border rounded-lg p-2 text-sm flex-1"
          placeholder="Search by name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && setAppliedSearch(search)}
        />
        <button onClick={() => setAppliedSearch(search)} className="px-3 py-2 border rounded-lg text-sm">Search</button>
      </div>

      <div className="rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-100">
              <th className="p-3"></th>
              <th className="p-3">Name</th>
              <th className="p-3">SKU</th>
              <th className="p-3">Price</th>
              <th className="p-3">Weight (kg)</th>
              <th className="p-3">Status</th>
              <th className="p-3">Created</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="p-4 text-gray-400" colSpan={8}>Loading…</td></tr>
            ) : products.length === 0 ? (
              <tr><td className="p-4 text-gray-400" colSpan={8}>No products found.</td></tr>
            ) : (
              products.map((p) => (
                <tr key={p._id} className="border-b border-gray-50">
                  <td className="p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.images?.[0] || "/placeholder.png"} alt="" className="h-10 w-10 rounded object-cover" />
                  </td>
                  <td className="p-3 text-gray-900">{p.name}</td>
                  <td className="p-3 font-mono text-xs text-gray-500">{p.sku || "—"}</td>
                  <td className={`p-3 ${!p.basePrice ? "text-red-600 font-medium" : "text-gray-700"}`}>
                    ₹{p.basePrice || 0}
                  </td>
                  <td className="p-3">
                    <input
                      key={p._id + (p.weightKg ?? "")}
                      type="number"
                      step="0.1"
                      min="0"
                      defaultValue={p.weightKg ?? 0}
                      disabled={busyId === p._id}
                      onBlur={(e) => {
                        const next = Number(e.target.value) || 0;
                        if (next !== (p.weightKg ?? 0)) saveWeight(p, next);
                      }}
                      className="w-20 border rounded-lg p-1.5 text-sm"
                    />
                  </td>
                  <td className="p-3">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${p.isActive ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                      {p.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="p-3 text-gray-500 text-xs">{new Date(p.createdAt).toLocaleDateString()}</td>
                  <td className="p-3 space-x-2">
                    <button onClick={() => toggleActive(p)} disabled={busyId === p._id} className="text-xs text-violet-600">
                      {p.isActive ? "Deactivate" : "Reactivate"}
                    </button>
                    <button onClick={() => remove(p)} disabled={busyId === p._id} className="text-xs text-red-600">
                      Remove
                    </button>
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
