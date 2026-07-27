"use client";

import { useState } from "react";
import useSWR from "swr";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function VendorProductDetail({
  params,
}: any) {
  const router = useRouter();
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Was fetching the entire /api/vendor-products list and finding this
  // one client-side -- the dedicated GET /api/vendor-products/[id]
  // (already used everywhere in the vendor wizard) also populates
  // category/brand/vendor names, which the list endpoint doesn't.
  const { data: productRes, isLoading: loading } = useSWR(
    `/api/vendor-products/${params.id}`
  );
  const data: any = productRes?.data;

  const { data: bomRes } = useSWR(`/api/vendor-products/${params.id}/bom`);
  const bom: any[] = bomRes?.data || [];

  async function approve() {
    setActing(true);
    setError(null);
    try {
      const res = await fetch(`/api/vendor-products/${params.id}/approve`, { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || d.success === false) {
        setError(d.message || "Failed to approve");
        return;
      }
      router.push("/admin/vendor-products/pending");
    } finally {
      setActing(false);
    }
  }

  async function reject() {
    const reason = prompt("Enter rejection reason");
    if (!reason) return;
    setActing(true);
    setError(null);
    try {
      const res = await fetch(`/api/vendor-products/${params.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || d.success === false) {
        setError(d.message || "Failed to reject");
        return;
      }
      router.push("/admin/vendor-products/pending");
    } finally {
      setActing(false);
    }
  }

  if (loading) return <div className="p-6 text-gray-500">Loading...</div>;
  if (!data) return <div className="p-6 text-red-600">Product not found.</div>;

  const categoryName = typeof data.categoryId === "object" ? data.categoryId?.name : "—";
  const brandName = typeof data.brandId === "object" ? data.brandId?.name : "—";
  const vendorName =
    typeof data.vendorId === "object" ? data.vendorId?.companyName || data.vendorId?.contactPerson : "—";

  const sectionClass = "border rounded-lg p-4 space-y-2";
  const labelClass = "text-xs text-gray-500";
  const rowClass = "grid grid-cols-2 gap-2 text-sm";

  return (
    <div className="space-y-6 pb-10">
      <Link href="/admin/vendor-products/pending" className="text-sm text-blue-600 hover:underline inline-block">
        ← Back to Pending Approvals
      </Link>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {data.productName} {data.variantName && <span className="text-gray-400 font-normal">— {data.variantName}</span>}
          </h1>
          <p className="text-sm text-gray-500">
            Vendor: {vendorName} · Category: {categoryName} · Brand: {brandName} · Status:{" "}
            <span className="font-medium">{data.approvalStatus}</span>
          </p>
        </div>
        {["PENDING", "UNDER_REVIEW"].includes(data.approvalStatus) && (
          <div className="flex gap-2 shrink-0">
            <button
              onClick={approve}
              disabled={acting}
              className="bg-green-600 text-white px-4 py-2 rounded disabled:opacity-50"
            >
              Approve
            </button>
            <button
              onClick={reject}
              disabled={acting}
              className="bg-red-600 text-white px-4 py-2 rounded disabled:opacity-50"
            >
              Reject
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {data.rejectionReason && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Rejected: {data.rejectionReason}
        </div>
      )}

      {/* Images */}
      {data.images?.length > 0 && (
        <div className={sectionClass}>
          <h2 className="font-semibold">Images</h2>
          <div className="flex flex-wrap gap-3">
            {data.images.map((url: string, i: number) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={url} src={url} alt="" className={`h-24 w-24 rounded object-cover border-2 ${i === 0 ? "border-blue-500" : "border-transparent"}`} title={i === 0 ? "Featured image" : undefined} />
            ))}
          </div>
        </div>
      )}

      {/* Basic Info */}
      <div className={sectionClass}>
        <h2 className="font-semibold">Basic Info</h2>
        <p className="text-sm">{data.description || <span className="text-gray-400">No description provided.</span>}</p>
        <div className={rowClass}>
          <span className={labelClass}>Slug</span><span className="font-mono">{data.slug || "—"}</span>
        </div>
      </div>

      {/* Structure & Taxation */}
      <div className={sectionClass}>
        <h2 className="font-semibold">Structure & Taxation</h2>
        <div className={rowClass}>
          <span className={labelClass}>Unit / Pack Size</span><span>{data.unit || "—"} × {data.packSize ?? "—"}</span>
          <span className={labelClass}>Net / Gross Weight</span><span>{data.netWeight ?? "—"} / {data.grossWeight ?? "—"} {data.unit}</span>
          <span className={labelClass}>HSN Code</span><span>{data.hsnCode || "—"}</span>
          <span className={labelClass}>GST Rate</span><span>{data.gstRate ?? 0}%</span>
        </div>
      </div>

      {/* BOM */}
      <div className={sectionClass}>
        <h2 className="font-semibold">Bill of Materials</h2>
        {bom.length === 0 ? (
          <p className="text-sm text-gray-400">No BOM rows recorded.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-gray-500">
                <th className="py-1">Material</th>
                <th>Type</th>
                <th>Qty</th>
                <th>Rate</th>
                <th>Cost</th>
              </tr>
            </thead>
            <tbody>
              {bom.map((b) => (
                <tr key={b._id} className="border-b last:border-0">
                  <td className="py-1">{b.materialName}</td>
                  <td>{b.materialType || "INGREDIENT"}</td>
                  <td>{b.quantity} {b.unit}</td>
                  <td>₹{b.currentRate}/{b.rateUnit || b.unit}</td>
                  <td>₹{Number(b.currentCost || 0).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Cost Summary -- was reading calculatedCurrentCost/calculatedSafeCost/
          calculatedWorstCost, fields that don't exist on VendorProduct's
          schema (it's a nested calculatedCost: {baseCost, wastageCost,
          finalCost}) -- always rendered "₹undefined" regardless of the
          product's real BOM cost. */}
      <div className={sectionClass}>
        <h2 className="font-semibold">Cost Summary (from BOM)</h2>
        <div className={rowClass}>
          <span className={labelClass}>Base Cost</span><span>₹{Number(data.calculatedCost?.baseCost || 0).toFixed(2)}</span>
          <span className={labelClass}>Wastage Buffer</span><span>₹{Number(data.calculatedCost?.wastageCost || 0).toFixed(2)}</span>
          <span className={labelClass}>Final Cost</span><span className="font-semibold">₹{Number(data.calculatedCost?.finalCost || 0).toFixed(2)}</span>
        </div>
      </div>

      {/* Commercial */}
      <div className={sectionClass}>
        <h2 className="font-semibold">Commercial</h2>
        <div className={rowClass}>
          <span className={labelClass}>Vendor SKU</span><span className="font-mono">{data.vendorSku || "—"}</span>
          <span className={labelClass}>Additional Cost</span><span>₹{data.vendorCost ?? 0}</span>
          <span className={labelClass}>Shipping Cost</span><span>₹{data.vendorShippingCost ?? 0} ({data.shippingCostType})</span>
          <span className={labelClass}>MRP</span><span>₹{data.mrp ?? 0}</span>
          <span className={labelClass}>Suggested Selling Price</span><span className="font-semibold">₹{data.suggestedSellingPrice ?? 0}</span>
          <span className={labelClass}>Minimum Order Qty</span><span>{data.minimumOrderQty ?? "—"}</span>
          <span className={labelClass}>Lead Time</span><span>{data.leadTimeDays ?? 0} days</span>
          <span className={labelClass}>Available Stock</span><span>{data.availableStock ?? 0}</span>
        </div>
      </div>

      {/* Compliance & Packaging */}
      <div className={sectionClass}>
        <h2 className="font-semibold">Compliance & Packaging</h2>
        <div className={rowClass}>
          <span className={labelClass}>Ingredients</span><span>{data.compliance?.ingredients?.join(", ") || "—"}</span>
          <span className={labelClass}>Allergens</span><span>{data.compliance?.allergens?.join(", ") || "—"}</span>
          <span className={labelClass}>Warnings</span><span>{data.compliance?.warnings?.join(", ") || "—"}</span>
          <span className={labelClass}>Usage Instructions</span><span>{data.compliance?.usageInstructions || "—"}</span>
          <span className={labelClass}>Packaging Type</span><span>{data.compliance?.packagingType || "—"}</span>
          <span className={labelClass}>Fragile / Temp Sensitive</span><span>{data.compliance?.isFragile ? "Fragile" : "—"} {data.compliance?.temperatureSensitive ? "/ Temp Sensitive" : ""}</span>
          <span className={labelClass}>Storage Instructions</span><span>{data.compliance?.storageInstructions || "—"}</span>
          <span className={labelClass}>Shelf Life / Best Before</span><span>{data.compliance?.shelfLifeDays ?? "—"} days / {data.compliance?.bestBefore || "—"}</span>
        </div>
      </div>

      {/* Nutrition */}
      {data.nutrition?.energy > 0 && (
        <div className={sectionClass}>
          <h2 className="font-semibold">Nutrition (per {data.nutrition?.servingSize ?? 100} g serving)</h2>
          <div className={rowClass}>
            <span className={labelClass}>Energy</span><span>{data.nutrition.energy} kcal</span>
            <span className={labelClass}>Protein</span><span>{data.nutrition.protein} g</span>
            <span className={labelClass}>Carbs</span><span>{data.nutrition.carbs} g</span>
            <span className={labelClass}>Sugars</span><span>{data.nutrition.sugars} g</span>
            <span className={labelClass}>Fat</span><span>{data.nutrition.fat} g</span>
            <span className={labelClass}>Sodium</span><span>{data.nutrition.sodium} mg</span>
          </div>
        </div>
      )}

      {/* SEO */}
      <div className={sectionClass}>
        <h2 className="font-semibold">SEO</h2>
        <div className={rowClass}>
          <span className={labelClass}>Title</span><span>{data.seo?.customTitle || "—"}</span>
          <span className={labelClass}>Description</span><span>{data.seo?.customDescription || "—"}</span>
          <span className={labelClass}>Keywords</span><span>{data.seo?.keywords?.join(", ") || "—"}</span>
        </div>
      </div>
    </div>
  );
}
