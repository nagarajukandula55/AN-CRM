"use client";

import { useEffect, useState } from "react";
import HsnSearchSelect from "@/components/shared/HsnSearchSelect";

interface StepStructureProps {
  draftId: string;
  businessId?: string;
  next: () => void;
  back: () => void;
}

interface StructureForm {
  unit: string;
  packSize: number;
  netWeight: number;
  grossWeight: number;
  hsnCode: string;
  gstRate: number;
}

const UNIT_OPTIONS = ["kg", "g", "l", "ml", "pcs", "pack", "box", "dozen"];

export default function StepStructure({
  draftId,
  businessId,
  next,
  back,
}: StepStructureProps) {
  const [form, setForm] = useState<StructureForm>({
    unit: "",
    packSize: 1,
    netWeight: 0,
    grossWeight: 0,
    hsnCode: "",
    gstRate: 0,
  });

  // The wizard's "auto-generated variant" -- was a free-text field on the
  // Basic Info step with no connection to the actual pack size/unit chosen
  // here, so two vendors describing the same "500g" variant could type
  // "500g", "500 Grams", "Half Kg", etc. Now it's derived from unit+packSize
  // once both are set, shown here (right after they're entered) instead of
  // asked for blind on step 1 before either exists. Still editable, in case
  // a vendor needs a real distinguishing name (e.g. "Spicy") rather than a
  // size-based one.
  const [variantName, setVariantName] = useState("");
  const [variantTouched, setVariantTouched] = useState(false);
  const [grossWeightTouched, setGrossWeightTouched] = useState(false);

  const [loading, setLoading] = useState(false);
  const [gstLookupStatus, setGstLookupStatus] = useState<
    "idle" | "loading" | "found" | "not-found"
  >("idle");

  useEffect(() => {
    fetch(`/api/vendor-products/${draftId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.data) {
          setForm({
            unit: d.data.unit || "",
            packSize: d.data.packSize || 1,
            netWeight: d.data.netWeight || 0,
            grossWeight: d.data.grossWeight || 0,
            hsnCode: d.data.hsnCode || "",
            gstRate: d.data.gstRate || 0,
          });
          if (d.data.variantName) {
            setVariantName(d.data.variantName);
            setVariantTouched(true);
          }
          if (d.data.grossWeight && d.data.grossWeight !== d.data.netWeight) {
            setGrossWeightTouched(true);
          }
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId]);

  // Auto-suggest "<packSize> <unit>" (e.g. "500 g") whenever both are set,
  // until the vendor deliberately edits the variant name themselves.
  useEffect(() => {
    if (variantTouched || !form.unit || !form.packSize) return;
    setVariantName(`${form.packSize} ${form.unit}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.unit, form.packSize]);


  const handleSave = async () => {
    setLoading(true);

    await fetch(`/api/vendor-products/${draftId}/structure`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      // variantName rides along on this same PATCH -- the route does a
      // generic findByIdAndUpdate, so any top-level VendorProduct field is
      // accepted, not just the ones named "structure".
      body: JSON.stringify({ ...form, variantName }),
    });

    setLoading(false);
    next();
  };

  const inputClass = "w-full border rounded p-2";
  const labelClass = "text-xs font-medium text-gray-500";

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">
        Product Structure & Taxation
      </h2>
      <p className="text-sm text-gray-500">
        This defines the exact variant being sold (its pack size and unit)
        and the GST/HSN details used for invoicing — the Bill of Materials
        step right after this will ask for material quantities in the unit
        you choose here.
      </p>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <label className={labelClass}>Unit *</label>
          <select
            className={inputClass}
            value={form.unit}
            onChange={(e) => setForm({ ...form, unit: e.target.value })}
          >
            <option value="">Select unit…</option>
            {UNIT_OPTIONS.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelClass}>
            Pack Size * <span className="text-gray-400 font-normal">(quantity per selling unit)</span>
          </label>
          <input
            type="number"
            className={inputClass}
            placeholder="e.g. 500"
            value={form.packSize}
            onFocus={(e) => e.target.select()}
            onChange={(e) =>
              setForm({
                ...form,
                packSize: Number(e.target.value),
              })
            }
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className={labelClass}>
          Variant Name{" "}
          <span className="text-gray-400 font-normal">
            (auto-generated from pack size + unit — edit for a descriptive name like "Spicy")
          </span>
        </label>
        <input
          className={inputClass}
          value={variantName}
          onChange={(e) => {
            setVariantTouched(true);
            setVariantName(e.target.value);
          }}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <label className={labelClass}>
            Net Weight <span className="text-gray-400 font-normal">(product only, in {form.unit || "the unit selected above"})</span>
          </label>
          <input
            type="number"
            className={inputClass}
            placeholder="e.g. 0.5"
            value={form.netWeight}
            onFocus={(e) => e.target.select()}
            onChange={(e) => {
              const netWeight = Number(e.target.value);
              setForm((prev) => ({
                ...prev,
                netWeight,
                // Starting default for gross weight -- refine once
                // packaging is picked in a later step. Only auto-follows
                // net weight until the vendor edits gross weight directly.
                grossWeight: grossWeightTouched ? prev.grossWeight : netWeight,
              }));
            }}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelClass}>
            Gross Weight{" "}
            <span className="text-gray-400 font-normal">
              (product + packaging, in {form.unit || "the unit selected above"} — used for shipping; defaults to net weight until you refine it)
            </span>
          </label>
          <input
            type="number"
            className={inputClass}
            placeholder="e.g. 0.6"
            value={form.grossWeight}
            onFocus={(e) => e.target.select()}
            onChange={(e) => {
              setGrossWeightTouched(true);
              setForm({
                ...form,
                grossWeight: Number(e.target.value),
              });
            }}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className={labelClass}>
          HSN Code{" "}
          <span className="text-gray-400 font-normal">
            (search by code or description — the GST rate fills in automatically once you pick one)
          </span>
        </label>
        <HsnSearchSelect
          value={form.hsnCode}
          businessId={businessId}
          onChange={(hsnCode) => setForm((prev) => ({ ...prev, hsnCode }))}
          onSelect={(rate) => {
            setForm((prev) => ({ ...prev, hsnCode: rate.hsnCode, gstRate: rate.gstRate }));
            setGstLookupStatus("found");
          }}
        />
        {gstLookupStatus === "loading" && (
          <p className="text-xs text-gray-400">Looking up GST rate…</p>
        )}
        {gstLookupStatus === "found" && (
          <p className="text-xs text-green-600">
            GST rate auto-filled from HSN lookup — override below if needed.
          </p>
        )}
        {gstLookupStatus === "not-found" && (
          <p className="text-xs text-amber-600">
            No matching HSN rate found — enter GST rate manually below.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label className={labelClass}>
          GST Rate (%){" "}
          <span className="text-gray-400 font-normal">(auto-filled from HSN code above, or enter manually)</span>
        </label>
        <input
          type="number"
          className={inputClass}
          placeholder="e.g. 18"
          value={form.gstRate}
          onFocus={(e) => e.target.select()}
          onChange={(e) =>
            setForm({
              ...form,
              gstRate: Number(e.target.value),
            })
          }
        />
      </div>

      <div className="flex justify-between pt-4">
        <button
          onClick={back}
          className="px-4 py-2 border rounded"
        >
          Back
        </button>

        <button
          onClick={handleSave}
          disabled={loading}
          className="bg-blue-600 text-white px-4 py-2 rounded"
        >
          {loading ? "Saving..." : "Save & Continue"}
        </button>
      </div>
    </div>
  );
}
