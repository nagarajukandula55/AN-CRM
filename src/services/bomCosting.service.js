import MaterialPrice from "@/models/MaterialPrice";

export async function calculateBOMCost(
  bom
) {
  let current = 0;
  let safe = 0;
  let worst = 0;

  for (const item of bom.items) {
    const price =
      await MaterialPrice.findOne({
        materialId:
          item.materialId,
      });

    if (!price) continue;

    current +=
      item.quantity *
      price.currentPrice;

    safe +=
      item.quantity *
      price.highestPrice;

    worst +=
      item.quantity *
      price.worstCasePrice;
  }

  return {
    current,
    safe,
    worst,
  };
}
