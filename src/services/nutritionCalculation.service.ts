import VendorProductBOM from "@/models/VendorProductBOM";
import Material from "@/models/Material";

import {
  convertQuantity,
} from "./unitConversion.service";

/* =========================================================
   CALCULATE PRODUCT NUTRITION
========================================================= */

export async function calculateProductNutrition(
  vendorProductId: string
) {
  const bomItems = await VendorProductBOM.find({
    vendorProductId,
    active: true,
  });

  const nutrition = {
    energy: 0,
    protein: 0,
    carbs: 0,

    sugars: 0,
    addedSugars: 0,

    fat: 0,
    saturatedFat: 0,
    transFat: 0,

    fiber: 0,

    sodium: 0,
    calcium: 0,
    iron: 0,
    potassium: 0,
  };

  let totalWeight = 0;

  for (const item of bomItems) {
    // Only ingredient-classified BOM rows contribute -- packaging/other
    // rows (pouches, labels, cartons) were previously included whenever
    // the underlying Material happened to default isNutritionalMaterial
    // to true, silently pulling packaging into the nutrition totals.
    if ((item.materialType || "INGREDIENT") !== "INGREDIENT") {
      continue;
    }

    const material: any = await Material.findById(
      item.materialId
    ).lean();

    if (!material) continue;

    if (!material.isNutritionalMaterial) {
      continue;
    }

    /* =====================================
       Convert Ingredient Qty → GM
    ===================================== */

    const qtyInGM = convertQuantity(
      item.quantity,
      item.unit,
      "GM"
    );

    totalWeight += qtyInGM;

    const factor = qtyInGM / 100;

    nutrition.energy +=
      (material.nutrition?.energy ?? 0) * factor;

    nutrition.protein +=
      (material.nutrition?.protein ?? 0) * factor;

    nutrition.carbs +=
      (material.nutrition?.carbs ?? 0) * factor;

    nutrition.sugars +=
      (material.nutrition?.sugars ?? 0) * factor;

    nutrition.addedSugars +=
      (material.nutrition?.addedSugars ?? 0) * factor;

    nutrition.fat +=
      (material.nutrition?.fat ?? 0) * factor;

    nutrition.saturatedFat +=
      (material.nutrition?.saturatedFat ?? 0) * factor;

    nutrition.transFat +=
      (material.nutrition?.transFat ?? 0) * factor;

    nutrition.fiber +=
      (material.nutrition?.fiber ?? 0) * factor;

    nutrition.sodium +=
      (material.nutrition?.sodium ?? 0) * factor;

    nutrition.calcium +=
      (material.nutrition?.calcium ?? 0) * factor;

    nutrition.iron +=
      (material.nutrition?.iron ?? 0) * factor;

    nutrition.potassium +=
      (material.nutrition?.potassium ?? 0) * factor;
  }

  return {
    totalWeight,
    nutrition,
  };
}
