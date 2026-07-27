import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getInventoryValuation } from "@/services/stockValuation.service";

export async function GET(req: Request) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);

    const businessId = searchParams.get("businessId");

    const data = await getInventoryValuation({ businessId });

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
