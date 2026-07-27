"use client";

/**
 * Standalone BOM page, reached via the "BOM" quick-link on the vendor
 * products list -- was a cruder, separately-maintained duplicate of the
 * wizard's own BOM step (StepBOM.tsx) missing: businessId in the POST
 * body (the API requires it to attribute the BOM row -- every row added
 * here silently misattributed or failed), the wastagePercent field (asked
 * for in form state but never actually rendered as an input, so it was
 * always 0), the "add a new material inline" fallback when nothing
 * matches a search, and any error/success feedback or cost/pricing
 * preview. Rewritten to share the exact same components the wizard step
 * uses (BOMRow, CostSummary, PricingPreview) instead of a second,
 * drifted implementation.
 */

import { useEffect, useState } from "react";
import useSWR from "swr";
import { useParams } from "next/navigation";
import BOMRow from "@/components/vendor-product-wizard/steps/components/BOMRow";
import CostSummary from "@/components/vendor-product-wizard/steps/components/CostSummary";
import PricingPreview from "@/components/vendor-product-wizard/steps/components/PricingPreview";
import { toGrams } from "@/lib/nutritionReference";

interface BOMItem {
  bomId?: string;
  materialId: string;
  materialName: string;
  unit: string;
  quantity: number;
  wastagePercent: number;
  currentRate: number;
  materialType: "INGREDIENT" | "PACKAGING" | "OTHER";
  rateUnit: string;
}

function computeCurrentCost(row: BOMItem): number {
  const qtyGrams = toGrams(row.quantity, row.unit);
  const rateUnitGrams = toGrams(1, row.rateUnit || row.unit);
  const grossCost =
    qtyGrams !== null && rateUnitGrams !== null && rateUnitGrams > 0
      ? (qtyGrams / rateUnitGrams) * row.currentRate
      : row.quantity * row.currentRate;
  return grossCost + (grossCost * row.wastagePercent) / 100;
}

export default function BOMPage() {
  const params = useParams();
  const draftId = params?.id as string;

  const [rows, setRows] = useState<BOMItem[]>([]);
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({});
  const [savedFlash, setSavedFlash] = useState<number | null>(null);

  const { data: meData } = useSWR("/api/auth/me");
  const userId: string = meData?.user?.id || "";

  const { data: productData } = useSWR(draftId ? `/api/vendor-products/${draftId}` : null);
  const businessId: string =
    productData?.success && productData.data
      ? String(productData.data.businessId?._id || productData.data.businessId || "")
      : "";
  const productLabel: string =
    productData?.success && productData.data
      ? [productData.data.productName, productData.data.variantName].filter(Boolean).join(" ")
      : "";

  const { data: bomData, mutate: refetchBOM } = useSWR(draftId ? `/api/vendor-products/${draftId}/bom` : null);
  const { data: costData, mutate: refetchCost } = useSWR(draftId ? `/api/vendor-products/${draftId}/cost` : null);
  const { data: pricingData, mutate: refetchPricing } = useSWR(draftId ? `/api/vendor-products/${draftId}/pricing` : null);

  const costSummary = costData?.success ? costData.data : { totalMaterialCost: 0, wastageCost: 0, finalCost: 0 };
  const pricing = pricingData?.success ? pricingData.data : { sellingPrice: 0, marginAmount: 0, marginPercent: 0 };

  useEffect(() => {
    if (bomData?.success) {
      setRows(
        bomData.data.map((item: any) => ({
          bomId: item._id,
          materialId: item.materialId?._id || "",
          materialName: item.materialName || "",
          unit: item.unit || "",
          quantity: item.quantity || 1,
          wastagePercent: item.wastagePercent || 0,
          currentRate: item.currentRate || 0,
          materialType: item.materialType || "INGREDIENT",
          rateUnit: item.rateUnit || item.unit || "",
        }))
      );
    }
  }, [bomData]);

  function addRow() {
    setRows((prev) => [...prev, { materialId: "", materialName: "", unit: "", quantity: 1, wastagePercent: 0, currentRate: 0, materialType: "INGREDIENT", rateUnit: "" }]);
  }

  function updateRow(index: number, field: keyof BOMItem, value: any) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  }

  async function saveRow(row: BOMItem, index: number) {
    setRowErrors((prev) => ({ ...prev, [index]: "" }));
    if (!row.materialId) {
      setRowErrors((prev) => ({ ...prev, [index]: "Select a material first — search above by name." }));
      return;
    }
    const currentCost = computeCurrentCost(row);

    const res = await fetch(`/api/vendor-products/${draftId}/bom`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        materialId: row.materialId,
        quantity: row.quantity,
        unit: row.unit,
        wastagePercent: row.wastagePercent,
        currentRate: row.currentRate,
        currentCost,
        materialType: row.materialType,
        rateUnit: row.rateUnit || row.unit,
        remarks: "",
        businessId,
        createdBy: userId,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      setRowErrors((prev) => ({ ...prev, [index]: data.message || "Failed to save this material — please try again." }));
      return;
    }
    setSavedFlash(index);
    setTimeout(() => setSavedFlash((cur) => (cur === index ? null : cur)), 2000);
    await refetchBOM();
    refetchCost();
    refetchPricing();
  }

  async function deleteRow(id: string) {
    await fetch(`/api/vendor-products/${draftId}/bom?bomId=${id}`, { method: "DELETE" });
    await refetchBOM();
    refetchCost();
    refetchPricing();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Bill of Materials</h1>
        {productLabel && <p className="text-sm text-gray-500">{productLabel}</p>}
        <p className="text-sm text-gray-500 mt-1">
          Add every material that goes into this product, its quantity, and its rate — the rate you enter here drives
          this product&apos;s computed cost and suggested selling price below.
        </p>
      </div>

      {!businessId && (
        <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Loading business context — BOM rows will not save correctly until this finishes.
        </div>
      )}

      {rows.length > 0 && (
        <div className="hidden sm:grid grid-cols-7 gap-2 px-1 text-xs font-medium text-gray-500">
          <span>Material</span>
          <span>Type</span>
          <span>Qty</span>
          <span>Unit</span>
          <span>Wastage %</span>
          <span>Rate (₹/unit)</span>
          <span>Actions</span>
        </div>
      )}

      {rows.map((row, index) => (
        <BOMRow
          key={row.bomId || index}
          row={row}
          index={index}
          updateRow={updateRow}
          saveRow={(r) => saveRow(r, index)}
          deleteRow={deleteRow}
          error={rowErrors[index]}
          justSaved={savedFlash === index}
        />
      ))}

      <button onClick={addRow} className="rounded bg-blue-600 px-4 py-2 text-white">
        + Add Material
      </button>

      <CostSummary
        totalMaterialCost={costSummary.totalMaterialCost}
        wastageCost={costSummary.wastageCost}
        finalCost={costSummary.finalCost}
      />

      <PricingPreview
        sellingPrice={pricing.sellingPrice}
        marginAmount={pricing.marginAmount}
        marginPercent={pricing.marginPercent}
      />
    </div>
  );
}
