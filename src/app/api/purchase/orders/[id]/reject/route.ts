import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import PurchaseOrder from "@/models/PurchaseOrder";

/* =========================================================
 * REJECT PURCHASE ORDER
 * =======================================================*/
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getEnrichedSession();

    if (!session?.user || !session.business) {
      return NextResponse.json(
        { error: "Unauthorized or missing business context" },
        { status: 401 }
      );
    }

    requirePermission(session as any, "purchase.approve");

    const { id: orderId } = await context.params;
    const body = await req.json();

    const { reason } = body;

    if (!reason) {
      return NextResponse.json(
        { error: "Rejection reason is required" },
        { status: 400 }
      );
    }

    const order = await PurchaseOrder.findOne({
      _id: new Types.ObjectId(orderId),
      businessId: new Types.ObjectId(
        session.business.businessId
      ),
      isDeleted: false,
    });

    if (!order) {
      return NextResponse.json(
        { error: "Purchase order not found" },
        { status: 404 }
      );
    }

    if (order.status !== "DRAFT" && order.status !== "PENDING") {
      return NextResponse.json(
        {
          error:
            "Only DRAFT or PENDING orders can be rejected",
        },
        { status: 400 }
      );
    }

    /**
     * REJECTION ACTION
     */
    order.status = "REJECTED";
    order.rejectedBy = new Types.ObjectId(session.user.id);
    order.rejectedAt = new Date();
    order.rejectionReason = reason;

    await order.save();

    return NextResponse.json({
      success: true,
      message: "Purchase order rejected successfully",
      data: order,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error:
          error.message || "Internal Server Error",
      },
      { status: 500 }
    );
  }
}
