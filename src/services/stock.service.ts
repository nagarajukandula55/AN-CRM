import StockLedger from "@/models/StockLedger";
import mongoose from "mongoose";

/* =========================================================
🧠 INTERNAL: NORMALIZE ID
========================================================= */
function toObjectId(id: any) {
  return new mongoose.Types.ObjectId(id);
}

/* =========================================================
📥 STOCK IN (GRN → STOCK IN)
========================================================= */
export async function stockIn(payload: any) {
  const {
    businessId,
    materialId,
    warehouseId,
    quantity,
    rate = 0,
    referenceId,
    createdBy,
  } = payload;

  if (!materialId || !warehouseId || !quantity) {
    throw new Error("materialId, warehouseId, quantity required");
  }

  return StockLedger.create({
    businessId,
    materialId,
    warehouseId,
    type: "IN",
    quantity,
    rate,
    referenceType: "GRN",
    referenceId,
    createdBy,
  });
}

/* =========================================================
📤 STOCK OUT (SALES / CONSUMPTION)
========================================================= */
export async function stockOut(payload: any) {
  const {
    businessId,
    materialId,
    warehouseId,
    quantity,
    referenceType = "SALES",
    referenceId,
    createdBy,
  } = payload;

  if (!materialId || !warehouseId || !quantity) {
    throw new Error("materialId, warehouseId, quantity required");
  }

  /* ================= CHECK STOCK BEFORE OUT ================= */
  const current = await getCurrentStock({
    materialId,
    warehouseId,
  });

  if (current.availableStock < quantity) {
    throw new Error(
      `Insufficient stock. Available: ${current.availableStock}, Requested: ${quantity}`
    );
  }

  return StockLedger.create({
    businessId,
    materialId,
    warehouseId,
    type: "OUT",
    quantity,
    referenceType,
    referenceId,
    createdBy,
  });
}

/* =========================================================
📊 GET CURRENT STOCK (FAST + SAFE AGGREGATION)
========================================================= */
export async function getCurrentStock(payload: any) {
  const { materialId, warehouseId } = payload;

  if (!materialId || !warehouseId) {
    throw new Error("materialId and warehouseId required");
  }

  const result = await StockLedger.aggregate([
    {
      $match: {
        materialId: toObjectId(materialId),
        warehouseId: toObjectId(warehouseId),
      },
    },
    {
      $group: {
        _id: {
          materialId: "$materialId",
          warehouseId: "$warehouseId",
        },
        totalIn: {
          $sum: {
            $cond: [{ $eq: ["$type", "IN"] }, "$quantity", 0],
          },
        },
        totalOut: {
          $sum: {
            $cond: [{ $eq: ["$type", "OUT"] }, "$quantity", 0],
          },
        },
      },
    },
    {
      $project: {
        _id: 0,
        materialId: "$_id.materialId",
        warehouseId: "$_id.warehouseId",
        availableStock: {
          $subtract: ["$totalIn", "$totalOut"],
        },
      },
    },
  ]);

  return (
    result[0] || {
      materialId,
      warehouseId,
      availableStock: 0,
    }
  );
}

/* =========================================================
📦 STOCK SUMMARY (ALL MATERIALS - DASHBOARD READY)
========================================================= */
export async function getStockSummary(filter: any = {}) {
  const match: any = {};

  if (filter.businessId) {
    match.businessId = toObjectId(filter.businessId);
  }

  if (filter.warehouseId) {
    match.warehouseId = toObjectId(filter.warehouseId);
  }

  const result = await StockLedger.aggregate([
    { $match: match },
    {
      $group: {
        _id: {
          materialId: "$materialId",
          warehouseId: "$warehouseId",
        },
        totalIn: {
          $sum: {
            $cond: [{ $eq: ["$type", "IN"] }, "$quantity", 0],
          },
        },
        totalOut: {
          $sum: {
            $cond: [{ $eq: ["$type", "OUT"] }, "$quantity", 0],
          },
        },
      },
    },
    {
      $project: {
        _id: 0,
        materialId: "$_id.materialId",
        warehouseId: "$_id.warehouseId",
        availableStock: {
          $subtract: ["$totalIn", "$totalOut"],
        },
      },
    },
  ]);

  return result;
}

/* =========================================================
🧾 OPTIONAL: STOCK MOVEMENT HISTORY
========================================================= */
export async function getStockLedger({
  materialId,
  warehouseId,
  limit = 50,
}: any) {
  const query: any = {};

  if (materialId) query.materialId = toObjectId(materialId);
  if (warehouseId) query.warehouseId = toObjectId(warehouseId);

  return StockLedger.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
}
