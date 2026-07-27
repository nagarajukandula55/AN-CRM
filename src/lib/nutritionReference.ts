/**
 * Standard nutrition-per-100g reference values for common Indian grocery/
 * FMCG ingredients, used to auto-estimate a product's nutrition panel from
 * its BOM composition. These are typical/standard food-composition figures
 * (the kind found in USDA/IFCT-style tables), NOT lab-tested values for any
 * specific vendor's actual raw material -- always shown as an estimate the
 * vendor should verify (or replace with real lab data) before printing on
 * packaging, since food labeling accuracy is a regulatory requirement.
 */

export interface NutritionPer100g {
  energy: number; // kcal
  protein: number; // g
  carbs: number; // g
  sugars: number; // g
  fat: number; // g
  sodium: number; // mg
}

// Ordered most-specific-first -- first regex match wins, so "groundnut oil"
// matches the oil entry before the generic "groundnut" (peanut) entry.
export const NUTRITION_REFERENCE: [RegExp, string, NutritionPer100g][] = [
  [/groundnut oil|peanut oil/i, "Groundnut Oil", { energy: 884, protein: 0, carbs: 0, sugars: 0, fat: 100, sodium: 0 }],
  [/sunflower oil/i, "Sunflower Oil", { energy: 884, protein: 0, carbs: 0, sugars: 0, fat: 100, sodium: 0 }],
  [/coconut oil/i, "Coconut Oil", { energy: 862, protein: 0, carbs: 0, sugars: 0, fat: 100, sodium: 0 }],
  [/sesame oil|gingelly oil/i, "Sesame Oil", { energy: 884, protein: 0, carbs: 0, sugars: 0, fat: 100, sodium: 0 }],
  [/olive oil/i, "Olive Oil", { energy: 884, protein: 0, carbs: 0, sugars: 0, fat: 100, sodium: 2 }],
  [/mustard oil/i, "Mustard Oil", { energy: 884, protein: 0, carbs: 0, sugars: 0, fat: 100, sodium: 0 }],
  [/cold press(ed)? oil|vegetable oil|edible oil/i, "Edible Oil", { energy: 884, protein: 0, carbs: 0, sugars: 0, fat: 100, sodium: 0 }],
  [/groundnut|peanut/i, "Groundnut / Peanut", { energy: 567, protein: 25.8, carbs: 16.1, sugars: 4, fat: 49.2, sodium: 18 }],
  [/wheat flour|atta|maida/i, "Wheat Flour", { energy: 340, protein: 12, carbs: 72, sugars: 2, fat: 1.5, sodium: 5 }],
  [/rice flour/i, "Rice Flour", { energy: 366, protein: 6, carbs: 80, sugars: 0.1, fat: 1.4, sodium: 2 }],
  [/\brice\b/i, "Rice", { energy: 345, protein: 7, carbs: 78, sugars: 0.5, fat: 0.5, sodium: 5 }],
  [/ragi|finger millet/i, "Ragi (Finger Millet)", { energy: 328, protein: 7.3, carbs: 72, sugars: 1, fat: 1.3, sodium: 11 }],
  [/besan|gram flour|chickpea flour/i, "Besan (Gram Flour)", { energy: 387, protein: 22, carbs: 58, sugars: 11, fat: 6.7, sodium: 11 }],
  [/semolina|suji|rava/i, "Semolina (Suji/Rava)", { energy: 360, protein: 12.7, carbs: 72.8, sugars: 0, fat: 1, sodium: 1 }],
  [/urad dal|black gram/i, "Urad Dal", { energy: 341, protein: 25, carbs: 59, sugars: 2, fat: 1.6, sodium: 38 }],
  [/toor dal|arhar dal|pigeon pea/i, "Toor / Arhar Dal", { energy: 343, protein: 22, carbs: 63, sugars: 3, fat: 1.4, sodium: 17 }],
  [/moong dal|green gram/i, "Moong Dal", { energy: 347, protein: 24, carbs: 63, sugars: 2.7, fat: 1.2, sodium: 15 }],
  [/chana dal|bengal gram/i, "Chana Dal", { energy: 364, protein: 20, carbs: 61, sugars: 6, fat: 5.6, sodium: 24 }],
  [/jaggery|gur\b/i, "Jaggery", { energy: 383, protein: 0.4, carbs: 98, sugars: 90, fat: 0.1, sodium: 40 }],
  [/honey/i, "Honey", { energy: 304, protein: 0.3, carbs: 82, sugars: 82, fat: 0, sodium: 4 }],
  [/\bsugar\b/i, "Sugar", { energy: 387, protein: 0, carbs: 100, sugars: 100, fat: 0, sodium: 1 }],
  [/\bsalt\b/i, "Salt", { energy: 0, protein: 0, carbs: 0, sugars: 0, fat: 0, sodium: 38758 }],
  [/ghee/i, "Ghee", { energy: 900, protein: 0, carbs: 0, sugars: 0, fat: 100, sodium: 2 }],
  [/butter/i, "Butter", { energy: 717, protein: 0.9, carbs: 0.1, sugars: 0.1, fat: 81, sodium: 11 }],
  [/curd|yog(h)?urt/i, "Curd / Yogurt", { energy: 61, protein: 3.5, carbs: 4.7, sugars: 4.7, fat: 3.3, sodium: 36 }],
  [/\bmilk\b/i, "Milk", { energy: 61, protein: 3.2, carbs: 4.8, sugars: 5, fat: 3.3, sodium: 44 }],
  [/turmeric/i, "Turmeric Powder", { energy: 312, protein: 8, carbs: 65, sugars: 3, fat: 3.3, sodium: 27 }],
  [/chil(l)?i powder|red chilli/i, "Chilli Powder", { energy: 282, protein: 13, carbs: 50, sugars: 8, fat: 14, sodium: 43 }],
  [/cumin|jeera/i, "Cumin (Jeera)", { energy: 375, protein: 18, carbs: 44, sugars: 2, fat: 22, sodium: 168 }],
  [/coriander powder|dhania/i, "Coriander Powder", { energy: 298, protein: 12, carbs: 55, sugars: 0, fat: 17.8, sodium: 35 }],
  [/mustard seed/i, "Mustard Seeds", { energy: 508, protein: 26, carbs: 28, sugars: 6.8, fat: 36, sodium: 13 }],
  [/curry leaves/i, "Curry Leaves", { energy: 108, protein: 6, carbs: 18, sugars: 0, fat: 1, sodium: 30 }],
  [/sesame|til\b/i, "Sesame Seeds", { energy: 573, protein: 17.7, carbs: 23.5, sugars: 0.3, fat: 50, sodium: 11 }],
  [/cashew/i, "Cashew", { energy: 553, protein: 18, carbs: 30, sugars: 6, fat: 44, sodium: 12 }],
  [/almond/i, "Almond", { energy: 579, protein: 21, carbs: 22, sugars: 4.4, fat: 50, sodium: 1 }],
  [/baking soda/i, "Baking Soda", { energy: 0, protein: 0, carbs: 0, sugars: 0, fat: 0, sodium: 27360 }],
  [/vinegar/i, "Vinegar", { energy: 18, protein: 0, carbs: 0.4, sugars: 0.4, fat: 0, sodium: 2 }],
  [/\bwater\b/i, "Water", { energy: 0, protein: 0, carbs: 0, sugars: 0, fat: 0, sodium: 0 }],
];

