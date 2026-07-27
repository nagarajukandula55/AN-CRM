"use client";

import { useEffect, useState } from "react";

import BOMRow from "./components/BOMRow";
import CostSummary from "./components/CostSummary";
import PricingPreview from "./components/PricingPreview";
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

// quantity/unit is how much of the material THIS product uses; rateUnit is
// what the price is quoted per (e.g. rate ₹150 per kg, 250 g used) -- these
// commonly differ (buy by the kg, use by the gram), so cost must convert
// between them rather than assuming quantity and rate share a unit.
function computeCurrentCost(row: BOMItem): number {
  const qtyGrams = toGrams(row.quantity, row.unit);
  const rateUnitGrams = toGrams(1, row.rateUnit || row.unit);
  const grossCost =
    qtyGrams !== null && rateUnitGrams !== null && rateUnitGrams > 0
      ? (qtyGrams / rateUnitGrams) * row.currentRate
      : row.quantity * row.currentRate; // pcs/pack/etc. -- no unit conversion possible, assume same unit
  return grossCost + (grossCost * row.wastagePercent) / 100;
}

interface CostSummaryType {
  totalMaterialCost: number;
  wastageCost: number;
  finalCost: number;
}

interface PricingType {
  sellingPrice: number;
  marginAmount: number;
  marginPercent: number;
}

interface Props {
  draftId: string;
  businessId?: string;
  next: () => void;
  back: () => void;
}

