import VendorProduct from "@/models/VendorProduct";
import VendorProductBOM from "@/models/VendorProductBOM";
import MaterialPriceHistory from "@/models/MaterialPriceHistory";
import ProductVariant from "@/models/ProductVariant";

/* =========================================================
GET LATEST MATERIAL RATE
========================================================= */

async function getLatestMaterialRate(
  materialId: string
): Promise<number> {
  const latestPrice =
    (await MaterialPriceHistory.findOne({
      materialId,
      active: true,
    })
      .sort({
        effectiveDate: -1,
        createdAt: -1,
      })
      .lean()) as any;

  return latestPrice?.price ?? 0;
}

/* =========================================================
CALCULATE PRODUCT COST
========================================================= */

export async function calculateVendorProductCost(
  vendorProductId: string
) {
  const bomItems =
    await VendorProductBOM.find({
      vendorProductId,
      active: true,
    });

  let currentCost = 0;

  for (const item of bomItems) {
    const rate =
      await getLatestMaterialRate(
        item.materialId.toString()
      );

    const wastageMultiplier =
      1 + (item.wastagePercent || 0) / 100;

    const itemCost =
      item.quantity *
      rate *
      wastageMultiplier;

    currentCost += itemCost;

    await VendorProductBOM.findByIdAndUpdate(
      item._id,
      {
        currentRate: rate,
        currentCost: itemCost,
      }
    );
  }

  /* ==========================================
     SAFE COST
  ========================================== */

  const safeCost =
    currentCost * 1.05;

  /* ==========================================
     WORST COST
  ========================================== */

  const worstCaseCost =
    currentCost * 1.10;

  /* ==========================================
     UPDATE VENDOR PRODUCT
  ========================================== */

  const vendorProduct =
    await VendorProduct.findByIdAndUpdate(
      vendorProductId,
      {
        calculatedCurrentCost:
          currentCost,

        calculatedSafeCost:
          safeCost,

        calculatedWorstCost:
          worstCaseCost,
      },
      {
        new: true,
      }
    );

  /* ==========================================
     UPDATE LINKED VARIANT
  ========================================== */

  if (vendorProduct?.variantId) {
    await ProductVariant.findByIdAndUpdate(
      vendorProduct.variantId,
      {
        currentCost,

        safeCost,

        worstCaseCost,
      }
    );
  }

  return {
    currentCost,
    safeCost,
    worstCaseCost,
  };
}

/* =========================================================
RECALCULATE ALL PRODUCTS
========================================================= */

export async function recalculateAllVendorProducts() {
  const vendorProducts =
    await VendorProduct.find({
      active: true,
    });

  const results = [];

  for (const product of vendorProducts) {
    const cost =
      await calculateVendorProductCost(
        product._id.toString()
      );

    results.push({
      vendorProductId:
        product._id,
      ...cost,
    });
  }

  return results;
}
