import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import StockLedger from "@/models/StockLedger";
// Required for .populate(...) below -- model must be registered before populate can resolve it.
import "@/models/Material";
import "@/models/Warehouse";

export async function GET() {
  await connectDB();

  const data = await StockLedger.find()
    .populate("materialId")
    .populate("warehouseId")
    .sort({ createdAt: -1 });

  return NextResponse.json({ success: true, data });
}
