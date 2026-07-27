import VendorProductBOM from "@/models/VendorProductBOM";
import VendorProduct from "@/models/VendorProduct";

export async function recalcVendorProductCost(
  vendorProductId: string
) {
  const bomItems =
    await VendorProductBOM.find({
      vendorProductId,
      active: true,
    });

  let totalCost = 0;

  for (const item of bomItems) {
    const qty = Number(item.quantity || 0);
    const rate = Number(item.currentRate || 0);
    const wastage =
      Number(item.wastagePercent || 0);

    const baseCost = qty * rate;

    const wastageCost =
      baseCost * (wastage / 100);

    totalCost += baseCost + wastageCost;
  }

  const currentCost = totalCost;

  const safeCost =
    totalCost * 1.1; // +10% buffer

  const worstCost =
    totalCost * 1.25; // +25% risk buffer

  // Was writing calculatedCurrentCost/calculatedSafeCost/calculatedWorstCost
  // -- none of which exist on the VendorProduct schema (it only has a
  // nested calculatedCost: { baseCost, shippingCost, overheadCost,
  // wastageCost, finalCost }). Mongoose silently drops unknown fields, so
  // calculatedCost.finalCost stayed 0 forever regardless of BOM contents,
  // which permanently blocked /submit and /approve (both require
  // finalCost > 0). Write the actual schema fields instead.
  await VendorProduct.findByIdAndUpdate(
    vendorProductId,
    {
      calculatedCost: {
        baseCost: currentCost,
        shippingCost: 0,
        overheadCost: 0,
        wastageCost: worstCost - currentCost,
        finalCost: currentCost,
      },

      // vendorCost is intentionally NOT synced here -- it's the vendor's
      // own manually-entered "Additional Cost, anything not already
      // covered by the BOM" field (StepCommercial.tsx), and Business's
      // vendorCostBasis: "VENDOR_DECLARED" option depends on it staying a
      // real, vendor-typed value. Overwriting it with the BOM total on
      // every BOM save silently discarded whatever the vendor had entered,
      // AND caused pricing/route.ts to double-count the BOM cost (once as
      // materialCost, again as this synced-to-equal-it vendorCost).
    }
  );

  return {
    currentCost,
    safeCost,
    worstCost,
  };
}
