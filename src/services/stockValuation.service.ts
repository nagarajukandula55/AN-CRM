import StockLedger from "@/models/StockLedger";
import mongoose from "mongoose";

/* =========================================================
🧠 INTERNAL: SAFE OBJECTID CONVERTER
========================================================= */
function toObjectId(id: any) {
  return new mongoose.Types.ObjectId(id);
}

/* =========================================================
📊 CORE: STOCK + VALUATION (MOVING AVERAGE MODEL)
========================================================= */
export async function getStockValuation(payload: any) {
  const { businessId, materialId, warehouseId } = payload;

  const match: any = {};

  if (businessId) match.businessId = toObjectId(businessId);
  if (materialId) match.materialId = toObjectId(materialId);
  if (warehouseId) match.warehouseId = toObjectId(warehouseId);

  const result = await StockLedger.aggregate([
    { $match: match },

    /* =========================================================
    🧮 GROUP STOCK MOVEMENTS
    ========================================================= */
    {
      $group: {
        _id: {
          materialId: "$materialId",
          warehouseId: "$warehouseId",
        },

        totalInQty: {
          $sum: {
            $cond: [{ $eq: ["$type", "IN"] }, "$quantity", 0],
          },
        },

        totalOutQty: {
          $sum: {
            $cond: [{ $eq: ["$type", "OUT"] }, "$quantity", 0],
          },
        },

        totalInValue: {
          $sum: {
            $cond: [
              { $eq: ["$type", "IN"] },
              { $multiply: ["$quantity", "$rate"] },
              0,
            ],
          },
        },
      },
    },

    /* =========================================================
    📦 FINAL CALCULATION
    ========================================================= */
    {
      $project: {
        _id: 0,

        materialId: "$_id.materialId",
        warehouseId: "$_id.warehouseId",

        availableStock: {
          $subtract: ["$totalInQty", "$totalOutQty"],
        },

        avgCost: {
          $cond: [
            { $gt: ["$totalInQty", 0] },
            { $divide: ["$totalInValue", "$totalInQty"] },
            0,
          ],
        },

        totalInQty: 1,
        totalOutQty: 1,
      },
    },
  ]);

  return result;
}

/* =========================================================
📦 SINGLE MATERIAL VALUATION
========================================================= */
export async function getMaterialValuation(payload: any) {
  const data = await getStockValuation(payload);

  if (!data.length) {
    return {
      materialId: payload.materialId,
      warehouseId: payload.warehouseId,
      availableStock: 0,
      avgCost: 0,
      totalValue: 0,
    };
  }

  const row = data[0];

  return {
    ...row,
    totalValue: row.availableStock * row.avgCost,
  };
}

/* =========================================================
🏭 FULL INVENTORY VALUATION (DASHBOARD READY)
========================================================= */
export async function getInventoryValuation(payload: any) {
  const data = await getStockValuation(payload);

  let totalInventoryValue = 0;

  const items = data.map((item: any) => {
    const value = item.availableStock * item.avgCost;
    totalInventoryValue += value;

    return {
      ...item,
      totalValue: value,
    };
  });

  return {
    totalInventoryValue,
    items,
  };
}

/* =========================================================
📊 WAREHOUSE WISE VALUATION
========================================================= */
export async function getWarehouseValuation(payload: any) {
  const { businessId } = payload;

  const match: any = {};

  if (businessId) match.businessId = toObjectId(businessId);

  const result = await StockLedger.aggregate([
    { $match: match },

    {
      $group: {
        _id: {
          warehouseId: "$warehouseId",
        },

        totalInQty: {
          $sum: {
            $cond: [{ $eq: ["$type", "IN"] }, "$quantity", 0],
          },
        },

        totalOutQty: {
          $sum: {
            $cond: [{ $eq: ["$type", "OUT"] }, "$quantity", 0],
          },
        },

        totalInValue: {
          $sum: {
            $cond: [
              { $eq: ["$type", "IN"] },
              { $multiply: ["$quantity", "$rate"] },
              0,
            ],
          },
        },
      },
    },

    {
      $project: {
        _id: 0,
        warehouseId: "$_id.warehouseId",

        availableStock: {
          $subtract: ["$totalInQty", "$totalOutQty"],
        },

        avgCost: {
          $cond: [
            { $gt: ["$totalInQty", 0] },
            { $divide: ["$totalInValue", "$totalInQty"] },
            0,
          ],
        },

        totalValue: {
          $multiply: [
            { $subtract: ["$totalInQty", "$totalOutQty"] },
            {
              $cond: [
                { $gt: ["$totalInQty", 0] },
                { $divide: ["$totalInValue", "$totalInQty"] },
                0,
              ],
            },
          ],
        },
      },
    },
  ]);

  return result;
}
