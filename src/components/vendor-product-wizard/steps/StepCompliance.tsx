"use client";

import { useEffect, useRef, useState } from "react";
import { estimateNutritionFromBOM, type NutritionEstimate } from "@/lib/nutritionReference";

interface StepComplianceProps {
  draftId: string;
  next: () => void;
  back: () => void;
}

interface ComplianceForm {
  ingredients: string; // comma-separated in the UI, split to array on save
  allergens: string;
  warnings: string;
  usageInstructions: string;
  servingSize: number;
  energy: number;
  protein: number;
  carbs: number;
  sugars: number;
  fat: number;
  sodium: number;
}

function toList(csv: string): string[] {
  return csv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

interface BomIngredient {
  materialName: string;
  quantity: number;
  unit: string;
  percent: number;
}

// Common allergen keywords -> the label to warn on -- a heuristic first
// pass matched against ingredient/material NAMES, not a certified allergen
// database. Always surfaced as a suggestion for the vendor to confirm or
// remove below, never saved silently.
const ALLERGEN_KEYWORDS: [RegExp, string][] = [
  [/milk|dairy|butter|ghee|paneer|curd|yog(h)?urt|cream|cheese/i, "Milk"],
  [/wheat|maida|atta|gluten|semolina|suji/i, "Gluten"],
  [/peanut|groundnut/i, "Peanuts"],
  [/cashew|almond|walnut|pistachio|nuts?\b/i, "Tree nuts"],
  [/soy(a)?/i, "Soy"],
  [/egg/i, "Egg"],
  [/mustard/i, "Mustard"],
  [/sesame|til\b/i, "Sesame"],
];

// Standard "Contains ..." warning line per detected allergen -- generated
// the same way the allergen suggestions themselves are (a suggestion for
// the vendor to confirm/edit, never saved without the field being visible
// and editable).
const ALLERGEN_WARNING: Record<string, string> = {
  Milk: "Contains milk",
  Gluten: "Contains gluten",
  Peanuts: "Contains peanuts",
  "Tree nuts": "Contains tree nuts",
  Soy: "Contains soy",
  Egg: "Contains egg",
  Mustard: "Contains mustard",
  Sesame: "Contains sesame",
};

export default function StepCompliance({
  draftId,
  next,
  back,
}: StepComplianceProps) {
  const [form, setForm] = useState<ComplianceForm>({
    ingredients: "",
    allergens: "",
    warnings: "",
    usageInstructions: "",
    servingSize: 0,
    energy: 0,
    protein: 0,
    carbs: 0,
    sugars: 0,
    fat: 0,
    sodium: 0,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bomIngredients, setBomIngredients] = useState<BomIngredient[]>([]);
  const [allergenSuggestions, setAllergenSuggestions] = useState<string[]>([]);
  const [nutritionEstimate, setNutritionEstimate] = useState<NutritionEstimate | null>(null);
  const [nutritionApplied, setNutritionApplied] = useState(false);
  const [productLabel, setProductLabel] = useState("");
  const [downloading, setDownloading] = useState(false);
  const labelRef = useRef<HTMLDivElement>(null);

  // Was never fetched -- resuming an existing draft reset this whole step
  // back to blank even if it was already filled in and saved.
  useEffect(() => {
    fetch(`/api/vendor-products/${draftId}`)
      .then((r) => r.json())
      .then((d) => {
        setProductLabel([d?.data?.productName, d?.data?.variantName].filter(Boolean).join(" — "));
        const c = d?.data?.compliance;
        const n = d?.data?.nutrition;
        if (n?.energy) setNutritionApplied(true);
        if (!c && !n) return;
        setForm({
          ingredients: (c?.ingredients || []).join(", "),
          allergens: (c?.allergens || []).join(", "),
          warnings: (c?.warnings || []).join(", "),
          usageInstructions: c?.usageInstructions || "",
          servingSize: n?.servingSize || 0,
          energy: n?.energy || 0,
          protein: n?.protein || 0,
          carbs: n?.carbs || 0,
          sugars: n?.sugars || 0,
          fat: n?.fat || 0,
          sodium: n?.sodium || 0,
        });
      })
      .catch(() => {});
  }, [draftId]);

  // Suggest ingredients + their composition % from the BOM's INGREDIENT-
  // classified rows (packaging/other rows excluded via materialType, set
  // in the BOM step) -- percent is quantity-share within the ingredient
  // rows, which only means something if those quantities share a common
  // unit (typical for a single recipe); shown as a rough composition
  // breakdown for the vendor to sanity-check, not a certified figure.
  // Also suggests allergen warnings from ingredient names against a
  // common-keyword list -- always just a suggestion, never saved
  // automatically.
  useEffect(() => {
    fetch(`/api/vendor-products/${draftId}/bom`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.success || !Array.isArray(d.data) || !d.data.length) return;
        const ingredientRows = d.data.filter((item: any) => (item.materialType || "INGREDIENT") === "INGREDIENT");
        const totalQty = ingredientRows.reduce((sum: number, item: any) => sum + (item.quantity || 0), 0);
        const breakdown: BomIngredient[] = ingredientRows.map((item: any) => ({
          materialName: item.materialName || "",
          quantity: item.quantity || 0,
          unit: item.unit || "",
          percent: totalQty > 0 ? ((item.quantity || 0) / totalQty) * 100 : 0,
        }));
        setBomIngredients(breakdown);

        if (!form.ingredients && breakdown.length) {
          setForm((prev) => ({ ...prev, ingredients: breakdown.map((b) => b.materialName).filter(Boolean).join(", ") }));
        }

        setNutritionEstimate(estimateNutritionFromBOM(breakdown));

        const matched = new Set<string>();
        for (const { materialName } of breakdown) {
          for (const [re, label] of ALLERGEN_KEYWORDS) {
            if (re.test(materialName)) matched.add(label);
          }
        }
        const suggestions = Array.from(matched);
        setAllergenSuggestions(suggestions);

        // Auto-fill directly (same as ingredients above) instead of only
        // showing a banner that required a separate "Apply" click -- the
        // field is still fully editable free text after this, just no
        // longer starts empty when a real match was found.
        if (!form.allergens && suggestions.length) {
          setForm((prev) => ({ ...prev, allergens: suggestions.join(", ") }));
        }

        // Derive "Contains X" warning lines from the same allergen matches
        // -- Warnings previously had no auto-generation at all and had to
        // be typed by hand every time. Same rule as allergens/ingredients
        // above: only fills the field when it's still empty, never
        // overwrites something the vendor already wrote.
        const warningSuggestions = suggestions.map((label) => ALLERGEN_WARNING[label]).filter(Boolean);
        if (!form.warnings && warningSuggestions.length) {
          setForm((prev) => ({ ...prev, warnings: warningSuggestions.join(", ") }));
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId]);

  function applyAllergenSuggestions() {
    const current = toList(form.allergens);
    const merged = Array.from(new Set([...current, ...allergenSuggestions]));
    setForm((prev) => ({ ...prev, allergens: merged.join(", ") }));
  }

  // Scales the per-100g estimate to whatever Serving Size the vendor has
  // set (defaults to 100g if unset) and fills the nutrition fields --
  // never overwrites a value the vendor already has, only fills gaps.
  function applyNutritionEstimate() {
    if (!nutritionEstimate) return;
    const servingSize = form.servingSize || 100;
    const factor = servingSize / 100;
    setForm((prev) => ({
      ...prev,
      servingSize,
      energy: prev.energy || Math.round(nutritionEstimate.per100g.energy * factor),
      protein: prev.protein || Math.round(nutritionEstimate.per100g.protein * factor * 10) / 10,
      carbs: prev.carbs || Math.round(nutritionEstimate.per100g.carbs * factor * 10) / 10,
      sugars: prev.sugars || Math.round(nutritionEstimate.per100g.sugars * factor * 10) / 10,
      fat: prev.fat || Math.round(nutritionEstimate.per100g.fat * factor * 10) / 10,
      sodium: prev.sodium || Math.round(nutritionEstimate.per100g.sodium * factor),
    }));
    setNutritionApplied(true);
  }

  async function downloadNutritionLabel() {
    if (!labelRef.current) return;
    setDownloading(true);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);
      const canvas = await html2canvas(labelRef.current, { scale: 3, backgroundColor: "#ffffff" });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ unit: "pt", format: [canvas.width / 3, canvas.height / 3] });
      pdf.addImage(imgData, "PNG", 0, 0, canvas.width / 3, canvas.height / 3);
      pdf.save(`${(productLabel || "product").replace(/[^a-z0-9]+/gi, "-")}-nutrition-label.pdf`);
    } catch {
      setError("Failed to generate the label PDF — please try again");
    } finally {
      setDownloading(false);
    }
  }

  const handleSave = async () => {
    setError(null);
    try {
      setLoading(true);
      const res = await fetch(`/api/vendor-products/${draftId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          compliance: {
            ingredients: toList(form.ingredients),
            allergens: toList(form.allergens),
            warnings: toList(form.warnings),
            usageInstructions: form.usageInstructions,
          },
          nutrition: {
            servingSize: form.servingSize,
            energy: form.energy,
            protein: form.protein,
            carbs: form.carbs,
            sugars: form.sugars,
            fat: form.fat,
            sodium: form.sodium,
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
      <h2 className="text-xl font-semibold">Compliance & Nutrition</h2>
      <p className="text-sm text-gray-500">
        Required for food/FMCG products — buyers and regulators rely on
        accurate ingredient and allergen information.
      </p>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-1">
        <label className={labelClass}>
          Ingredients (comma-separated){" "}
          <span className="text-gray-400 font-normal">
            (suggested from your BOM's Ingredient-classified materials — review and edit before continuing)
          </span>
        </label>
        <textarea
          className={inputClass}
          rows={2}
          placeholder="Wheat flour, Sugar, Vegetable oil, Salt"
          value={form.ingredients}
          onChange={(e) => setForm({ ...form, ingredients: e.target.value })}
        />
      </div>

      {bomIngredients.length > 0 && (
        <div className="rounded border bg-gray-50 p-3">
          <p className="text-xs font-semibold text-gray-600 mb-2">
            Composition breakdown (from BOM quantities)
          </p>
          <div className="space-y-1">
            {bomIngredients
              .slice()
              .sort((a, b) => b.percent - a.percent)
              .map((b) => (
                <div key={b.materialName} className="flex items-center gap-2 text-sm">
                  <span className="flex-1 text-gray-700">{b.materialName}</span>
                  <span className="w-32 h-2 rounded bg-gray-200 overflow-hidden">
                    <span className="block h-full bg-blue-500" style={{ width: `${Math.min(100, b.percent)}%` }} />
                  </span>
                  <span className="w-14 text-right font-mono text-xs text-gray-500">{b.percent.toFixed(1)}%</span>
                </div>
              ))}
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Ingredients only — packaging/other BOM materials are excluded. Approximate, and only accurate if your BOM quantities share a common unit.
          </p>
        </div>
      )}

      {allergenSuggestions.length > 0 && (
        <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm flex items-center justify-between gap-3">
          <p className="text-amber-800">
            Possible allergens detected from ingredient names: <strong>{allergenSuggestions.join(", ")}</strong>
          </p>
          <button
            type="button"
            onClick={applyAllergenSuggestions}
            className="shrink-0 rounded border border-amber-400 bg-white px-3 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100"
          >
            Add to Allergens
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <label className={labelClass}>Allergens (comma-separated)</label>
          <input
            className={inputClass}
            placeholder="Milk, Nuts, Gluten"
            value={form.allergens}
            onChange={(e) => setForm({ ...form, allergens: e.target.value })}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelClass}>Warnings (comma-separated)</label>
          <input
            className={inputClass}
            placeholder="Contains traces of soy"
            value={form.warnings}
            onChange={(e) => setForm({ ...form, warnings: e.target.value })}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className={labelClass}>Usage Instructions</label>
        <textarea
          className={inputClass}
          rows={2}
          value={form.usageInstructions}
          onChange={(e) =>
            setForm({ ...form, usageInstructions: e.target.value })
          }
        />
      </div>

      <h3 className="text-sm font-semibold text-gray-700 pt-2">
        Nutrition (per serving)
      </h3>

      {nutritionEstimate && nutritionEstimate.totalGrams > 0 && !nutritionApplied && (
        <div className="rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm flex items-center justify-between gap-3">
          <p className="text-emerald-800">
            Nutrition estimated from {nutritionEstimate.matched.length} matched BOM ingredient
            {nutritionEstimate.matched.length !== 1 ? "s" : ""} against standard food-composition
            reference values{nutritionEstimate.unmatched.length > 0 && (
              <> ({nutritionEstimate.unmatched.length} unmatched: {nutritionEstimate.unmatched.join(", ")} — enter those manually)</>
            )}.
          </p>
          <button
            type="button"
            onClick={applyNutritionEstimate}
            className="shrink-0 rounded border border-emerald-400 bg-white px-3 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
          >
            Fill In Estimate
          </button>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        {(
          [
            ["servingSize", "Serving Size (g)"],
            ["energy", "Energy (kcal)"],
            ["protein", "Protein (g)"],
            ["carbs", "Carbs (g)"],
            ["sugars", "Sugars (g)"],
            ["fat", "Fat (g)"],
            ["sodium", "Sodium (mg)"],
          ] as [keyof ComplianceForm, string][]
        ).map(([key, label]) => (
          <div key={key} className="flex flex-col gap-1">
            <label className={labelClass}>{label}</label>
            <input
              type="number"
              className={inputClass}
              value={form[key] as number}
              onFocus={(e) => e.target.select()}
              onChange={(e) =>
                setForm({ ...form, [key]: Number(e.target.value) })
              }
            />
          </div>
        ))}
      </div>

      {form.energy > 0 && (
        <div>
          <button
            type="button"
            onClick={downloadNutritionLabel}
            disabled={downloading}
            className="rounded border border-gray-400 px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            {downloading ? "Generating…" : "Download Nutrition Label (PDF)"}
          </button>
          <p className="text-xs text-gray-400 mt-1">
            Generates a print-ready Nutrition Facts panel for your product's back label, from the values above.
          </p>

          {/* Off-screen, rendered only for the PDF capture above -- not part of the visible form. */}
          <div className="fixed -left-[9999px] top-0" aria-hidden="true">
            <div ref={labelRef} className="w-[320px] border-2 border-black bg-white p-3 font-sans text-black">
              <p className="text-lg font-extrabold border-b-4 border-black pb-1">Nutrition Facts</p>
              {productLabel && <p className="text-xs font-semibold pb-1 border-b border-gray-400">{productLabel}</p>}
              <p className="text-xs py-1 border-b border-gray-400">Serving Size: {form.servingSize || 100} g</p>
              <div className="py-1 border-b-8 border-black">
                <p className="text-sm font-bold">Amount Per Serving</p>
                <div className="flex justify-between text-xl font-extrabold">
                  <span>Calories</span>
                  <span>{Math.round(form.energy)}</span>
                </div>
              </div>
              {(
                [
                  ["Total Fat", form.fat, "g"],
                  ["Sodium", form.sodium, "mg"],
                  ["Total Carbohydrate", form.carbs, "g"],
                  ["  Sugars", form.sugars, "g"],
                  ["Protein", form.protein, "g"],
                ] as [string, number, string][]
              ).map(([label, value, unit]) => (
                <div key={label} className="flex justify-between text-sm py-0.5 border-b border-gray-300">
                  <span className={label.startsWith("  ") ? "pl-3 text-gray-700" : "font-semibold"}>{label.trim()}</span>
                  <span className="font-semibold">{value}{unit}</span>
                </div>
              ))}
              {toList(form.allergens).length > 0 && (
                <p className="text-xs pt-2 font-semibold">Allergens: {toList(form.allergens).join(", ")}</p>
              )}
              {toList(form.ingredients).length > 0 && (
                <p className="text-[10px] pt-2 text-gray-700">Ingredients: {toList(form.ingredients).join(", ")}</p>
              )}
              <p className="text-[9px] pt-2 text-gray-400">
                Values are estimates based on standard ingredient composition — verify against lab-tested data before regulatory submission.
              </p>
            </div>
          </div>
        </div>
      )}

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