export default function StepBOM({
  draftId,
  businessId,
  next,
  back,
}: Props) {
  const [rows, setRows] = useState<BOMItem[]>([]);
  const [userId, setUserId] = useState<string>("");
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({});
  const [savedFlash, setSavedFlash] = useState<number | null>(null);
  const [productPack, setProductPack] = useState<{ netWeight: number; unit: string } | null>(null);
  const [clonedFromDraftId, setClonedFromDraftId] = useState<string | null>(null);
  const [copyingIngredients, setCopyingIngredients] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  const [costSummary, setCostSummary] =
    useState<CostSummaryType>({
      totalMaterialCost: 0,
      wastageCost: 0,
      finalCost: 0,
    });

  const [pricing, setPricing] =
    useState<PricingType>({
      sellingPrice: 0,
      marginAmount: 0,
      marginPercent: 0,
    });

  /* ================= LOAD CURRENT USER ================= */
  // Was sending the literal string "TEMP" for both businessId and
  // createdBy on every BOM row save -- businessId cast to ObjectId would
  // fail Mongoose validation, and even where it silently passed through,
  // the BOM was never actually tied to the real business/user. Resolve
  // both from the authenticated session instead.
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setUserId(d?.user?.id || ""))
      .catch(() => {});
  }, []);

  /* ================= LOAD BOM ================= */

  const fetchBOM = async () => {
    const res = await fetch(
      `/api/vendor-products/${draftId}/bom`
    );

    const data = await res.json();

    if (!data.success) return;

    setRows(
      data.data.map((item: any) => ({
        bomId: item._id,
        materialId: item.materialId?._id || "",
        materialName: item.materialName || "",
        unit: item.unit || "",
        quantity: item.quantity || 1,
        wastagePercent:
          item.wastagePercent || 0,
        currentRate:
          item.currentRate || 0,
        materialType:
          item.materialType || "INGREDIENT",
        rateUnit:
          item.rateUnit || item.unit || "",
      }))
    );
  };

  /* ================= COST ================= */

  const fetchCost = async () => {
    const res = await fetch(
      `/api/vendor-products/${draftId}/cost`
    );

    const data = await res.json();

    if (data.success) {
      setCostSummary(data.data);
    }
  };

  /* ================= PRICING ================= */

  const fetchPricing = async () => {
    const res = await fetch(
      `/api/vendor-products/${draftId}/pricing`
    );

    const data = await res.json();

    if (data.success) {
      setPricing(data.data);
    }
  };

  useEffect(() => {
    fetchBOM();
    fetch(`/api/vendor-products/${draftId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.data?.netWeight && d.data?.unit) {
          setProductPack({ netWeight: d.data.netWeight, unit: d.data.unit });
        }
        if (d.success && d.data?.clonedFromDraftId) {
          setClonedFromDraftId(d.data.clonedFromDraftId);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sanity check: the total weight/volume of Ingredient-classified BOM rows
  // shouldn't grossly exceed what this specific product/variant actually
  // holds (e.g. a 250 g product's BOM listing 1 kg of an ingredient is
  // almost certainly a unit mix-up, not a real recipe) -- only meaningful
  // when both sides convert to a common mass/volume unit.
  const packOverageWarning = (() => {
    if (!productPack) return null;
    const packGrams = toGrams(productPack.netWeight, productPack.unit);
    if (packGrams === null || packGrams <= 0) return null;
    const ingredientGrams = rows
      .filter((r) => r.materialType === "INGREDIENT")
      .reduce((sum, r) => {
        const g = toGrams(r.quantity, r.unit);
        return g !== null ? sum + g : sum;
      }, 0);
    if (ingredientGrams <= packGrams * 1.15) return null; // 15% slack for process loss/rounding
    return { ingredientGrams, packGrams };
  })();

  useEffect(() => {
    fetchCost();
    fetchPricing();
  }, [rows]);

  /* ================= ROW ================= */

  const addRow = () => {
    setRows([
      ...rows,
      {
        materialId: "",
        materialName: "",
        unit: "",
        quantity: 1,
        wastagePercent: 0,
        currentRate: 0,
        materialType: "INGREDIENT",
        rateUnit: "",
      },
    ]);
  };

  // Functional update -- BOMRow's material-select handler fires this three
  // times in a row synchronously (materialId, then materialName, then
  // unit) to set all three fields from one picked material. Cloning from
  // the `rows` closure instead of the updater's own `prev` meant each call
  // read the SAME pre-selection snapshot, so only the last of the three
  // calls actually stuck -- materialId and materialName silently reverted,
  // leaving the row's Save button permanently disabled ("Select a material
  // above first") even right after picking one.
  const updateRow = (
    index: number,
    field: keyof BOMItem,
    value: string | number
  ) => {
    setRows((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  /* ================= SAVE ================= */

  const saveRow = async (row: BOMItem, index: number) => {
    setRowErrors((prev) => ({ ...prev, [index]: "" }));

    if (!row.materialId) {
      setRowErrors((prev) => ({ ...prev, [index]: "Select a material first — search above by name." }));
      return;
    }

    // currentCost is what the cost/pricing engine downstream actually
    // reads (previously always hardcoded to 0 here, since there was no
    // rate input at all) -- compute it from qty * rate (converted between
    // the quantity-used unit and the rate-quoted unit, since a material is
    // typically priced per kg/L but used in smaller amounts per product),
    // inflated by wastage%, so product pricing derived from this BOM is
    // meaningful.
    const currentCost = computeCurrentCost(row);

    const res = await fetch(
      `/api/vendor-products/${draftId}/bom`,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          materialId: row.materialId,
          quantity: row.quantity,
          unit: row.unit,
          wastagePercent:
            row.wastagePercent,
          currentRate: row.currentRate,
          currentCost,
          materialType: row.materialType,
          rateUnit: row.rateUnit || row.unit,
          remarks: "",
          businessId,
          createdBy: userId,
        }),
      }
    );

    // Was never checked -- a failed save (e.g. material not found, no
    // active business) silently did nothing while fetchBOM() below just
    // re-rendered whatever was already saved, so the row LOOKED like it
    // never got added with no error shown anywhere. This is exactly what
    // "I added something but nothing showed up" describes.
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      setRowErrors((prev) => ({
        ...prev,
        [index]: data.message || "Failed to save this material — please try again.",
      }));
      return;
    }

    setSavedFlash(index);
    setTimeout(() => setSavedFlash((cur) => (cur === index ? null : cur)), 2000);

    await fetchBOM();
  };

  /* ================= COPY & SCALE FROM SOURCE VARIANT ================= */

  // This draft was started via "+ Create another variant" -- e.g. a 1 kg
  // product's Review step spun up a fresh 500 g draft. Only INGREDIENT rows
  // are scaled by the pack-size ratio (the actual recipe genuinely halves);
  // PACKAGING rows are deliberately skipped -- a 500 g pouch/label/carton is
  // a different physical item, not "half" of the 1 kg one, so those still
  // need to be picked fresh for this pack size.
  const copyScaledIngredients = async () => {
    if (!clonedFromDraftId || !productPack) return;
    setCopyingIngredients(true);
    setCopyError(null);
    try {
      const [sourceProductRes, sourceBomRes] = await Promise.all([
        fetch(`/api/vendor-products/${clonedFromDraftId}`),
        fetch(`/api/vendor-products/${clonedFromDraftId}/bom`),
      ]);
      const sourceProduct = await sourceProductRes.json();
      const sourceBom = await sourceBomRes.json();

      if (!sourceProduct.success || !sourceProduct.data?.netWeight || !sourceProduct.data?.unit) {
        setCopyError("Source variant has no pack size set — nothing to scale from.");
        return;
      }
      if (!sourceBom.success || !sourceBom.data?.length) {
        setCopyError("Source variant has no BOM ingredients yet.");
        return;
      }

      const sourceGrams = toGrams(sourceProduct.data.netWeight, sourceProduct.data.unit);
      const targetGrams = toGrams(productPack.netWeight, productPack.unit);
      if (sourceGrams === null || targetGrams === null || sourceGrams <= 0) {
        setCopyError("Couldn't work out a scale ratio between the two pack sizes/units.");
        return;
      }
      const ratio = targetGrams / sourceGrams;

      const ingredientRows = sourceBom.data.filter((item: any) => (item.materialType || "INGREDIENT") === "INGREDIENT");
      if (!ingredientRows.length) {
        setCopyError("Source variant has no Ingredient-type rows to scale (only Packaging/Other).");
        return;
      }

      for (const item of ingredientRows) {
        const quantity = Number(item.quantity || 0) * ratio;
        const currentCost = computeCurrentCost({
          quantity,
          unit: item.unit,
          wastagePercent: item.wastagePercent || 0,
          currentRate: item.currentRate || 0,
          rateUnit: item.rateUnit || item.unit,
        } as BOMItem);

        await fetch(`/api/vendor-products/${draftId}/bom`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            materialId: item.materialId?._id || item.materialId,
            quantity,
            unit: item.unit,
            wastagePercent: item.wastagePercent || 0,
            currentRate: item.currentRate || 0,
            currentCost,
            materialType: "INGREDIENT",
            rateUnit: item.rateUnit || item.unit,
            remarks: `Scaled ${Math.round(ratio * 100)}% from ${sourceProduct.data.netWeight}${sourceProduct.data.unit} variant`,
            businessId,
            createdBy: userId,
          }),
        });
      }

      await fetchBOM();
    } catch {
      setCopyError("Failed to copy ingredients — please try again.");
    } finally {
      setCopyingIngredients(false);
    }
  };

  /* ================= DELETE ================= */

  const deleteRow = async (id: string) => {
    await fetch(
      `/api/vendor-products/${draftId}/bom?bomId=${id}`,
      {
        method: "DELETE",
      }
    );

    await fetchBOM();
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold">
        Bill Of Materials
      </h2>
      <p className="text-sm text-gray-500 -mt-4">
        Add every material that goes into this product, its quantity, and
        its rate — the rate you enter here is what drives this product's
        computed cost and suggested selling price below.
      </p>

      {!businessId && (
        <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          No active business selected — BOM rows will not save correctly
          until a business is selected.
        </div>
      )}

      {productPack && (
        <p className="text-xs text-gray-400 -mt-2">
          This product/variant is {productPack.netWeight} {productPack.unit} net weight — Ingredient rows below should roughly add up to that, not exceed it.
        </p>
      )}

      {clonedFromDraftId && !rows.some((r) => r.bomId) && productPack && (
        <div className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800 flex items-center justify-between gap-3">
          <span>
            This is a variant of an existing product — copy its ingredients, scaled to this{" "}
            {productPack.netWeight}{productPack.unit} pack size. (Packaging like pouch/label is skipped — pick that
            fresh for this size.)
          </span>
          <button
            type="button"
            onClick={copyScaledIngredients}
            disabled={copyingIngredients}
            className="shrink-0 rounded bg-blue-600 px-3 py-1.5 text-white text-xs disabled:opacity-50"
          >
            {copyingIngredients ? "Copying…" : "Copy & Scale Ingredients"}
          </button>
        </div>
      )}
      {copyError && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{copyError}</div>
      )}

      {packOverageWarning && (
        <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          Your Ingredient rows total {packOverageWarning.ingredientGrams >= 1000 ? `${(packOverageWarning.ingredientGrams / 1000).toFixed(2)} kg` : `${packOverageWarning.ingredientGrams.toFixed(0)} g`}, more than this {productPack!.netWeight} {productPack!.unit} product actually holds — check the Qty and Unit on each row (a common mistake: pricing quoted per kg but Qty accidentally entered as if it were in kg too, e.g. "1" instead of "0.25" for 250 g used).
        </div>
      )}

      {rows.length > 0 && (
        <div className="hidden sm:grid grid-cols-7 gap-2 px-1 text-xs font-medium text-gray-500">
          <span>Material</span>
          <span>Type</span>
          <span>Qty</span>
          <span>Unit</span>
          <span>Wastage %</span>
          <span>Rate (₹ per…)</span>
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

      <button
        onClick={addRow}
        className="rounded bg-blue-600 px-4 py-2 text-white"
      >
        + Add Material
      </button>

      <CostSummary
        totalMaterialCost={
          costSummary.totalMaterialCost
        }
        wastageCost={
          costSummary.wastageCost
        }
        finalCost={costSummary.finalCost}
      />

      <PricingPreview
        sellingPrice={pricing.sellingPrice}
        marginAmount={pricing.marginAmount}
        marginPercent={pricing.marginPercent}
      />

      <div className="flex justify-between">
        <button
          onClick={back}
          className="rounded border px-4 py-2"
        >
          Back
        </button>

        <button
          onClick={next}
          disabled={!rows.some((r) => r.bomId)}
          title={!rows.some((r) => r.bomId) ? "Save at least one material first" : undefined}
          className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
        >
          Save & Continue
        </button>
      </div>
    </div>
  );
}
