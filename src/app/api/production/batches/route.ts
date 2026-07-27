import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import { Types } from "mongoose";
import ProductionBatch from "@/models/ProductionBatch";
import ProductionOrder from "@/models/ProductionOrder";

export async function GET(req: NextRequest) {
  try {
    const h = await headers();
    const userId = h.get("x-user-id");
    if (!userId)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await connectDB();

    const { searchParams } = new URL(req.url);
    const businessId = searchParams.get("businessId");
    const status = searchParams.get("status");
    const orderId = searchParams.get("orderId");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");

    if (!businessId) {
      return NextResponse.json(
        { error: "businessId is required" },
        { status: 400 }
      );
    }

    const query: Record<string, unknown> = {
      businessId: new Types.ObjectId(businessId),
    };
    if (status) query.status = status;
    if (orderId) query.productionOrderId = new Types.ObjectId(orderId);

    const [batches, total] = await Promise.all([
      ProductionBatch.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      ProductionBatch.countDocuments(query),
    ]);

    // Enrich with order info
    const orderIds = [
      ...new Set(batches.map((b) => String((b as any).productionOrderId))),
    ];
    const orders = await ProductionOrder.find({
      _id: { $in: orderIds.map((oid) => new Types.ObjectId(oid)) },
    })
      .select("orderNumber productName productSku")
      .lean();

    const orderMap = Object.fromEntries(
      orders.map((o) => [String((o as any)._id), o])
    );

    const enriched = batches.map((b) => ({
      ...b,
      order: orderMap[String((b as any).productionOrderId)] || null,
    }));

    // Summary
    const [runningCount, completedCount, failedCount] = await Promise.all([
      ProductionBatch.countDocuments({
        businessId: new Types.ObjectId(businessId),
        status: "RUNNING",
      }),
      ProductionBatch.countDocuments({
        businessId: new Types.ObjectId(businessId),
        status: "COMPLETED",
      }),
      ProductionBatch.countDocuments({
        businessId: new Types.ObjectId(businessId),
        status: "FAILED",
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: enriched,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
      summary: { runningCount, completedCount, failedCount },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
