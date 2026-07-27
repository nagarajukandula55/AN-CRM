import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import StockLedger from "@/models/StockLedger";

export async function GET() {
  try {
    await connectDB();

    const data = await StockLedger.aggregate([
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

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err.message },
      { status: 500 }
    );
  }
}
