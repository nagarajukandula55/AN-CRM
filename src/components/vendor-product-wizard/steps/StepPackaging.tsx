"use client";

import { useEffect, useState } from "react";

interface StepPackagingProps {
  draftId: string;
  next: () => void;
  back: () => void;
}

interface PackagingForm {
  packagingType: string;
  isFragile: boolean;
  temperatureSensitive: boolean;
  storageInstructions: string;
  shelfLifeDays: number;
  bestBefore: string;
}

const PACKAGING_TYPES = ["Pouch", "Bottle", "Carton", "Jar", "Can", "Box", "Sachet"];

// A starting-point default the vendor edits, not a final answer -- keyed by
// storefront category name (case-insensitive substring match), since that's
// the only "what kind of product is this" signal already flowing into the
// wizard by this step.
const STORAGE_DEFAULTS_BY_CATEGORY: [RegExp, string][] = [
  [/oil/i, "Store in a cool, dry place away from direct sunlight. Keep the container tightly sealed after opening."],
  [/mix|dosa|ragi|instant/i, "Store in a cool, dry place in an airtight container. Consume before the best-before date once opened."],
  [/edible/i, "Store in a cool, dry place away from direct sunlight and moisture."],
];

export default function StepPackaging({
  draftId,
  next,
  back,
}: StepPackagingProps) {
  const [form, setForm] = useState<PackagingForm>({
    packagingType: "",
    isFragile: false,
    temperatureSensitive: false,
    storageInstructions: "",
    shelfLifeDays: 0,
    bestBefore: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Was never fetched -- resuming an existing draft (via the "Edit" link on
  // /vendor/products, which previously 404'd outright) reset this whole
  // step back to blank even if it was already filled in and saved.
  useEffect(() => {
    fetch(`/api/vendor-products/${draftId}`)
      .then((r) => r.json())
      .then((d) => {
        const c = d?.data?.compliance;
        const categoryName: string | undefined =
          typeof d?.data?.categoryId === "object" ? d.data.categoryId?.name : undefined;
        const suggestedStorage = !c?.storageInstructions
          ? STORAGE_DEFAULTS_BY_CATEGORY.find(([re]) => categoryName && re.test(categoryName))?.[1] || ""
          : "";
        if (!c) {
          if (suggestedStorage) setForm((prev) => ({ ...prev, storageInstructions: suggestedStorage }));
          return;
        }
        setForm({
          packagingType: c.packagingType || "",
          isFragile: !!c.isFragile,
          temperatureSensitive: !!c.temperatureSensitive,
          storageInstructions: c.storageInstructions || suggestedStorage,
          shelfLifeDays: c.shelfLifeDays || 0,
          bestBefore: c.bestBefore || "",
        });
      })
      .catch(() => {});
  }, [draftId]);

  const handleSave = async () => {
    setError(null);
    try {
      setLoading(true);
      // compliance is a nested sub-object on VendorProduct — merge these
      // fields into it via the generic PUT route (findByIdAndUpdate does a
      // shallow top-level merge, so send the whole compliance object).
      const res = await fetch(`/api/vendor-products/${draftId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          compliance: {
            packagingType: form.packagingType,
            isFragile: form.isFragile,
            temperatureSensitive: form.temperatureSensitive,
            storageInstructions: form.storageInstructions,
            shelfLifeDays: form.shelfLifeDays,
            bestBefore: form.bestBefore,
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        setError(data.message || "Failed to save — please try again");
        return;
      }
      next();
    } catch {
      setError("Failed to connect to server");
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full border rounded p-2";
  const labelClass = "text-xs font-medium text-gray-500";

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Packaging & Storage</h2>
      <p className="text-sm text-gray-500">
        These details help buyers and logistics handle the product correctly
        — especially important for fragile or perishable items.
      </p>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-1">
        <label className={labelClass}>
          Packaging Type <span className="text-gray-400 font-normal">(container this product ships in)</span>
        </label>
        <select
          className={inputClass}
          value={form.packagingType && !PACKAGING_TYPES.includes(form.packagingType) ? "Other" : form.packagingType}
          onChange={(e) => setForm({ ...form, packagingType: e.target.value === "Other" ? " " : e.target.value })}
        >
          <option value="">Select packaging type…</option>
          {PACKAGING_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
          <option value="Other">Other</option>
        </select>
        {form.packagingType && !PACKAGING_TYPES.includes(form.packagingType) && (
          <input
            className={`${inputClass} mt-1`}
            placeholder="Describe the packaging type"
            value={form.packagingType.trim()}
            onChange={(e) => setForm({ ...form, packagingType: e.target.value })}
          />
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={form.isFragile}
            onChange={(e) => setForm({ ...form, isFragile: e.target.checked })}
          />
          Fragile — handle with care
        </label>

        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={form.temperatureSensitive}
            onChange={(e) =>
              setForm({ ...form, temperatureSensitive: e.target.checked })
            }
          />
          Temperature sensitive
        </label>
      </div>

      <div className="flex flex-col gap-1">
        <label className={labelClass}>Storage Instructions</label>
        <textarea
          className={inputClass}
          rows={3}
          placeholder="e.g. Store in a cool, dry place away from sunlight"
          value={form.storageInstructions}
          onChange={(e) =>
            setForm({ ...form, storageInstructions: e.target.value })
          }
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <label className={labelClass}>Shelf Life (days)</label>
          <input
            type="number"
            className={inputClass}
            value={form.shelfLifeDays}
            onFocus={(e) => e.target.select()}
            onChange={(e) =>
              setForm({ ...form, shelfLifeDays: Number(e.target.value) })
            }
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelClass}>Best Before</label>
          <input
            className={inputClass}
            placeholder="e.g. 12 months from manufacture"
            value={form.bestBefore}
            onChange={(e) => setForm({ ...form, bestBefore: e.target.value })}
          />
        </div>
      </div>

      <div className="flex justify-between pt-4">
        <button onClick={back} className="rounded border px-4 py-2">
          Back
        </button>
        <button
          onClick={handleSave}
          disabled={loading}
          className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
        >
          {loading ? "Saving..." : "Save & Continue"}
        </button>
      </div>
    </div>
  );
}