export function lookupNutrition(ingredientName: string): { label: string; value: NutritionPer100g } | null {
  for (const [re, label, value] of NUTRITION_REFERENCE) {
    if (re.test(ingredientName)) return { label, value };
  }
  return null;
}

/** Rough gram-equivalent of a BOM quantity — treats l/ml as 1g≈1ml (fine for
 * oils/liquids at this level of estimate), and returns null for units that
 * can't be converted to a weight at all (pcs, pack, box, dozen). */
export function toGrams(quantity: number, unit: string): number | null {
  const u = unit.trim().toLowerCase();
  if (u === "kg") return quantity * 1000;
  if (u === "g") return quantity;
  if (u === "l") return quantity * 1000;
  if (u === "ml") return quantity;
  return null;
}

export interface NutritionEstimate {
  per100g: NutritionPer100g;
  matched: { name: string; referenceLabel: string; grams: number }[];
  unmatched: string[];
  totalGrams: number;
}

/** Estimates whole-product nutrition-per-100g from a set of BOM ingredient
 * rows (name/quantity/unit). Ingredients with an unconvertible unit or no
 * reference match are skipped from the weighted sum and listed separately
 * so the vendor knows what still needs a manual figure. */
export function estimateNutritionFromBOM(
  rows: { materialName: string; quantity: number; unit: string }[]
): NutritionEstimate {
  const matched: NutritionEstimate["matched"] = [];
  const unmatched: string[] = [];
  const totals: NutritionPer100g = { energy: 0, protein: 0, carbs: 0, sugars: 0, fat: 0, sodium: 0 };
  let totalGrams = 0;

  for (const row of rows) {
    const grams = toGrams(row.quantity, row.unit);
    const ref = row.materialName ? lookupNutrition(row.materialName) : null;
    if (grams === null || !ref) {
      if (row.materialName) unmatched.push(row.materialName);
      continue;
    }
    matched.push({ name: row.materialName, referenceLabel: ref.label, grams });
    totalGrams += grams;
    const factor = grams / 100;
    totals.energy += ref.value.energy * factor;
    totals.protein += ref.value.protein * factor;
    totals.carbs += ref.value.carbs * factor;
    totals.sugars += ref.value.sugars * factor;
    totals.fat += ref.value.fat * factor;
    totals.sodium += ref.value.sodium * factor;
  }

  const per100g: NutritionPer100g =
    totalGrams > 0
      ? {
          energy: (totals.energy / totalGrams) * 100,
          protein: (totals.protein / totalGrams) * 100,
          carbs: (totals.carbs / totalGrams) * 100,
          sugars: (totals.sugars / totalGrams) * 100,
          fat: (totals.fat / totalGrams) * 100,
          sodium: (totals.sodium / totalGrams) * 100,
        }
      : { energy: 0, protein: 0, carbs: 0, sugars: 0, fat: 0, sodium: 0 };

  return { per100g, matched, unmatched, totalGrams };
}
