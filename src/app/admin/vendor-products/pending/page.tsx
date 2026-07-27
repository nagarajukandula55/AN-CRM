"use client";

import useSWR from "swr";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type VendorProduct = {
  _id: string;
  productName: string;
  variantName: string;
  vendorCost: number;
  mrp: number;
  approvalStatus: string;
  vendorId?: any;
  calculatedCost?: { finalCost?: number };
};

export default function PendingVendorProductsPage() {
  const router = useRouter();

  const [error, setError] = useState<string | null>(null);

  const { data: itemsRes, isLoading: loading, mutate: load } = useSWR(
    "/api/vendor-products/pending"
  );
  const items: VendorProduct[] = itemsRes?.data || [];

  async function approve(id: string) {
    setError(null);
    const res = await fetch(
      `/api/vendor-products/${id}/approve`,
      { method: "POST" }
    );
    const d = await res.json().catch(() => ({}));
    if (!res.ok || d.success === false) {
      setError(d.message || "Failed to approve — please try again");
      return;
    }
    load();
  }

  async function reject(id: string) {
    const reason = prompt(
      "Enter rejection reason"
    );

    if (!reason) return;

    setError(null);
    const res = await fetch(
      `/api/vendor-products/${id}/reject`,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({ reason }),
      }
    );
    const d = await res.json().catch(() => ({}));
    if (!res.ok || d.success === false) {
      setError(d.message || "Failed to reject — please try again");
      return;
    }

    load();
  }

  return (
    <div className="space-y-6">
      <Link href="/admin/products" className="text-sm text-blue-600 hover:underline inline-block">
        ← Back to Products
      </Link>
      <div>
        <h1 className="text-2xl font-bold">
          Pending Approvals
        </h1>
        <p className="text-sm text-gray-500">
          Review vendor submitted products
        </p>
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      <div className="border rounded">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="p-3 text-left">
                Product
              </th>
              <th className="p-3 text-left">
                Variant
              </th>
              <th className="p-3 text-center">
                Vendor
              </th>
              <th className="p-3 text-center">
                Cost
              </th>
              <th className="p-3 text-center">
                Status
              </th>
              <th className="p-3 text-center">
                Actions
              </th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={6}
                  className="p-4 text-center"
                >
                  Loading...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="p-4 text-center"
                >
                  No Pending Products
                </td>
              </tr>
            ) : (
              items.map((p) => (
                <tr
                  key={p._id}
                  className="border-b"
                >
                  <td className="p-3">
                    {p.productName}
                  </td>

                  <td className="p-3">
                    {p.variantName}
                  </td>

                  <td className="p-3 text-center">
                    {p.vendorId?.companyName ||
                      "Vendor"}
                  </td>

                  <td className="p-3 text-center">
                    ₹{Number(p.calculatedCost?.finalCost || 0).toFixed(2)}
                  </td>

                  <td className="p-3 text-center">
                    <span className="text-xs border px-2 py-1 rounded">
                      {p.approvalStatus}
                    </span>
                  </td>

                  <td className="p-3">
                    <div className="flex gap-2 justify-center">
                      <button
                        onClick={() =>
                          router.push(
                            `/admin/vendor-products/${p._id}`
                          )
                        }
                        className="border px-2 py-1 rounded"
                      >
                        View
                      </button>

                      <button
                        onClick={() =>
                          approve(p._id)
                        }
                        className="bg-green-600 text-white px-2 py-1 rounded"
                      >
                        Approve
                      </button>

                      <button
                        onClick={() =>
                          reject(p._id)
                        }
                        className="bg-red-600 text-white px-2 py-1 rounded"
                      >
                        Reject
                      </button>
                    </div>
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
